/* A tiny test runner, and the fakes the suite needs.
 *
 * No framework and no build step, because there is nothing to build: the app is
 * one HTML file whose functions hang off `window`. The runner loads that file in
 * an iframe and calls them there, which is the only place they exist.
 *
 * Everything that would reach the network is replaced. `sb` is the Supabase
 * client; the fake below records every write and answers reads from whatever the
 * test set up, so a test can assert on the shape of what *would* have been sent
 * without a row ever moving. Nothing here talks to the real project.
 */
(function (root) {
  'use strict';

  // ---------------------------------------------------------------- runner ---
  var suites = [], current = null;

  function describe(name, fn) {
    current = { name: name, tests: [], before: null };
    suites.push(current);
    fn();
    current = null;
  }
  /* `timeoutMs` is for the rare test that legitimately takes a while — the
     handler audit opens all 18 pages, and on a machine whose DNS is slow to
     fail, every page waits out its own network calls. Everything else keeps
     the default, so a genuine hang is still caught quickly. */
  function it(name, fn, timeoutMs) {
    if (!current) throw new Error('it() outside describe()');
    current.tests.push({ name: name, fn: fn, timeoutMs: timeoutMs });
  }
  function beforeEach(fn) {
    if (!current) throw new Error('beforeEach() outside describe()');
    current.before = fn;
  }

  // --------------------------------------------------------------- asserts ---
  function fail(msg, actual, expected) {
    var e = new Error(msg + '\n  expected: ' + JSON.stringify(expected) +
                            '\n  actual:   ' + JSON.stringify(actual));
    e.isAssertion = true;
    throw e;
  }
  var expect = function (actual) {
    return {
      toBe: function (v, why) {
        if (actual !== v) fail(why || 'not strictly equal', actual, v);
      },
      toEqual: function (v, why) {
        if (JSON.stringify(actual) !== JSON.stringify(v)) fail(why || 'not deeply equal', actual, v);
      },
      toContain: function (v, why) {
        var ok = (actual == null) ? false
               : (typeof actual === 'string') ? actual.indexOf(v) > -1
               : Array.prototype.indexOf.call(actual, v) > -1;
        if (!ok) fail(why || 'does not contain', actual, v);
      },
      notToContain: function (v, why) {
        var hit = (actual == null) ? false
                : (typeof actual === 'string') ? actual.indexOf(v) > -1
                : Array.prototype.indexOf.call(actual, v) > -1;
        if (hit) fail(why || 'should not contain', actual, v);
      },
      toBeTruthy: function (why) { if (!actual) fail(why || 'expected truthy', actual, true); },
      toBeFalsy:  function (why) { if (actual)  fail(why || 'expected falsy',  actual, false); },
      toBeType:   function (t, why) {
        if (typeof actual !== t) fail(why || 'wrong type', typeof actual, t);
      }
    };
  };

  // ------------------------------------------------------------ supabase fake --
  /* Mirrors just enough of the client's shape: every builder method returns the
     same object so calls chain in any order, and the object is thenable so
     `await` resolves it. `maybeSingle` and `then` both hand back whatever the
     test queued for that table. */
  function makeSb(plan) {
    var calls = [];               // every read, in order
    var writes = [];              // every insert/update/delete, in order

    function result(table, op) {
      var byOp = plan[table] && plan[table][op];
      var any  = plan[table] && plan[table]._;
      var r = (byOp !== undefined) ? byOp : (any !== undefined ? any : { data: [], error: null });
      return typeof r === 'function' ? r() : r;
    }

    function chain(table, op, args) {
      var node = { _table: table, _op: op, _filters: [] };
      ['select', 'eq', 'neq', 'or', 'not', 'in', 'order', 'limit', 'gte', 'lte', 'is']
        .forEach(function (k) {
          node[k] = function () {
            node._filters.push(k + '(' + Array.prototype.slice.call(arguments).join(',') + ')');
            return node;
          };
        });
      node.insert = function (row) { writes.push({ table: table, op: 'insert', row: row }); return chain(table, 'insert'); };
      node.update = function (row) { writes.push({ table: table, op: 'update', row: row }); return chain(table, 'update'); };
      node.delete = function ()    { writes.push({ table: table, op: 'delete' });           return chain(table, 'delete'); };
      node.upsert = function (row) { writes.push({ table: table, op: 'upsert', row: row }); return chain(table, 'upsert'); };

      function settle() {
        calls.push({ table: table, op: node._op, filters: node._filters.slice() });
        return Promise.resolve(result(table, node._op));
      }
      node.maybeSingle = settle;
      node.single = settle;
      node.then = function (res, rej) { return settle().then(res, rej); };
      return node;
    }

    return {
      from: function (t) { return chain(t, 'select'); },
      rpc: function (name, args) {
        calls.push({ rpc: name, args: args });
        var r = plan._rpc && plan._rpc[name];
        return Promise.resolve(typeof r === 'function' ? r(args) : (r || { data: null, error: null }));
      },
      auth: {
        getSession: function () { return Promise.resolve({ data: { session: plan._session || null } }); },
        getUser:    function () { return Promise.resolve({ data: { user: (plan._session || {}).user || null } }); },
        onAuthStateChange: function () { return { data: { subscription: { unsubscribe: function () {} } } }; },
        signOut:    function () { return Promise.resolve({ error: null }); }
      },
      storage: { from: function () { return {
        upload: function () { return Promise.resolve({ data: { path: 'fake/path.jpg' }, error: null }); },
        getPublicUrl: function (p) { return { data: { publicUrl: 'https://fake.test/' + p } }; }
      }; } },
      _calls: calls,
      _writes: writes
    };
  }

  // PostgREST's real error shapes, so the missing-table checks are tested
  // against what the server actually sends rather than what we imagine it does.
  var ERR = {
    tableMissing: { code: 'PGRST205', message: "Could not find the table 'public.x' in the schema cache" },
    fnMissing:    { code: 'PGRST202', message: 'Could not find the function public.x' },
    rlsRefused:   { code: '42501',    message: 'new row violates row-level security policy' },
    // what profiles.insert really answered while company_name was still NOT NULL
    notNull:      { code: '23502',    message: 'null value in column "company_name" of relation "profiles" violates not-null constraint' }
  };

  // ------------------------------------------------------------------- run ---
  /* A test that never settles used to take the whole run with it: the report
     stopped mid-group and nothing said which test it was in, which is the least
     useful failure a suite can produce. A watchdog turns it into an ordinary
     named failure and lets the rest of the run finish. The timed-out test's own
     promise is left to its fate — it cannot be cancelled, and by then the run
     has moved on. */
  /* Generous on purpose. A browser throttles timers in a tab that is not on
     screen, so a test that waits 300ms for a render can take a minute there —
     a tighter budget reports that as a hang, which is a lie. This is a net for
     a promise that never settles at all, not a performance budget. */
  var TEST_TIMEOUT_MS = 120000;
  function withTimeout(p, name, ms) {
    var limit = ms || TEST_TIMEOUT_MS, timer;
    return Promise.race([
      Promise.resolve(p).then(function (v) { clearTimeout(timer); return v; },
                              function (e) { clearTimeout(timer); throw e; }),
      new Promise(function (_, reject) {
        timer = setTimeout(function () {
          var e = new Error('ค้างเกิน ' + Math.round(limit / 1000) + ' วินาที — ' +
                            'this test never settled: ' + name);
          e.isAssertion = true;
          reject(e);
        }, limit);
      })
    ]);
  }

  async function run(win, report) {
    var passed = 0, failed = 0, results = [];
    for (var s = 0; s < suites.length; s++) {
      var suite = suites[s];
      var group = { name: suite.name, tests: [] };
      for (var t = 0; t < suite.tests.length; t++) {
        var test = suite.tests[t], rec = { name: test.name, ok: true, err: null };
        try {
          if (suite.before) await suite.before(win);
          await withTimeout(test.fn(win), suite.name + ' › ' + test.name, test.timeoutMs);
          passed++;
        } catch (e) {
          rec.ok = false;
          rec.err = (e && e.message) || String(e);
          if (e && e.stack && !e.isAssertion) rec.err += '\n' + e.stack.split('\n').slice(0, 3).join('\n');
          failed++;
        }
        group.tests.push(rec);
        if (report) report(group.name, rec);
      }
      results.push(group);
    }
    return { passed: passed, failed: failed, results: results };
  }

  root.KX = { describe: describe, it: it, beforeEach: beforeEach, expect: expect,
              makeSb: makeSb, ERR: ERR, run: run, suites: suites };
})(window);
