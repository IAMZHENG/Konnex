/* The suite. `w` is the app's window — every test calls the real functions in
 * the real page, with the network faked out.
 *
 * What is tested here is what can be told right from wrong: the shape of what
 * gets written to the database, the state a control lands in, the order a list
 * comes out in, and the branches that decide what a viewer is allowed to see.
 * See README.md for what is deliberately not covered.
 */
(function (KX) {
  'use strict';
  var describe = KX.describe, it = KX.it, expect = KX.expect, ERR = KX.ERR;

  var ME    = '00000000-0000-0000-0000-0000000000me';
  var OTHER = '00000000-0000-0000-0000-000000000oth';
  var THIRD = '00000000-0000-0000-0000-00000000thrd';

  function signIn(w, id) { w.kxSession = { fake: true, user: { id: id || ME } }; }
  function plan(w, p) { var sb = KX.makeSb(p); w.sb = sb; return sb; }
  function restore(w) { w.sb = w.__realSb; }

  // =========================================================== pure helpers ===
  describe('kxTableMissing — which errors mean "migration not run"', function () {
    it('recognises a missing table by code, not by SQL wording', function (w) {
      expect(w.kxTableMissing(ERR.tableMissing)).toBe(true, 'PGRST205 is a missing table');
    });
    it('recognises a missing function', function (w) {
      expect(w.kxTableMissing(ERR.fnMissing)).toBe(true, 'PGRST202 is a missing function');
    });
    it('does not mistake an RLS refusal for a missing table', function (w) {
      expect(w.kxTableMissing(ERR.rlsRefused)).toBe(false,
        '42501 means the row was refused, which is the policy working');
    });
    it('survives a null error', function (w) {
      expect(!!w.kxTableMissing(null)).toBe(false);
    });
  });

  // ========================================================== html builders ===
  describe('kxGalleryHTML — the post gallery', function () {
    it('shows at most four cells but carries every url', function (w) {
      var six = ['a','b','c','d','e','f'].map(function (n, i) { return { url: n + '.jpg', sort: i }; });
      var html = w.kxGalleryHTML(six);
      var cells = (html.match(/kx-gcell/g) || []).length;
      expect(cells <= 4).toBeTruthy('no more than four cells, got ' + cells);
      expect(html).toContain('f.jpg', 'the sixth image must still be reachable from data-all');
    });
    it('marks how many are hidden', function (w) {
      var html = w.kxGalleryHTML(['a','b','c','d','e','f'].map(function (n, i) { return { url: n + '.jpg', sort: i }; }));
      expect(html).toContain('+2', 'six images with four cells leaves two behind');
    });
    it('renders nothing for an empty list', function (w) {
      expect(w.kxGalleryHTML([])).toBe('', 'no images means no gallery markup');
      expect(w.kxGalleryHTML(null)).toBe('', 'and null must not throw');
    });
    it('orders by sort, not by array position', function (w) {
      var html = w.kxGalleryHTML([{ url: 'second.jpg', sort: 2 }, { url: 'first.jpg', sort: 1 }]);
      expect(html.indexOf('first.jpg') < html.indexOf('second.jpg')).toBeTruthy('sort 1 comes first');
    });
  });

  describe('kxFilesSummary — the attachment pill', function () {
    var one = [{ file_name: 'drawing.pdf', file_kind: 'pdf', file_url: '#', file_size: 1 }];
    it('names the label and the count', function (w) {
      var html = w.kxFilesSummary(one, 'ที่คุณแนบ');
      expect(html).toContain('ที่คุณแนบ');
      expect(html).toContain('1 ไฟล์');
    });
    it('drops the "กดเพื่อดู" tail in compact form', function (w) {
      expect(w.kxFilesSummary(one, 'ที่คุณแนบ', true)).notToContain('กดเพื่อดู',
        'compact is what lets two pills share a row');
      expect(w.kxFilesSummary(one, 'ที่คุณแนบ')).toContain('กดเพื่อดู',
        'the normal form keeps it');
    });
    it('renders nothing when there are no files', function (w) {
      expect(w.kxFilesSummary([], 'x')).toBe('');
      expect(w.kxFilesSummary(null, 'x')).toBe('');
    });
    it('escapes a file name that looks like markup', function (w) {
      var html = w.kxFilesSummary([{ file_name: '<img onerror=x>', file_kind: 'pdf', file_url: '#', file_size: 1 }], 'x');
      expect(html).notToContain('<img onerror', 'a file name must never reach the page as markup');
    });
  });

  describe('kxCardThumbHTML — the one-at-a-time carousel on list cards', function () {
    it('starts on the first image and carries the rest', function (w) {
      var html = w.kxCardThumbHTML([{ url: 'a.jpg', sort: 1 }, { url: 'b.jpg', sort: 2 }], 'cls');
      expect(html).toContain('data-i="0"', 'starts at the first');
      expect(html).toContain('b.jpg', 'the second is loaded, not fetched on demand');
    });
    it('falls back to the Konnex mark rather than leaving a hole', function (w) {
      // a list card is a fixed-height row; an empty thumb column would collapse it
      var html = w.kxCardThumbHTML([], 'cls');
      expect(html).toContain('konnex-mark', 'no images still needs something in the frame');
      expect(html).toContain('data-i="0"');
    });
  });

  describe('kxPostCardHTML — the feed card', function () {
    function post(over) {
      var p = { id: 'p1', kind: 'rfq', title: 'ชื่อเรื่อง', description: 'รายละเอียด', status: 'open',
                owner_id: OTHER, province: 'ชลบุรี', category_id: 'mfg',
                created_at: '2026-08-24T00:00:00Z', deadline: '2026-09-24T00:00:00Z',
                price_high: 100, quote_count: 3, request_count: 0,
                profiles: { company_name: 'บจก. ทดสอบ' },
                post_images: [], post_attachments: [], quotes: [] };
      for (var k in (over || {})) p[k] = over[k];
      return p;
    }
    it('stamps the real posting time so ordering never reads it back off the page', function (w) {
      var html = w.kxPostCardHTML(post());
      expect(html).toContain('data-created="' + (+new Date('2026-08-24T00:00:00Z')) + '"');
    });
    it('marks buy and sell distinctly', function (w) {
      expect(w.kxPostCardHTML(post({ kind: 'rfq' }))).toContain('data-type="buy"');
      expect(w.kxPostCardHTML(post({ kind: 'offer' }))).toContain('data-type="sell"');
    });
    it('takes the offer count from the counter column, not from the embed', function (w) {
      // quotes is empty because the rows are private; quote_count is public
      var html = w.kxPostCardHTML(post({ quote_count: 7, quotes: [] }));
      expect(html).toContain('>7<', 'the public counter is what a stranger can see');
    });
    it('escapes a title that looks like markup', function (w) {
      expect(w.kxPostCardHTML(post({ title: '<script>x</' + 'script>' }))).notToContain('<script>x<');
    });
  });

  // ============================================================ feed ordering ===
  describe('kxRankFeed — the sort chip decides, and ล่าสุด means posting time', function () {
    var H = 3600000;
    function seed(w, specs) {
      var list = w.document.querySelector('#page-feed .feed-list');
      var now = Date.now();
      list.innerHTML = specs.map(function (s) {
        return '<div class="post-card" data-type="' + s.type + '" data-cat="' + (s.cat || 'other') +
          '" data-deadline="10" data-location="ชลบุรี" data-created="' + (now - s.hoursAgo * H) + '">' +
          '<div class="pc-head"><span class="pc-who"><span class="pc-nameline">' +
          '<span class="pp-name">' + (s.poster || 'บ.') + '</span></span>' +
          '<span class="pc-sub">' + s.hoursAgo + ' ชั่วโมงที่แล้ว</span></span></div>' +
          '<div class="pc-text"><div class="post-title">' + s.title + '</div></div>' +
          '<div class="pc-stats"><b class="offer-num">' + (s.offers || 0) + '</b>' +
          '<b class="pc-price-num">100</b></div></div>';
      }).join('');
      return list;
    }
    function titles(w) {
      return Array.prototype.map.call(
        w.document.querySelectorAll('#page-feed .feed-list .post-card'),
        function (c) { return c.querySelector('.post-title').textContent; });
    }
    // deliberately interleaved buy/sell, handed over out of order
    var SPECS = [
      { title: '4', type: 'sell', hoursAgo: 4, offers: 1 },
      { title: '1', type: 'buy',  hoursAgo: 1, offers: 9 },
      { title: '3', type: 'buy',  hoursAgo: 3, offers: 5 },
      { title: '2', type: 'sell', hoursAgo: 2, offers: 3 }
    ];

    it('ล่าสุด is newest-first by posting time', function (w) {
      seed(w, SPECS);
      w.setFeedSort('recent', fakeOpt(w), 'ล่าสุด');
      expect(titles(w)).toEqual(['1', '2', '3', '4'], 'strictly by data-created');
    });
    it('เก่าสุด is the exact reverse', function (w) {
      seed(w, SPECS);
      w.setFeedSort('oldest', fakeOpt(w), 'เก่าสุด');
      expect(titles(w)).toEqual(['4', '3', '2', '1']);
    });
    it('ข้อเสนอมากสุด sorts by count and breaks ties by time', function (w) {
      seed(w, SPECS);
      w.setFeedSort('offers', fakeOpt(w), 'ข้อเสนอมากสุด');
      expect(titles(w)).toEqual(['1', '3', '2', '4'], '9, 5, 3, 1');
    });
    it('does not group buy and sell in the default order', function (w) {
      seed(w, SPECS);
      w.setFeedSort('recent', fakeOpt(w), 'ล่าสุด');
      var types = Array.prototype.map.call(
        w.document.querySelectorAll('#page-feed .feed-list .post-card'),
        function (c) { return c.dataset.type; });
      expect(types).toEqual(['buy', 'sell', 'buy', 'sell'], 'interleaved exactly as posted');
    });
    it('hides a post whose deadline has passed', function (w) {
      var list = seed(w, SPECS);
      list.firstChild.setAttribute('data-deadline', '0');
      w.kxRankFeed();
      expect(list.firstChild.style.display).toBe('none', 'a job past its deadline is not a job');
    });
    // setFeedSort wants an element to mark active; any option node in the menu will do
    function fakeOpt(w) {
      var menu = w.document.querySelector('#fddSort .fdd-menu');
      return menu ? menu.firstElementChild : null;
    }
  });

  // ======================================================= profile: the tabs ===
  describe('pfShowSection — which cards belong to which tab', function () {
    function cards(w) {
      return Array.prototype.filter.call(
        w.document.querySelectorAll('#page-company-profile .left > .card'),
        function (c) { return c.style.display !== 'none'; }).map(function (c) { return c.id || 'about'; });
    }
    it('ภาพรวม hides the cards that belong to other tabs', function (w) {
      w.pfShowSection('overview');
      expect(cards(w)).notToContain('pfServicesCard', 'บริการของฉัน has its own tab');
      expect(cards(w)).notToContain('pfWinsCard', 'and so does ผลงานสะสม');
    });
    it('a card can belong to two tabs at once', function (w) {
      w.pfShowSection('overview');
      expect(cards(w)).toContain('pfReviewsCard', 'รีวิว is read on ภาพรวม');
      w.pfShowSection('reviews');
      expect(cards(w)).toContain('pfReviewsCard', 'and on its own tab — the same card');
    });
    it('stamps the tab so the two-column board only applies to ภาพรวม', function (w) {
      var left = w.document.querySelector('#page-company-profile .left');
      w.pfShowSection('overview');
      expect(left.getAttribute('data-pf-tab')).toBe('overview');
      expect(w.getComputedStyle(left).display).toBe('grid', 'ภาพรวม is the board');
      w.pfShowSection('reviews');
      expect(w.getComputedStyle(left).display).toBe('flex', 'one card alone is not a two-column grid');
    });
    it('does not un-hide a card that was hidden for a reason', function (w) {
      var skills = w.document.getElementById('pfSkillsCard');
      w.pfMarkHidden(skills, true);
      w.pfShowSection('overview');
      expect(skills.style.display).toBe('none',
        'belonging to the section is not enough to bring back an empty or guest-hidden card');
      w.pfMarkHidden(skills, false);
      w.pfShowSection('overview');
      expect(skills.style.display).toBe('', 'and clearing the mark brings it back');
    });
  });

  describe('the ภาพรวม board pairs six cards and leaves the lists full width', function () {
    /* Measured rather than read off the stylesheet: the computed value for a
       full-width item is spelled differently by different engines, and what the
       page has to get right is the width on screen, not the spelling. */
    function widths(w, ids) {
      /* Signed in, because navigateTo is wrapped by the auth gate and sends a
         visitor without a session to page-auth — and the page has to be the
         visible one, since everything inside a display:none page measures 0 and
         0 >= 0 would call every card full width. */
      signIn(w);
      w.navigateTo('page-company-profile');
      w.pfShowSection('overview');
      var left = w.document.querySelector('#page-company-profile .left');
      var full = Math.round(left.getBoundingClientRect().width);
      if (!full) throw new Error('the profile page is not laid out — nothing to measure');
      return ids.map(function (id) {
        var el = w.document.getElementById(id);
        el.removeAttribute('data-pf-hide'); el.style.display = '';
        return { id: id, spans: Math.round(el.getBoundingClientRect().width) >= full - 2 };
      });
    }
    it('puts the six identity cards in a column each', function (w) {
      var r = widths(w, ['pfContactCard','pfReviewsCard','pfVerifyCard','pfSkillsCard','pfCertCard']);
      var wrong = r.filter(function (x) { return x.spans; }).map(function (x) { return x.id; });
      expect(wrong).toEqual([], 'none of the six may take the whole row');
    });
    it('leaves the wall across both columns', function (w) {
      // ผลงานล่าสุด used to be here too; it is hidden now, so forcing it visible
      // to measure it would only put back the attribute that keeps it down
      var r = widths(w, ['pfWallCard']);
      var wrong = r.filter(function (x) { return !x.spans; }).map(function (x) { return x.id; });
      expect(wrong).toEqual([], 'a list of posts reads badly in half a column');
    });
  });

  // ============================================================ Connect: state ===
  describe('kxRenderConnect — the button reads the relationship back', function () {
    function btn(w) { return w.document.getElementById('pfConnectBtn'); }
    function mountBtn(w) {
      var row = w.document.getElementById('pfHeroActions');
      row.innerHTML = '<button class="btn btn-primary" id="pfConnectBtn" onclick="kxToggleConnect()">＋ Connect</button>';
    }
    async function render(w, row) {
      plan(w, { connections: { select: { data: row, error: null } } });
      mountBtn(w); signIn(w);
      await w.kxRenderConnect(OTHER);
      restore(w);
      return btn(w);
    }
    it('offers to connect when there is no row', async function (w) {
      var b = await render(w, null);
      expect(b.textContent).toContain('Connect');
      expect(b.classList.contains('btn-primary')).toBe(true, 'an action you can take is the loud button');
    });
    it('says waiting when you are the one who asked', async function (w) {
      var b = await render(w, { requester_id: ME, addressee_id: OTHER, status: 'pending' });
      expect(b.textContent).toContain('รอตอบรับ');
      expect(b.classList.contains('btn-primary')).toBe(false, 'reporting a state is the quiet button');
    });
    it('offers to accept when they asked you', async function (w) {
      var b = await render(w, { requester_id: OTHER, addressee_id: ME, status: 'pending' });
      expect(b.textContent).toContain('ตอบรับ');
      expect(b.classList.contains('btn-primary')).toBe(true);
    });
    it('says connected once accepted', async function (w) {
      var b = await render(w, { requester_id: ME, addressee_id: OTHER, status: 'accepted' });
      expect(b.textContent).toContain('เชื่อมต่อแล้ว');
      expect(b.classList.contains('btn-primary')).toBe(false);
    });
    it('still offers to connect when the migration has not been run', async function (w) {
      plan(w, { connections: { select: { data: null, error: ERR.tableMissing } } });
      mountBtn(w); signIn(w);
      await w.kxRenderConnect(OTHER);
      restore(w);
      expect(btn(w).textContent).toContain('Connect', 'the page must not break on a missing table');
    });
  });

  describe('kxToggleConnect — one write per state, and never the wrong one', function () {
    async function click(w, row) {
      var sb = plan(w, { connections: { select: { data: row, error: null },
                                        insert: { data: null, error: null },
                                        update: { data: null, error: null },
                                        delete: { data: null, error: null } } });
      var hero = w.document.getElementById('pfHeroActions');
      hero.innerHTML = '<button id="pfConnectBtn"></button>';
      signIn(w);
      await w.kxRenderConnect(OTHER);   // loads the state the button acts on
      await w.kxToggleConnect();
      restore(w);
      return sb._writes;
    }
    it('sends a request when there is none', async function (w) {
      var writes = await click(w, null);
      expect(writes.length > 0).toBeTruthy('something must be written');
      expect(writes[0].op).toBe('insert');
      expect(writes[0].row.requester_id).toBe(ME, 'you can only ask as yourself');
      expect(writes[0].row.addressee_id).toBe(OTHER);
    });
    it('never sends a status with the request', async function (w) {
      var writes = await click(w, null);
      expect(writes[0].row.status).toBe(undefined,
        'the row must be born pending — the insert policy refuses anything else');
    });
    it('accepts when they were the one who asked', async function (w) {
      var writes = await click(w, { requester_id: OTHER, addressee_id: ME, status: 'pending' });
      expect(writes[0].op).toBe('update');
      expect(writes[0].row).toEqual({ status: 'accepted' });
    });
    it('withdraws your own pending request', async function (w) {
      var writes = await click(w, { requester_id: ME, addressee_id: OTHER, status: 'pending' });
      expect(writes[0].op).toBe('delete');
    });
    it('disconnects an accepted one', async function (w) {
      var writes = await click(w, { requester_id: ME, addressee_id: OTHER, status: 'accepted' });
      expect(writes[0].op).toBe('delete');
    });
    it('re-reads the state after writing instead of assuming it landed', async function (w) {
      var sb = plan(w, { connections: { select: { data: null, error: null }, insert: { data: null, error: null } } });
      w.document.getElementById('pfHeroActions').innerHTML = '<button id="pfConnectBtn"></button>';
      signIn(w);
      await w.kxRenderConnect(OTHER);
      var readsBefore = sb._calls.filter(function (c) { return c.table === 'connections'; }).length;
      await w.kxToggleConnect();
      var readsAfter = sb._calls.filter(function (c) { return c.table === 'connections'; }).length;
      restore(w);
      expect(readsAfter > readsBefore + 1).toBeTruthy(
        'a write plus a fresh read — the label must never claim a state the database refused');
    });
  });

  describe('kxConnAnswer — accept, decline, cancel, disconnect', function () {
    async function answer(w, what) {
      var sb = plan(w, { connections: { _: { data: [], error: null } },
                         profiles: { _: { data: [], error: null } },
                         _rpc: { kx_connection_count: { data: 0, error: null } } });
      signIn(w);
      await w.kxConnAnswer(OTHER, ME, what);
      restore(w);
      return sb._writes;
    }
    it('accepting sets the status and nothing else', async function (w) {
      var writes = await answer(w, 'accept');
      expect(writes[0].op).toBe('update');
      expect(writes[0].row).toEqual({ status: 'accepted' });
    });
    it('declining deletes the row', async function (w) {
      expect((await answer(w, 'remove'))[0].op).toBe('delete');
    });
    it('identifies the row by the pair, not by who is reading', async function (w) {
      var sb = plan(w, { connections: { _: { data: [], error: null } },
                         profiles: { _: { data: [], error: null } },
                         _rpc: { kx_connection_count: { data: 0, error: null } } });
      signIn(w);
      await w.kxConnAnswer(OTHER, ME, 'accept');
      var filters = sb._calls.filter(function (c) { return c.table === 'connections' && c.op === 'update'; });
      restore(w);
      expect(JSON.stringify(filters)).toContain(OTHER, 'filtered on requester_id');
      expect(JSON.stringify(filters)).toContain(ME, 'and on addressee_id');
    });
  });

  // ========================================================= Connect: the list ===
  describe('kxOpenConnections — your own list', function () {
    var ROWS = [
      { requester_id: OTHER, addressee_id: ME,    status: 'pending',  created_at: '2026-08-24T10:00:00Z' },
      { requester_id: ME,    addressee_id: THIRD, status: 'pending',  created_at: '2026-08-24T09:00:00Z' },
      { requester_id: THIRD, addressee_id: ME,    status: 'accepted', created_at: '2026-08-23T09:00:00Z' }
    ];
    var PEOPLE = [
      { id: OTHER, company_name: 'บจก. เอ', avatar_url: null, province: 'ชลบุรี',  business_type: 'company' },
      { id: THIRD, company_name: 'ช่างบี',  avatar_url: null, province: 'เชียงใหม่', business_type: 'person' }
    ];
    async function open(w, whose, rows) {
      plan(w, { connections: { _: { data: rows || ROWS, error: null } },
                profiles: { _: { data: PEOPLE, error: null } } });
      signIn(w);
      await w.kxOpenConnections(whose);
      restore(w);
      return w.document.getElementById('connList');
    }
    function heads(box) {
      return Array.prototype.map.call(box.querySelectorAll('.conn-head'),
        function (h) { return h.textContent.replace(/\s*\(\d+\)$/, '').trim(); });
    }
    it('puts what is waiting on you first', async function (w) {
      var box = await open(w);
      expect(heads(box)[0]).toBe('คำขอที่รอคุณตอบรับ', 'the ones with something to do lead');
    });
    it('groups all three states', async function (w) {
      var box = await open(w);
      expect(heads(box).length).toBe(3);
    });
    it('offers accept and decline on an incoming request', async function (w) {
      var box = await open(w);
      var first = box.querySelector('.conn-row');
      var labels = Array.prototype.map.call(first.querySelectorAll('.conn-btn'),
        function (b) { return b.textContent.trim(); });
      expect(labels).toEqual(['ตอบรับ', 'ปฏิเสธ']);
    });
    it('names the other person, not you', async function (w) {
      var box = await open(w);
      var names = Array.prototype.map.call(box.querySelectorAll('.conn-name'),
        function (n) { return n.textContent; });
      expect(names).toContain('บจก. เอ');
      expect(names).notToContain('ผู้ใช้ Konnex', 'every id in the fake has a profile');
    });
    it('says so plainly when the list is empty', async function (w) {
      var box = await open(w, null, []);
      expect(box.textContent).toContain('ยังไม่มีการเชื่อมต่อ');
    });
    it('explains a missing table instead of showing an empty list', async function (w) {
      plan(w, { connections: { _: { data: null, error: ERR.tableMissing } } });
      signIn(w);
      await w.kxOpenConnections();
      restore(w);
      expect(w.document.getElementById('connList').textContent).toContain('connections.sql');
    });
  });

  describe("kxOpenConnections — someone else's list is public but read-only", function () {
    var ROWS = [
      { requester_id: THIRD, addressee_id: OTHER, status: 'accepted', created_at: '2026-08-23T09:00:00Z' }
    ];
    var PEOPLE = [
      { id: THIRD, company_name: 'ช่างบี', avatar_url: null, province: 'เชียงใหม่', business_type: 'person' },
      { id: ME,    company_name: 'ฉันเอง', avatar_url: null, province: 'ชลบุรี',   business_type: 'company' }
    ];
    async function open(w, rows) {
      var sb = plan(w, { connections: { _: { data: rows || ROWS, error: null } },
                         profiles: { _: { data: PEOPLE, error: null } } });
      signIn(w);
      w.kxProfileViewingName = 'บจก. เอ';
      await w.kxOpenConnections(OTHER);
      restore(w);
      return { box: w.document.getElementById('connList'), sb: sb };
    }
    it('asks only for accepted rows', async function (w) {
      var r = await open(w);
      var q = r.sb._calls.filter(function (c) { return c.table === 'connections'; })[0];
      expect(JSON.stringify(q.filters)).toContain('accepted',
        "your own pending request to them must not appear in their list");
    });
    it('offers no cancel button — their connections are not yours to end', async function (w) {
      var r = await open(w);
      var labels = Array.prototype.map.call(r.box.querySelectorAll('.conn-btn'),
        function (b) { return b.textContent.trim(); });
      expect(labels).notToContain('ยกเลิก');
      expect(labels).notToContain('ปฏิเสธ');
    });
    it('names the person opposite them, not opposite you', async function (w) {
      var r = await open(w);
      var names = Array.prototype.map.call(r.box.querySelectorAll('.conn-name'),
        function (n) { return n.textContent; });
      expect(names).toEqual(['ช่างบี'],
        'the row is THIRD↔OTHER; on OTHER\'s list the other half is THIRD');
    });
    it('shows no group headings — there is only one group', async function (w) {
      var r = await open(w);
      expect(r.box.querySelectorAll('.conn-head').length).toBe(0);
    });
    it('says whose list it is', async function (w) {
      await open(w);
      var sub = w.document.getElementById('connModalSub');
      expect(sub).toBeTruthy('the subtitle needs its id or the heading silently never changes');
      expect(sub.textContent).toContain('บจก. เอ');
    });
  });

  describe('kxOpenConnections — your own list says it is yours', function () {
    it('uses the first-person subtitle', async function (w) {
      plan(w, { connections: { _: { data: [], error: null } }, profiles: { _: { data: [], error: null } } });
      signIn(w);
      await w.kxOpenConnections();
      restore(w);
      expect(w.document.getElementById('connModalSub').textContent).toContain('คุณ');
    });
  });

  describe('kxLoadConnectionCount — the number on the hero strip', function () {
    function mount(w) {
      var strip = w.document.querySelector('#page-company-profile .hero-statstrip');
      strip.insertAdjacentHTML('beforeend', '<div class="hss" id="pfConnStat" style="display:none;"></div>');
      return w.document.getElementById('pfConnStat');
    }
    it('shows the count from the database', async function (w) {
      var cell = mount(w);
      plan(w, { _rpc: { kx_connection_count: { data: 5, error: null } },
                connections: { _: { data: [], error: null } } });
      signIn(w);
      await w.kxLoadConnectionCount(ME, true);
      restore(w);
      expect(cell.textContent).toContain('5');
      expect(cell.style.display).toBe('');
      cell.remove();
    });
    it('badges pending requests on your own profile', async function (w) {
      var cell = mount(w);
      plan(w, { _rpc: { kx_connection_count: { data: 2, error: null } },
                connections: { _: { data: [{ requester_id: OTHER }, { requester_id: THIRD }], error: null } } });
      signIn(w);
      await w.kxLoadConnectionCount(ME, true);
      restore(w);
      expect(cell.querySelector('.conn-pend')).toBeTruthy('two people are waiting on an answer');
      expect(cell.querySelector('.conn-pend').textContent).toContain('2');
      cell.remove();
    });
    it('shows no pending badge on someone else\'s profile', async function (w) {
      var cell = mount(w);
      plan(w, { _rpc: { kx_connection_count: { data: 2, error: null } },
                connections: { _: { data: [{ requester_id: OTHER }], error: null } } });
      signIn(w);
      await w.kxLoadConnectionCount(OTHER, false);
      restore(w);
      expect(cell.querySelector('.conn-pend')).toBeFalsy('who is waiting on them is their business');
      cell.remove();
    });
    it('hides itself rather than showing a wrong zero when the function is missing', async function (w) {
      var cell = mount(w);
      plan(w, { _rpc: { kx_connection_count: { data: null, error: ERR.fnMissing } } });
      signIn(w);
      await w.kxLoadConnectionCount(ME, true);
      restore(w);
      expect(cell.style.display).toBe('none', '0 connections and "cannot tell" are different claims');
      cell.remove();
    });
  });

  // ========================================================= profile the row ===
  describe('kxProfileFromRow — the profiles row fills the form', function () {
    function row(over) {
      var r = { id: ME, company_name: 'บจก. ทดสอบ', about: 'เกี่ยวกับ', phone: '02', email: 'a@b.c',
                address: 'ชลบุรี', province: 'ชลบุรี', business_type: 'company',
                industry: 'ผู้ผลิต / รับจ้างผลิต', founded_year: 2016, employees: '25 - 50 คน',
                capital: '5,000,000', skills: ['CNC'], areas: [], certs: [] };
      for (var k in (over || {})) r[k] = over[k];
      return r;
    }
    it('carries province both ways', function (w) {
      w.kxProfileFromRow(row({ province: 'น่าน' }));
      expect(w.kxProfileData().province).toBe('น่าน');
      var sel = w.document.getElementById('pfProvince');
      expect(sel.value).toBe('น่าน', 'and reaches the field on the edit form');
    });
    it('clears the field for a province the list does not have', function (w) {
      w.kxProfileFromRow(row({ province: 'ไม่มีจังหวัดนี้' }));
      expect(w.document.getElementById('pfProvince').value).toBe('',
        'better blank than a stale selection that looks chosen');
    });
    it('clears the field for a null province', function (w) {
      w.kxProfileFromRow(row({ province: null }));
      expect(w.document.getElementById('pfProvince').value).toBe('');
    });
    it('writes the name into the edit field, not the service modal', function (w) {
      w.kxProfileFromRow(row({ company_name: 'ชื่อจริง' }));
      expect(w.document.getElementById('epName').value).toBe('ชื่อจริง',
        'both used to be id="pfName" and getElementById returned the modal');
    });
    it('does not blank a column the row does not carry', function (w) {
      w.kxProfileFromRow(row({ phone: '0811111111' }));
      w.kxProfileFromRow({ id: ME, company_name: 'บจก. ทดสอบ' });   // partial row
      expect(w.kxProfileData().phone).toBe('0811111111', 'absent is not the same as empty');
    });
  });

  // ======================================================== the composer form ===
  describe('the post composer asks where the work is', function () {
    it('offers every province plus ไม่ระบุ', function (w) {
      w.cpNewPost();
      var sel = w.document.getElementById('cpProv');
      expect(sel.options.length).toBe(78, '77 provinces and ไม่ระบุ');
      expect(sel.options[0].value).toBe('ไม่ระบุ');
    });
    it('pre-fills from your profile but does not force it', function (w) {
      w.kxCurrentUser = { id: ME, province: 'ระยอง', business_type: 'company' };
      w.cpNewPost();
      expect(w.document.getElementById('cpProv').value).toBe('ระยอง',
        'a company in one province can still need the work done in another');
    });
    it('falls back to ไม่ระบุ when the profile has no province', function (w) {
      w.kxCurrentUser = { id: ME, business_type: 'company' };
      w.cpNewPost();
      expect(w.document.getElementById('cpProv').value).toBe('ไม่ระบุ');
    });
  });

  describe('kxReviewableDeals — who you may review', function () {
    function plans(w, minePosts, theirPosts) {
      var i = 0;
      return plan(w, { posts: { select: function () {
        return { data: (i++ === 0) ? minePosts : theirPosts, error: null };
      } } });
    }
    /* With no winner and no recorded outcome, "we did business" is not something
       Konnex can see. What it can see is that the two of you dealt with each
       other on one listing — they quoted on yours, or you quoted on theirs. */
    it('counts a supplier who quoted on your listing', async function (w) {
      signIn(w);
      plans(w, [{ id: 'p1', title: 'งาน', quotes: [{ bidder_id: OTHER }] }], []);
      var deals = await w.kxReviewableDeals(OTHER);
      restore(w);
      expect(deals.length).toBe(1);
    });
    it('counts a listing of theirs that you quoted on', async function (w) {
      signIn(w);
      plans(w, [], [{ id: 'p2', title: 'งานเขา', quotes: [{ bidder_id: ME }] }]);
      var deals = await w.kxReviewableDeals(OTHER);
      restore(w);
      expect(deals.length).toBe(1, 'reviewing runs both ways');
    });
    it('does not count a listing neither of you touched', async function (w) {
      signIn(w);
      plans(w, [{ id: 'p1', title: 'งาน', quotes: [{ bidder_id: THIRD }] }], []);
      var deals = await w.kxReviewableDeals(OTHER);
      restore(w);
      expect(deals.length).toBe(0, 'a third party quoting is not your dealing with them');
    });
    it('offers each listing once, so one review per deal still holds', async function (w) {
      signIn(w);
      plans(w, [{ id: 'p1', title: 'งาน', quotes: [{ bidder_id: OTHER }, { bidder_id: OTHER }] }], []);
      var deals = await w.kxReviewableDeals(OTHER);
      restore(w);
      expect(deals.length).toBe(1);
    });
    it('still opens at all — the old rule could never be met again', async function (w) {
      signIn(w);
      // nothing here is marked 'won', because nothing ever will be again
      plans(w, [{ id: 'p1', title: 'งาน', quotes: [{ bidder_id: OTHER, status: 'pending' }] }], []);
      var deals = await w.kxReviewableDeals(OTHER);
      restore(w);
      expect(deals.length).toBe(1,
        'gating on a won quote would have silently killed every review on the site');
    });
  });

  // ============================================ Konnex does not pick winners ===
  describe('a quote carries no verdict', function () {
    it('has no เลือก button, because there is nothing to pick', function (w) {
      expect(typeof w.kxPickWinner).toBe('undefined');
      expect(typeof w.kxSetOutcome).toBe('undefined');
    });
    it('has no status tab strip at all on the seller list', function (w) {
      /* Whether the buyer's listing is still open changes nothing about a quote
         you already sent — you cannot resend it, withdraw it, or act on it
         either way — so splitting the list on it was three tabs and no
         decision. ประเภท stays, because that one names your own role. */
      expect(w.document.querySelectorAll('#page-my-bids .status-tab').length).toBe(0);
      expect(typeof w.switchBidStatusTab).toBe('undefined');
      var origins = Array.prototype.map.call(
        w.document.querySelectorAll('#page-my-bids .origin-tab'),
        function (t) { return t.getAttribute('onclick') || ''; }).join(' ');
      expect(origins).toContain("'rfq'", 'ประเภท is still the one filter here');
      expect(origins).toContain("'offer'");
    });
    it('labels a quote by the listing state, not by a result', async function (w) {
      signIn(w);
      plan(w, { quotes: { _: { data: [
        { id: 'q1', price: 1, status: 'pending', created_at: '2026-08-24T00:00:00Z',
          quote_attachments: [], posts: { id: 'p1', title: 'ยังเปิด', province: 'ชลบุรี',
            status: 'open', deadline: null, post_images: [], profiles: { company_name: 'บ.' } } },
        { id: 'q2', price: 2, status: 'pending', created_at: '2026-08-24T00:00:00Z',
          quote_attachments: [], posts: { id: 'p2', title: 'ปิดแล้ว', province: 'ชลบุรี',
            status: 'closed', deadline: null, post_images: [], profiles: { company_name: 'บ.' } } }
      ], error: null } } });
      await w.kxLoadMyBids();
      restore(w);
      var rows = w.document.querySelectorAll('#page-my-bids .bid-row');
      var states = Array.prototype.map.call(rows, function (r) { return r.dataset.status; });
      expect(states).toEqual(['live', 'ended']);
      var text = w.document.querySelector('#page-my-bids .bid-list').textContent;
      expect(text).notToContain('รอผล', 'no result is coming, so nothing is waiting for one');
      expect(text).notToContain('ไม่ผ่าน');
    });
    it('shows every quote, since nothing filters them by listing state now', async function (w) {
      signIn(w);
      plan(w, { quotes: { _: { data: [
        { id: 'q1', price: 1, status: 'pending', created_at: '2026-08-24T00:00:00Z',
          quote_attachments: [], posts: { id: 'p1', title: 'ยังเปิด', province: 'ชลบุรี',
            status: 'open', deadline: null, post_images: [], profiles: { company_name: 'บ.' } } },
        { id: 'q2', price: 2, status: 'pending', created_at: '2026-08-24T00:00:00Z',
          quote_attachments: [], posts: { id: 'p2', title: 'ปิดแล้ว', province: 'ชลบุรี',
            status: 'closed', deadline: null, post_images: [], profiles: { company_name: 'บ.' } } }
      ], error: null } } });
      await w.kxLoadMyBids();
      restore(w);
      var shown = Array.prototype.filter.call(
        w.document.querySelectorAll('#page-my-bids .bid-row'),
        function (r) { return r.style.display !== 'none'; });
      expect(shown.length).toBe(2, 'removing the strip must not leave rows hidden by a stale filter');
    });
    it('removes the sections only a winner could have filled', function (w) {
      // ผลงานสะสม and ผลงานล่าสุด both listed the RFQs this account was chosen
      // for. They were hidden when the winner went; now they are gone.
      ['pfWinsCard', 'pfRecentCard'].forEach(function (id) {
        expect(w.document.getElementById(id)).toBeFalsy(id + ' could only ever be empty');
      });
      var tabs = w.document.querySelector('#page-company-profile .tabs').textContent;
      expect(tabs).notToContain('ผลงานสะสม', 'a tab that opens onto nothing is worse than no tab');
    });
    it('drops งานสำเร็จ from the profile strip rather than showing a frozen zero', async function (w) {
      signIn(w);
      plan(w, { quotes: { _: { data: [], error: null } } });
      var strip = w.document.querySelector('#page-company-profile .hero-statstrip');
      strip.innerHTML = '';
      await w.kxRenderProfileShell({ id: ME, company_name: 'บ.', rating_count: 0 });
      await new Promise(function (r) { setTimeout(r, 300); });
      restore(w);
      expect(strip.textContent).notToContain('งานสำเร็จ');
    });
  });

  // ==================================================== งานของฉัน has two states ===
  describe('rfqBucket — a post is either still taking quotes or it is not', function () {
    function post(over) {
      var p = { id: 'p1', status: 'open', deadline: null };
      for (var k in (over || {})) p[k] = over[k];
      return p;
    }
    it('has only two buckets — the third, พิจารณา, went with the winner', function (w) {
      var tabs = w.document.querySelectorAll('#page-rfq-offers .status-tabs .status-tab');
      expect(tabs.length).toBe(2);
      var labels = Array.prototype.map.call(tabs, function (t) { return t.textContent; }).join(' ');
      expect(labels).notToContain('พิจารณา',
        'that tab meant "deadline passed, waiting on a winner" — nothing waits any more');
    });
    it('buckets by deadline, not only by the status column', function (w) {
      var future = new Date(Date.now() + 86400000).toISOString();
      var past = new Date(Date.now() - 86400000).toISOString();
      expect(w.rfqBucket(post({ status: 'open', deadline: future }))).toBe('open');
      expect(w.rfqBucket(post({ status: 'open', deadline: past }))).toBe('done',
        'a deadline that has quietly passed closes the post even if nobody updated its status');
    });
    it('a manual close counts as done regardless of the deadline', function (w) {
      var future = new Date(Date.now() + 86400000).toISOString();
      expect(w.rfqBucket(post({ status: 'closed', deadline: future }))).toBe('done');
    });
    it('the card label and the tab bucket always agree — one function decides both', function (w) {
      var past = new Date(Date.now() - 86400000).toISOString();
      var p = post({ status: 'open', deadline: past });
      var cs = w.rfqCardStatus(p);
      expect(cs.done).toBe(true);
      expect(cs.label).toBe('ปิดรับแล้ว');
      expect(w.rfqBucket(p)).toBe('done');
    });
    it('has no duplicate status dropdown — the tab strip is the one control for this', function (w) {
      var chips = Array.prototype.map.call(
        w.document.querySelectorAll('#page-rfq-offers .select-chip'),
        function (c) { return c.textContent.trim(); });
      expect(chips).notToContain('สถานะทั้งหมด',
        'it duplicated the tab strip through a separate, unsynced code path');
      expect(chips).toContain('ล่าสุดก่อน', 'the sort chip is still there');
    });
  });

  // ==================================================== ผลงานที่ผ่านมา (portfolio) ===
  describe('the seller writes their own track record', function () {
    function withRows(w, rows, err) {
      return plan(w, { portfolio: { _: err ? { data: null, error: err } : { data: rows, error: null } } });
    }
    function card(w) { return w.document.getElementById('pfWorkCard'); }
    var TWO = [
      { id: 'w1', title: 'ผลิตชิ้นส่วน CNC', detail: 'อลูมิเนียม 6061', sort: 0,
        images: ['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg', 'e.jpg'] },
      { id: 'w2', title: 'งานกลึงเพลา', detail: null, sort: 1, images: [] }
    ];

    it('lists the work and its detail', async function (w) {
      withRows(w, TWO); signIn(w);
      await w.kxLoadPortfolio(ME, true);
      restore(w);
      var t = card(w).textContent;
      expect(t).toContain('ผลิตชิ้นส่วน CNC');
      expect(t).toContain('อลูมิเนียม 6061');
      expect(t).toContain('งานกลึงเพลา');
    });
    it('shows the photos through the shared gallery, overflow and all', async function (w) {
      withRows(w, TWO); signIn(w);
      await w.kxLoadPortfolio(ME, true);
      restore(w);
      var cells = card(w).querySelectorAll('.pw-gal .kx-gcell');
      expect(cells.length).toBe(4, 'four cells max, like every other gallery in the app');
      expect(card(w).textContent).toContain('+1', 'the fifth photo is still reachable');
    });
    it('renders an entry with no photos at all', async function (w) {
      withRows(w, [{ id: 'w3', title: 'ไม่มีรูป', detail: null, sort: 0, images: [] }]);
      signIn(w);
      await w.kxLoadPortfolio(ME, true);
      restore(w);
      expect(card(w).textContent).toContain('ไม่มีรูป');
      expect(card(w).querySelectorAll('.pw-gal').length).toBe(0, 'no empty frame');
    });
    it('says it is unverified, because a claim is not a review', async function (w) {
      withRows(w, TWO); signIn(w);
      await w.kxLoadPortfolio(ME, true);
      restore(w);
      expect(card(w).textContent).toContain('Konnex ไม่ได้ตรวจสอบ',
        'a buyer weighing this against a review deserves to know which is evidence');
    });
    it('gives the owner the add and delete controls, and a visitor neither', async function (w) {
      withRows(w, TWO); signIn(w);
      await w.kxLoadPortfolio(ME, true);
      expect(card(w).querySelector('.pf-seeall')).toBeTruthy('owner can add');
      expect(card(w).querySelectorAll('.svc-del').length).toBe(2, 'and delete each');
      await w.kxLoadPortfolio(ME, false);
      restore(w);
      expect(card(w).querySelector('.pf-seeall')).toBeFalsy('a visitor edits nothing');
      expect(card(w).querySelectorAll('.svc-del').length).toBe(0);
    });
    it('hides an empty portfolio from visitors but keeps it for the owner', async function (w) {
      withRows(w, []); signIn(w);
      await w.kxLoadPortfolio(ME, false);
      expect(card(w).style.display).toBe('none', 'an empty card teaches a visitor nothing');
      await w.kxLoadPortfolio(ME, true);
      restore(w);
      expect(card(w).style.display).toBe('', 'the owner needs it — it carries the add button');
      expect(card(w).textContent).toContain('เพิ่มผลงาน');
    });
    it('names the missing migration instead of looking like an empty portfolio', async function (w) {
      withRows(w, null, ERR.tableMissing); signIn(w);
      await w.kxLoadPortfolio(ME, true);
      restore(w);
      expect(card(w).textContent).toContain('portfolio.sql');
    });
    it('hides the broken card from visitors rather than explaining our plumbing', async function (w) {
      withRows(w, null, ERR.tableMissing); signIn(w);
      await w.kxLoadPortfolio(ME, false);
      restore(w);
      expect(card(w).style.display).toBe('none');
    });
  });

  describe('adding a piece of work', function () {
    function open(w) { signIn(w); w.kxOpenWork(); }
    it('refuses to save without saying what the work was', async function (w) {
      open(w);
      var sb = plan(w, { portfolio: { _: { data: [], error: null } } });
      w.document.getElementById('pwTitle').value = '';
      await w.kxSaveWork();
      restore(w);
      expect(sb._writes.length).toBe(0, 'title is the one field that carries the entry');
      expect(w.document.getElementById('workModal').classList.contains('open')).toBe(true,
        'and the form stays open rather than losing what was typed');
    });
    it('writes the row under your own id', async function (w) {
      open(w);
      var sb = plan(w, { portfolio: { _: { data: [], error: null } } });
      w.document.getElementById('pwTitle').value = 'ผลิตชิ้นส่วน CNC';
      w.document.getElementById('pwDetail').value = 'อลูมิเนียม 6061';
      await w.kxSaveWork();
      restore(w);
      var row = sb._writes[0].row;
      expect(row.profile_id).toBe(ME, 'the policy refuses any other id anyway');
      expect(row.title).toBe('ผลิตชิ้นส่วน CNC');
      expect(row.detail).toBe('อลูมิเนียม 6061');
    });
    it('asks only for a title, a detail and photos', function (w) {
      open(w);
      var labels = Array.prototype.map.call(
        w.document.querySelectorAll('#workBox .pw-label'), function (l) { return l.textContent.trim(); });
      expect(labels.length).toBe(3, 'ขายให้ใคร and ปี came off the form');
      expect(labels[0]).toContain('ชื่อผลงาน');
      expect(w.document.getElementById('pwBuyer')).toBeFalsy();
      expect(w.document.getElementById('pwYear')).toBeFalsy();
    });
    it('takes more than one photo', function (w) {
      open(w);
      expect(w.document.getElementById('pwImage').multiple).toBe(true,
        'one machine is a wide shot, a close-up and the finished part');
    });
    it('stores a blank detail as null, and photos as an array', async function (w) {
      open(w);
      var sb = plan(w, { portfolio: { _: { data: [], error: null } } });
      w.document.getElementById('pwTitle').value = 'y';
      await w.kxSaveWork();
      restore(w);
      var row = sb._writes[0].row;
      expect(row.detail).toBe(null, 'an empty string is not the same as nothing written');
      expect(row.images).toEqual([], 'the column is text[], never null');
      expect(row.buyer_name).toBe(undefined, 'the field is gone, so nothing may be sent for it');
    });
    it('explains a missing migration rather than failing silently', async function (w) {
      open(w);
      plan(w, { portfolio: { _: { data: null, error: ERR.tableMissing } } });
      w.document.getElementById('pwTitle').value = 'z';
      var said = null, realToast = w.kxToast;
      w.kxToast = function (m) { said = m; };
      await w.kxSaveWork();
      w.kxToast = realToast;
      restore(w);
      expect(said).toContain('portfolio.sql');
    });
  });

  describe('Konnex says เสนอราคา, not ประมูล', function () {
    it('has no ประมูล left anywhere on the page', function (w) {
      var html = w.document.documentElement.innerHTML;
      expect(html).notToContain('ประมูล',
        'Konnex gathers quotes; it does not run an auction and picks no winner');
    });
    /* There used to be two pricing modes and this asserted the page named both.
       There is one behaviour now — a price goes to the post owner and to nobody
       else, enforced by the select policy on `quotes` — so naming a mode is
       naming a choice the poster does not have. */
    it('names no pricing mode, because there is only one behaviour', function (w) {
      var html = w.document.documentElement.innerHTML;
      expect(html).notToContain('เสนอราคาแบบเปิด');
      expect(html).notToContain('เสนอราคาแบบปิด');
    });
  });

  // ============================================================== the sidebar ===
  // ========================================= refreshing onto a page keeps its data ===
  // ================================ no page ships with invented data in its markup ===
  describe('nothing is baked into the markup', function () {
    /* The prototype wrote a worked example straight into the page — a seller
       called Prime CNC, 842 views, a 15,000 ฿ price, two questions with answers.
       Every renderer replaces its own block once a real row loads, so these only
       ever showed in the gap before that: click onto a page and someone else's
       numbers were there first. This sweeps every page with nothing loaded and
       fails on anything that reads as fabricated, so it cannot come back. */
    var pages = ['page-feed', 'page-rfq-offers', 'page-my-offers', 'page-my-bids',
                 'page-my-requests', 'page-dashboard', 'page-messages', 'page-notifications',
                 'page-saved', 'page-history', 'page-company-profile',
                 'page-rfq-detail', 'page-offer-detail'];
    // thousands separators, view/interest counts, star ratings, and the demo cast
    var FABRICATED = /\d{1,3},\d{3}|Prime CNC|ไทยพรีซิชั่น|Apex|สแตนเลส 316|บุญมี|\b\d+ วิว\b|\b\d+ ผู้สนใจ\b|★\s*[\d.]+/;

    it('no page shows invented content before its data arrives', async function (w) {
      signIn(w);
      // every table answers empty, so anything on screen came from the markup
      plan(w, {});
      var offenders = [];
      for (var i = 0; i < pages.length; i++) {
        await w.navigateTo(pages[i]);
        await new Promise(function (r) { setTimeout(r, 120); });
        var page = w.document.getElementById(pages[i]);
        if (!page) continue;
        /* Text nodes, not leaf elements. The first version of this walked
           elements with no children — but every meta row holds an <svg> icon
           after the icon pass, so those elements have children and were skipped.
           A whole demo header sailed through it. A text node is the text. */
        var walker = w.document.createTreeWalker(page, 4 /* SHOW_TEXT */);
        var node;
        while ((node = walker.nextNode())) {
          var t = (node.nodeValue || '').trim();
          if (!t || t.length > 110) continue;
          var el = node.parentElement;
          if (!el || !el.offsetParent) continue;                 // only what shows
          if (el.closest('.kx-empty')) continue;                 // empty states are meant to be there
          if (FABRICATED.test(t)) offenders.push(pages[i] + ': ' + t.slice(0, 50));
        }
      }
      restore(w);
      expect(offenders.slice(0, 6)).toEqual([],
        'a page must be empty until its own data loads, never pre-filled with an example');
    });
  });

  describe('a page you refresh onto still loads', function () {
    /* The bug: the hash router navigates before getSession() resolves, so every
       loader hooked to navigateTo runs while kxSession is still null and returns
       immediately — the page came back empty and nothing asked again. boot() now
       re-navigates once the session is real. These pin the two halves of that. */
    it('every session-gated loader bails out when there is no session', async function (w) {
      w.kxSession = null;
      var sb = plan(w, { posts: { _: { data: [], error: null } },
                         quotes: { _: { data: [], error: null } } });
      await w.kxLoadMyPosts('rfq');
      await w.kxLoadMyBids();
      restore(w);
      expect(sb._calls.length).toBe(0,
        'they must not query as nobody — that is what made the page look empty');
    });
    /* A detail page has no loader hooked to navigateTo — it needs a post id,
       and that id only ever existed as an argument to kxOpenPost. So refreshing
       on a listing restored the page and nothing else: an empty shell that
       re-navigating could not fix. The id lives in the URL now. */
    it('puts the post id in the URL so a listing is addressable', async function (w) {
      signIn(w);
      plan(w, { posts: { _: { data: null, error: null } } });
      await w.kxOpenPost('POST-123', 'rfq');
      restore(w);
      expect(w.location.hash).toBe('#page-rfq-detail/POST-123');
    });
    it('reads a post back out of the URL, for both kinds', function (w) {
      w.history.replaceState(null, '', '#page-rfq-detail/abc');
      expect(w.kxPostFromHash()).toEqual({ page: 'page-rfq-detail', id: 'abc', kind: 'rfq' });
      w.history.replaceState(null, '', '#page-offer-detail/xyz');
      expect(w.kxPostFromHash()).toEqual({ page: 'page-offer-detail', id: 'xyz', kind: 'offer' });
    });
    it('treats an ordinary page as carrying no post', function (w) {
      w.history.replaceState(null, '', '#page-feed');
      expect(w.kxPostFromHash()).toBe(null, 'only detail pages carry an id');
      w.history.replaceState(null, '', '#page-rfq-detail');
      expect(w.kxPostFromHash()).toBe(null, 'a detail page without an id is not a post');
      w.history.replaceState(null, '', '#page-rfq-detail/');
      expect(w.kxPostFromHash()).toBe(null, 'nor is a trailing slash');
    });
    it('re-navigating to the page you are on re-fires its loader', async function (w) {
      signIn(w);
      var seen = [];
      var real = w.kxLoadMyPosts;
      w.kxLoadMyPosts = function (kind) { seen.push(kind + ':' + (w.kxSession ? 'yes' : 'no')); };
      await w.navigateTo('page-rfq-offers', true);
      seen.length = 0;
      await w.navigateTo('page-rfq-offers', true);
      w.kxLoadMyPosts = real;
      expect(seen).toEqual(['rfq:yes'],
        'this is the mechanism boot() uses to recover a refreshed page');
    });
  });

  // ============================== the sign-in page only claims what is true ===
  /* Every line here is read by someone deciding whether to sign up, so a claim
     the app cannot keep is worse than no claim. Two of the three original
     bullets described features that do not exist: a ยืนยันตัวตน check
     (profiles.is_verified is read in six places and written in none) and
     "ปิดดีลในระบบ", which no_winner.sql removed on purpose. */
  describe('page-auth — no claims the app cannot keep', function () {
    function panelText(w) {
      return (w.document.getElementById('page-auth').textContent || '');
    }
    it('states no user count', function (w) {
      expect(/12,?000/.test(panelText(w))).toBe(false,
        'the number was hardcoded and no code ever updated it');
    });
    it('does not promise identity verification anywhere on the page', function (w) {
      var t = panelText(w);
      expect(/ตรวจสอบแล้ว|ยืนยันตัวตนด้วย|ยืนยันด้วยหนังสือรับรอง/.test(t)).toBe(false,
        'nothing in the app can set profiles.is_verified, and signup asks for no document');
    });
    it('does not promise deal-closing or job tracking', function (w) {
      expect(/ปิดดีล|ติดตามสถานะงาน/.test(panelText(w))).toBe(false,
        'the winner-picking flow was removed by database/no_winner.sql');
    });
    it('still names three things, each with a subtitle', function (w) {
      var pts = w.document.querySelectorAll('#page-auth .au-point');
      expect(pts.length).toBe(3);
      Array.prototype.forEach.call(pts, function (p) {
        expect((p.querySelector('.au-pt').textContent || '').trim()).toBeTruthy();
        expect((p.querySelector('.au-ps').textContent || '').trim()).toBeTruthy();
      });
    });
  });

  // ===================== the profile no longer advertises a removed feature ===
  describe('page-company-profile — ผลงานสะสม is gone', function () {
    it('has no wins cards left to fill', function (w) {
      expect(w.document.getElementById('pfWinsCard')).toBeFalsy();
      expect(w.document.getElementById('pfRecentCard')).toBeFalsy();
      expect(w.document.getElementById('pfWinsList')).toBeFalsy();
    });
    it('never tells anyone a won bid will appear there', function (w) {
      var els = w.document.querySelectorAll('#page-company-profile *');
      var found = [];
      Array.prototype.forEach.call(els, function (el) {
        if (el.children.length || el.tagName === 'SCRIPT') return;
        var t = (el.textContent || '').trim();
        if (/ปิดดีลในระบบ|ชนะการเสนอราคา|ผลงานสะสม/.test(t)) found.push(t.slice(0, 60));
      });
      expect(found).toEqual([], 'wins_count is frozen at 0, so this could only ever be a false promise');
    });
    it('drops the loader that queried for won bids', function (w) {
      expect(typeof w.kxLoadProfileWins).toBe('undefined',
        "quotes.status is narrowed to 'pending', so the query could only come back empty");
      expect(typeof w.renderProfileWins).toBe('undefined');
    });
  });

  // ============================ the fabricated quotation document is gone ===
  /* ตัวอย่างใบเสนอราคา shipped a whole invented company — a name, a Sukhumvit
     address, a tax number, three line items and a ฿98,440 total — and only the
     document number and the recipient were ever filled in. It was also
     unreachable: the button that opened it was gated on a docNo that was always
     '', its other opener was never called, and the third added a button to rows
     that did not exist yet. Removed rather than rebuilt, because the data model
     has no line items to rebuild it from. */
  describe('the demo quotation is gone', function () {
    it('has no quotation modal left in the page', function (w) {
      expect(w.document.getElementById('quotePdfModal')).toBeFalsy();
      expect(w.document.getElementById('qpdfDoc')).toBeFalsy();
      expect(w.document.getElementById('offerAttachModal')).toBeFalsy();
    });
    it('drops the functions that drove it', function (w) {
      ['openQuotePdf', 'closeQuotePdf', 'printQuote', 'openOfferAttachments']
        .forEach(function (fn) { expect(typeof w[fn]).toBe('undefined', fn + ' should be gone'); });
    });
    it('keeps the gallery lightbox, which shared its markup', function (w) {
      expect(w.document.getElementById('oaLightbox')).toBeTruthy(
        'the lightbox sat next to the removed modal and is the real one');
      expect(w.document.getElementById('oaLightboxImg')).toBeTruthy();
      expect(typeof w.kxLbReset).toBe('function');
    });
    it('carries none of the invented figures anywhere in the source', async function (w) {
      var src = await (await fetch('../index.html')).text();
      ['บางกอกพรีซิชั่น', '0105558', '98,440', 'KX-QT-', 'unsplash', 'งานชุบอโนไดซ์']
        .forEach(function (s) {
          expect(src.indexOf(s)).toBe(-1, '"' + s + '" is invented data');
        });
    });
  });

  // ================================= no service worker stands between a =====
  // ================================= deploy and the people using the app ====
  /* The app shipped a cache-first service worker against a hardcoded cache
     name. It never ran — it registered from a blob: URL, which browsers refuse,
     and the failure went into a silent .catch() — but had it run, the first copy
     of a file to reach `konnex-shell-v1` would have been served for ever, with
     nothing to bump the version and no revalidation. Refreshing would not have
     rescued anyone. */
  describe('service worker', function () {
    it('registers nothing', async function (w) {
      var src = await (await fetch('../index.html')).text();
      expect(/serviceWorker\s*\.\s*register/.test(src)).toBe(false,
        'a worker between the deploy and the user can freeze them on one build');
    });
    it('ships no cache-first fetch handler', async function (w) {
      var src = await (await fetch('../index.html')).text();
      var code = src.replace(/\/\*[\s\S]*?\*\//g, '');   // the explanation may name it
      expect(code.indexOf('konnex-shell-v1')).toBe(-1);
      expect(/cache\.match\([^)]*\)\.then\(\s*cached\s*=>\s*cached\s*\|\|/.test(code)).toBe(false);
    });
    it('still clears up after any client that did register one', async function (w) {
      var src = await (await fetch('../index.html')).text();
      expect(src).toContain('getRegistrations',
        'someone whose browser accepted the blob has to be let out again');
      expect(src).toContain('caches.delete');
    });
  });

  // ================================================ หน้าหลัก keeps up to date ===
  /* The feed loaded once per page load and never again — `loaded` was set true
     and nothing reset it, so leaving and coming back showed the same posts and
     only F5 brought new ones. Every other page reloads on every visit. It now
     reloads when what is on screen has gone stale, which keeps a quick there-
     and-back from re-querying 60 rows and throwing away the scroll position. */
  describe('kxRefreshFeedIfStale', function () {
    /* The suite shares one window, so the feed may already be loaded and fresh
       when this group runs. Rather than depend on that, these tests drive a
       fake clock: feedIsStale() reads Date.now(), so pushing it forward is the
       same as waiting, and every test starts from a known state. */
    var offset = 0, realNow = null;
    function clockOn(w) {
      if (realNow) return;
      realNow = w.Date.now;
      w.Date.now = function () { return realNow.call(w.Date) + offset; };
    }
    function clockOff(w) { if (realNow) { w.Date.now = realNow; realNow = null; } }
    function advance(ms) { offset += ms; }

    async function loadStaleFeed(w) {
      clockOn(w);
      advance(60000);                    // whatever is on screen is now old
      var sb = plan(w, { posts: { _: { data: [], error: null } } });
      signIn(w);
      await w.navigateTo('page-feed', true);
      await new Promise(function (r) { setTimeout(r, 60); });
      return sb;
    }
    function feedQueries(sb) {
      return sb._calls.filter(function (c) { return c.table === 'posts'; }).length;
    }
    it('loads the feed when what is on screen has gone stale', async function (w) {
      var sb = await loadStaleFeed(w);
      clockOff(w); restore(w);
      expect(feedQueries(sb)).toBe(1);
    });
    it('does not re-query when you step away and straight back', async function (w) {
      var sb = await loadStaleFeed(w);
      var n = feedQueries(sb);
      await w.navigateTo('page-my-bids', true);
      await w.navigateTo('page-feed', true);
      await new Promise(function (r) { setTimeout(r, 60); });
      clockOff(w); restore(w);
      expect(feedQueries(sb)).toBe(n, '60 rows and your scroll position are not worth a tab switch');
    });
    it('re-queries once the data on screen has gone stale again', async function (w) {
      var sb = await loadStaleFeed(w);
      var n = feedQueries(sb);
      advance(31000);
      await w.navigateTo('page-my-bids', true);
      await w.navigateTo('page-feed', true);
      await new Promise(function (r) { setTimeout(r, 60); });
      clockOff(w); restore(w);
      expect(feedQueries(sb)).toBe(n + 1);
    });
    it('reports whether it decided to refresh', async function (w) {
      await loadStaleFeed(w);
      var fresh = w.kxRefreshFeedIfStale();
      clockOff(w); restore(w);
      expect(fresh).toBe(false, 'nothing to do while the feed is fresh');
    });
    it('a failed load does not wedge the loader for the session', async function (w) {
      plan(w, { posts: { _: { data: null, error: { message: 'boom', code: 'XXX' } } } });
      signIn(w);
      await w.kxLoadFeed();
      await new Promise(function (r) { setTimeout(r, 40); });
      // the in-flight guard must have been cleared on the way out
      var sb = plan(w, { posts: { _: { data: [], error: null } } });
      await w.kxLoadFeed();
      await new Promise(function (r) { setTimeout(r, 40); });
      restore(w);
      expect(feedQueries(sb)).toBe(1, 'one bad response would otherwise stop every later refresh');
    });
  });

  // ================================= every RFQ is sealed; there is no choice ===
  /* เลือกประเภทการเสนอราคา offered ปิดราคา or เปิดราคา. Sealed was the recommended
     one and the mechanism the rest of the app is built around, so the step was
     asking a question with one sensible answer. `posts.bid_type` stays in the
     schema and is written 'sealed', so old rows still read true. */
  describe('the bid-type step is gone', function () {
    it('is not in the create form', function (w) {
      expect(w.document.getElementById('cpBidStep')).toBeFalsy();
      expect(w.document.querySelectorAll('input[name="cpBid"]').length).toBe(0);
    });
    it('writes sealed for every RFQ it publishes', async function (w) {
      var src = await (await fetch('../index.html')).text();
      expect(src).toContain("bid_type: isRfq ? 'sealed' : null",
        'the column keeps one value rather than being read back from a control that is gone');
      expect(/bidRadios/.test(src)).toBe(false);
    });
    it('branches on the old column nowhere', async function (w) {
      var src = await (await fetch('../index.html')).text();
      expect(/bid_type === 'open'/.test(src)).toBe(false, 'nothing decides on the old value now');
      expect(/bid_type !== 'open'/.test(src)).toBe(false);
    });
  });

  // =========================================== the detail header, re-ordered ===
  describe('detail header order and บันทึกไว้', function () {
    var POST = {
      id: 'H1', kind: 'rfq', owner_id: OTHER, title: 'ต้องการซื้อของ', province: 'เชียงใหม่',
      status: 'open', deadline: '2099-01-01T00:00:00Z', post_images: [], post_attachments: [],
      quotes: [], profiles: { company_name: 'บจก. ผู้ซื้อ', avatar_url: null }
    };
    /* Wait for this post's own id to land, not for the owner name — two posts
       here share an owner, so the name matches whatever the previous test left
       on screen and the wait falls straight through. */
    async function open(w, post, kind, page) {
      plan(w, { posts: { _: { data: post, error: null } }, _: { data: [], error: null } });
      signIn(w);
      var btnId = kind === 'rfq' ? 'rfqSaveBtn' : 'offerSaveBtn';
      await w.kxOpenPost(post.id, kind);
      for (var i = 0; i < 120; i++) {
        var btn = w.document.getElementById(btnId);
        if (btn && btn.getAttribute('data-post-id') === post.id) break;
        await new Promise(function (r) { setTimeout(r, 10); });
      }
      restore(w);
    }
    function order(w, sel) {
      var box = w.document.querySelector(sel);
      return Array.prototype.map.call(box.children, function (c) {
        return (c.className || c.tagName).toString().split(' ')[0];
      });
    }
    it('puts where and when above the title on ต้องการซื้อ', async function (w) {
      await open(w, POST, 'rfq', 'page-rfq-detail');
      var kids = order(w, '#page-rfq-detail .header-info');
      expect(kids.indexOf('meta-row') < kids.indexOf('H1')).toBe(true, kids.join(' → '));
      expect(kids.indexOf('post-owner') < kids.indexOf('meta-row')).toBe(true, 'who still leads');
    });
    /* Two badges, top left: which side of the market, then whether you can
       still act on it. The status one used to read "🔒 เสนอราคาแบบปิด" while
       open, which said nothing once every RFQ became sealed. */
    it('marks an open listing ต้องการซื้อ and เปิดรับ', async function (w) {
      await open(w, POST, 'rfq', 'page-rfq-detail');
      var tags = w.document.querySelectorAll('#page-rfq-detail .tag-row .head-tag');
      var text = Array.prototype.map.call(tags, function (t) { return t.textContent; }).join(' | ');
      expect(text).toContain('ต้องการซื้อ');
      expect(text).toContain('เปิดรับ');
      expect(w.document.getElementById('rfqStatusTag').className).toContain('open');
    });
    it('still reports a listing that has run out of time', async function (w) {
      var done = JSON.parse(JSON.stringify(POST));
      done.id = 'H3'; done.deadline = '2020-01-01T00:00:00Z';
      await open(w, done, 'rfq', 'page-rfq-detail');
      var tag = w.document.getElementById('rfqStatusTag');
      expect(tag.textContent).toContain('หมดเขต');
      expect(tag.className).toContain('closed');
      // and the kind badge does not change with the state
      expect(w.document.querySelector('#page-rfq-detail .head-tag.kind').textContent).toContain('ต้องการซื้อ');
    });
    it('offers บันทึกไว้ wired to the post', async function (w) {
      await open(w, POST, 'rfq', 'page-rfq-detail');
      var btn = w.document.getElementById('rfqSaveBtn');
      expect(btn).toBeTruthy();
      expect(btn.getAttribute('data-post-id')).toBe('H1');
      expect(btn.className).toContain('bookmark-ic',
        'kxApplySavedMarks finds it by that class, so its state matches the cards');
    });
    it('does the same on ประกาศขาย', async function (w) {
      var offer = JSON.parse(JSON.stringify(POST));
      offer.id = 'H2'; offer.kind = 'offer'; offer.price_high = 500;
      await open(w, offer, 'offer', 'page-offer-detail');
      var kids = order(w, '#page-offer-detail .offer-header-card');
      expect(kids.indexOf('offer-meta-row') < kids.indexOf('H1')).toBe(true, kids.join(' → '));
      expect(w.document.getElementById('offerSaveBtn').getAttribute('data-post-id')).toBe('H2');
    });
  });

  // ============================ the offers list: no blur, no price ranking ===
  /* Who may read a price is settled by the select policy on `quotes`: a row
     goes to its bidder and to the post owner, nobody else. The page used to
     blur the numbers on top of that, which hid them from the one person
     entitled to read them — the owner comparing offers. */
  describe('เปรียบเทียบข้อเสนอ', function () {
    var POST = {
      id: 'C1', kind: 'rfq', owner_id: ME, title: 'ทดสอบ', province: 'เชียงใหม่',
      status: 'open', deadline: '2099-01-01T00:00:00Z',
      post_images: [], post_attachments: [],
      profiles: { company_name: 'ผู้ซื้อ', avatar_url: null },
      quotes: [
        { id: 'q1', price: 1200000, note: 'ส่งใน 30 วัน', status: 'pending',
          created_at: '2026-08-20T00:00:00Z', bidder_id: OTHER, quote_attachments: [],
          profiles: { company_name: 'ผู้เสนอ A', avatar_url: null } },
        { id: 'q2', price: 900000, note: 'รวมติดตั้ง', status: 'pending',
          created_at: '2026-08-22T00:00:00Z', bidder_id: THIRD, quote_attachments: [],
          profiles: { company_name: 'ผู้เสนอ B', avatar_url: null } }
      ]
    };
    async function openAsOwner(w) {
      plan(w, { posts: { _: { data: POST, error: null } }, _: { data: [], error: null } });
      signIn(w, ME);
      await w.kxOpenPost(POST.id, 'rfq');
      for (var i = 0; i < 120; i++) {
        if (w.document.querySelectorAll('#offerList .price-num').length === 2) break;
        await new Promise(function (r) { setTimeout(r, 10); });
      }
      restore(w);
    }
    it('shows the prices rather than blurring them', async function (w) {
      await openAsOwner(w);
      var nums = w.document.querySelectorAll('#offerList .price-num');
      expect(nums.length).toBe(2);
      Array.prototype.forEach.call(nums, function (n) {
        expect(w.getComputedStyle(n).filter).toBe('none', 'the owner is who the numbers are for');
      });
      expect(w.document.getElementById('offerList').className).notToContain('sealed');
    });
    it('lists them in the order they arrived, not cheapest first', async function (w) {
      await openAsOwner(w);
      var nums = Array.prototype.map.call(
        w.document.querySelectorAll('#offerList .price-num'), function (n) { return n.textContent; });
      expect(nums[0]).toContain('1,200,000');
      expect(nums[1]).toContain('900,000');
    });
    it('has no sealed banner and no sort control', async function (w) {
      await openAsOwner(w);
      expect(w.document.getElementById('sealedBanner')).toBeFalsy();
      expect(w.document.querySelector('#page-rfq-detail .sort-select')).toBeFalsy();
    });
    it('still states the average, which describes the set', async function (w) {
      await openAsOwner(w);
      expect(w.document.getElementById('rfqCompareSub').textContent).toContain('เฉลี่ย');
    });
  });

  // =========================== who offered is public; what they offered is not ===
  /* The select policy on `quotes` gives a third party no rows, so a listing
     whose card said "2 ราย" opened onto an empty section. kx_post_bidders()
     returns identity and nothing else, so the list can show who without
     showing what. */
  describe('the bidder list a non-owner sees', function () {
    var BIDDERS = [
      { quote_id: 'q1', bidder_id: OTHER, created_at: '2026-08-20T00:00:00Z',
        company_name: 'ผู้เสนอ A', avatar_url: null, province: 'เชียงใหม่',
        is_verified: true, rating_avg: 5, rating_count: 1 },
      { quote_id: 'q2', bidder_id: THIRD, created_at: '2026-08-22T00:00:00Z',
        company_name: 'ผู้เสนอ B', avatar_url: null, province: 'ลำพูน',
        is_verified: false, rating_avg: null, rating_count: 0 }
    ];
    function post(over) {
      return Object.assign({
        id: 'N1', kind: 'rfq', owner_id: OTHER, title: 'ทดสอบ', province: 'เชียงใหม่',
        status: 'open', deadline: '2099-01-01T00:00:00Z', quote_count: 2,
        post_images: [], post_attachments: [], post_questions: [], quotes: [],
        profiles: { company_name: 'ผู้ซื้อ', avatar_url: null }
      }, over || {});
    }
    async function openAs(w, uid, p, rpcResult) {
      var sb = plan(w, {
        posts: { _: { data: p, error: null } }, _: { data: [], error: null },
        _rpc: { kx_post_bidders: rpcResult || { data: BIDDERS, error: null } }
      });
      signIn(w, uid);
      await w.kxOpenPost(p.id, 'rfq');
      for (var i = 0; i < 120; i++) {
        var l = w.document.getElementById('offerList');
        if (l && !/กำลังโหลด/.test(l.textContent)) break;
        await new Promise(function (r) { setTimeout(r, 10); });
      }
      await new Promise(function (r) { setTimeout(r, 40); });
      restore(w);
      return sb;
    }
    it('names everyone who has offered', async function (w) {
      await openAs(w, ME, post());
      var list = w.document.getElementById('offerList');
      expect(list.querySelectorAll('.offer-card').length).toBe(2);
      expect(list.textContent).toContain('ผู้เสนอ A');
      expect(list.textContent).toContain('ผู้เสนอ B');
    });
    it('shows no price and no quotation file', async function (w) {
      await openAs(w, ME, post());
      var list = w.document.getElementById('offerList');
      expect(list.querySelectorAll('.price-num').length).toBe(0);
      expect(/[0-9],[0-9]{3}/.test(list.textContent)).toBe(false, 'no figure that could be a price');
      expect(list.querySelectorAll('.files-sum, .btn-view').length).toBe(0);
      expect(list.textContent).toContain('เห็นได้เฉพาะเจ้าของประกาศ');
    });
    /* RLS hands a bidder their own row, which used to be the entire list they
       saw — one card, their own, on a listing with three offers. They get the
       whole list now, with their own number on their own line. */
    it('shows a bidder every rival, and their own price on their own row', async function (w) {
      var asBidder = post({
        id: 'N4', quote_count: 2,
        quotes: [{ id: 'q2', price: 9300000, note: 'ราคารวมติดตั้ง', status: 'pending',
          created_at: '2026-08-22T00:00:00Z', bidder_id: ME, quote_attachments: [],
          profiles: { company_name: 'ฉันเอง', avatar_url: null } }]
      });
      await openAs(w, ME, asBidder, { data: [
        BIDDERS[0],
        { quote_id: 'q2', bidder_id: ME, created_at: '2026-08-22T00:00:00Z',
          company_name: 'ฉันเอง', avatar_url: null, province: 'ลำพูน',
          is_verified: false, rating_avg: null, rating_count: 0 }
      ], error: null });
      var list = w.document.getElementById('offerList');
      expect(list.querySelectorAll('.offer-card').length).toBe(2, 'both bidders, not just mine');
      var prices = list.querySelectorAll('.price-num');
      expect(prices.length).toBe(1, 'exactly one price: my own');
      expect(prices[0].textContent).toContain('9,300,000');
      expect(list.querySelector('.kx-q-mine .kx-mine-tag')).toBeTruthy();
      expect(list.textContent).toContain('เห็นได้เฉพาะเจ้าของประกาศ');
    });
    it('leaves the owner’s own view alone', async function (w) {
      var mine = post({ id: 'N2', owner_id: ME, quote_count: 1, quotes: [
        { id: 'q9', price: 777000, note: 'หมายเหตุ', status: 'pending',
          created_at: '2026-08-20T00:00:00Z', bidder_id: OTHER, quote_attachments: [],
          profiles: { company_name: 'ผู้เสนอ A', avatar_url: null } } ] });
      var sb = await openAs(w, ME, mine);
      expect(w.document.querySelector('#offerList .price-num').textContent).toContain('777,000');
      expect(sb._calls.filter(function (c) { return c.rpc === 'kx_post_bidders'; }).length)
        .toBe(0, 'the owner already has the rows; asking again would be a second query for less');
    });
    /* The count used to come from the rows the viewer received. A bidder gets
       exactly one — their own — so the line read "1 ราย" above a list of two. */
    it('counts every bidder, not the rows this viewer was given', async function (w) {
      var asBidder = post({
        id: 'N5', quote_count: 2,
        quotes: [{ id: 'q2', price: 9300000, note: 'x', status: 'pending',
          created_at: '2026-08-22T00:00:00Z', bidder_id: ME, quote_attachments: [],
          profiles: { company_name: 'ฉันเอง', avatar_url: null } }]
      });
      await openAs(w, ME, asBidder);
      expect(w.document.querySelector('#rfqCompareSub .kx-count-pill').textContent)
        .toContain('2 ข้อเสนอ', 'the count is of every offer, not of the rows RLS handed over');
    });
    /* Everyone sees the average. A viewer who is not the owner never receives
       the prices, so it comes from kx_post_avg_price() rather than being
       computed here. What that publishes is set out in
       database/public_avg_price.sql. */
    it('shows a bidder the real average, fetched rather than guessed', async function (w) {
      var asBidder = post({
        id: 'N6', quote_count: 2,
        quotes: [{ id: 'q2', price: 9300000, note: 'x', status: 'pending',
          created_at: '2026-08-22T00:00:00Z', bidder_id: ME, quote_attachments: [],
          profiles: { company_name: 'ฉันเอง', avatar_url: null } }]
      });
      var sb = plan(w, {
        posts: { _: { data: asBidder, error: null } }, _: { data: [], error: null },
        _rpc: { kx_post_bidders: { data: BIDDERS, error: null },
                kx_post_avg_price: { data: 9150000, error: null } }
      });
      signIn(w, ME);
      await w.kxOpenPost(asBidder.id, 'rfq');
      for (var i = 0; i < 120; i++) {
        if (w.document.querySelector('#rfqCompareSub .kx-avg')) break;
        await new Promise(function (r) { setTimeout(r, 10); });
      }
      restore(w);
      var subEl = w.document.getElementById('rfqCompareSub');
      expect(subEl.querySelector('.kx-avg b').textContent).toContain('9,150,000');
      expect(subEl.textContent).notToContain('9,300,000',
        'their own price is not the average, which is what the old code showed');
      expect(sb._calls.filter(function (c) { return c.rpc === 'kx_post_avg_price'; }).length)
        .toBe(1, 'the prices it averages never reach this page');
    });
    it('shows the owner the average without a second query', async function (w) {
      var mine = post({ id: 'N7', owner_id: ME, quote_count: 2, quotes: [
        { id: 'q1', price: 9000000, note: 'a', status: 'pending', created_at: '2026-08-20T00:00:00Z',
          bidder_id: OTHER, quote_attachments: [], profiles: { company_name: 'A', avatar_url: null } },
        { id: 'q2', price: 9300000, note: 'b', status: 'pending', created_at: '2026-08-22T00:00:00Z',
          bidder_id: THIRD, quote_attachments: [], profiles: { company_name: 'B', avatar_url: null } } ] });
      var sb = await openAs(w, ME, mine);
      var subEl = w.document.getElementById('rfqCompareSub');
      expect(subEl.textContent).toContain('9,150,000');
      expect(subEl.querySelector('.kx-avg')).toBeTruthy('the average gets its own emphasis');
      expect(subEl.querySelector('.kx-count-pill').textContent).toContain('2 ข้อเสนอ');
      expect(sb._calls.filter(function (c) { return c.rpc === 'kx_post_avg_price'; }).length)
        .toBe(0, 'the owner holds every price already');
    });
    it('names the migration when it has not been run', async function (w) {
      await openAs(w, ME, post({ id: 'N3' }),
        { data: null, error: { code: 'PGRST202', message: 'Could not find the function' } });
      expect(w.document.getElementById('offerList').textContent).toContain('public_bidders.sql');
    });
  });

  describe('คำถามเกี่ยวกับงานนี้', function () {
    function post(owner) {
      return { id: 'Q9', kind: 'rfq', owner_id: owner, title: 'ทดสอบ', province: 'เชียงใหม่',
        status: 'open', deadline: '2099-01-01T00:00:00Z', quote_count: 0,
        post_images: [], post_attachments: [], post_questions: [], quotes: [],
        profiles: { company_name: 'ผู้ซื้อ', avatar_url: null } };
    }
    async function openAs(w, uid, p) {
      plan(w, { posts: { _: { data: p, error: null } }, _: { data: [], error: null } });
      signIn(w, uid);
      await w.kxOpenPost(p.id, 'rfq');
      await new Promise(function (r) { setTimeout(r, 80); });
      restore(w);
    }
    it('lets anyone but the owner ask', async function (w) {
      await openAs(w, ME, post(OTHER));
      expect(w.document.querySelector('#rfqQaBlock .kx-askin')).toBeTruthy();
    });
    /* You do not question your own listing, so the owner gets no box — but the
       block then sat empty with no hint of what it was for. */
    /* One question, one answer, and the conversation ended there — to ask
       anything further you started a fresh question with nothing tying it to
       the answer it was about. A follow-up is a question that knows which one
       it follows (database/question_threads.sql). */
    function threaded(owner) {
      return { id: 'T9', kind: 'rfq', owner_id: owner, title: 'ทดสอบ', province: 'เชียงใหม่',
        status: 'open', deadline: '2099-01-01T00:00:00Z', quote_count: 0,
        post_images: [], post_attachments: [], quotes: [],
        profiles: { id: owner, company_name: 'เจ้าของ', avatar_url: null },
        post_questions: [
          { id: 'q1', body: 'ถามข้อแรก', answer: 'ตอบข้อแรก', answered_at: '2026-08-24T00:00:00Z',
            created_at: '2026-08-23T00:00:00Z', asker_id: OTHER, parent_id: null,
            profiles: { id: OTHER, company_name: 'ผู้ถาม', avatar_url: null } },
          { id: 'q2', body: 'ถามต่อ', answer: null, answered_at: null,
            created_at: '2026-08-25T00:00:00Z', asker_id: OTHER, parent_id: 'q1',
            profiles: { id: OTHER, company_name: 'ผู้ถาม', avatar_url: null } }
        ] };
    }
    async function openThread(w, uid, p) {
      plan(w, { posts: { _: { data: p, error: null } }, _: { data: [], error: null } });
      signIn(w, uid);
      await w.kxOpenPost(p.id, 'rfq');
      await new Promise(function (r) { setTimeout(r, 90); });
      restore(w);
      return w.document.getElementById('rfqQaBlock');
    }
    function bodies(block) {
      return Array.prototype.map.call(
        block.querySelectorAll('[style*="white-space:pre-wrap"]'),
        function (e) { return e.textContent.trim(); });
    }
    it('keeps a follow-up under the answer it follows', async function (w) {
      var block = await openThread(w, OTHER, threaded(ME));
      expect(bodies(block)).toEqual(['ถามข้อแรก', 'ตอบข้อแรก', 'ถามต่อ']);
    });
    it('counts conversations, not messages', async function (w) {
      var block = await openThread(w, OTHER, threaded(ME));
      expect(block.textContent).toContain('(1)', 'three messages, one question');
    });
    it('offers the box to the person who asked', async function (w) {
      var block = await openThread(w, OTHER, threaded(ME));
      expect(block.querySelector('.kx-followin').placeholder).toContain('ถามต่อ');
    });
    it('offers it to the owner as well, worded as a reply', async function (w) {
      var block = await openThread(w, ME, threaded(ME));
      expect(block.querySelector('.kx-followin').placeholder).toContain('ตอบเพิ่มเติม');
    });
    /* A bystander reads the exchange but does not join it — their own question
       belongs in the box at the foot of the block, where it can be found. */
    it('gives no box to anyone else', async function (w) {
      var block = await openThread(w, THIRD, threaded(ME));
      expect(block.querySelector('.kx-followin')).toBeFalsy();
      expect(bodies(block).length).toBe(3, 'they still read the whole thread');
    });
    it('has nothing to follow until the owner has answered', async function (w) {
      var p = threaded(ME);
      p.post_questions = [Object.assign({}, p.post_questions[0], { answer: null, answered_at: null })];
      var block = await openThread(w, OTHER, p);
      expect(block.querySelector('.kx-followin')).toBeFalsy();
    });
    it('writes the follow-up against the question it answers', async function (w) {
      var sb = plan(w, { posts: { _: { data: threaded(ME), error: null } }, _: { data: [], error: null } });
      signIn(w, OTHER);
      await w.kxOpenPost('T9', 'rfq');
      await new Promise(function (r) { setTimeout(r, 90); });
      var input = w.document.querySelector('#rfqQaBlock .kx-followin');
      input.value = 'ถามต่ออีกที';
      input.parentElement.querySelector('button').click();
      await new Promise(function (r) { setTimeout(r, 90); });
      restore(w);
      var row = sb._writes.filter(function (x) { return x.table === 'post_questions'; })[0].row;
      expect(row.parent_id).toBe('q1');
      expect(row.body).toBe('ถามต่ออีกที');
      expect(row.asker_id).toBe(OTHER, 'whoever sent it is the author');
    });
    it('names the migration if it has not been run', async function (w) {
      plan(w, { posts: { _: { data: threaded(ME), error: null } },
                post_questions: { insert: { data: null, error: { code: '42703', message: 'column parent_id does not exist' } } },
                _: { data: [], error: null } });
      signIn(w, OTHER);
      await w.kxOpenPost('T9', 'rfq');
      await new Promise(function (r) { setTimeout(r, 90); });
      var said = [];
      var realToast = w.kxToast; w.kxToast = function (m) { said.push(m); };
      var input = w.document.querySelector('#rfqQaBlock .kx-followin');
      input.value = 'x';
      input.parentElement.querySelector('button').click();
      await new Promise(function (r) { setTimeout(r, 90); });
      w.kxToast = realToast;
      restore(w);
      expect(said.join(' ')).toContain('question_threads.sql');
    });
    it('tells the owner what the empty block is waiting for', async function (w) {
      await openAs(w, ME, post(ME));
      var block = w.document.getElementById('rfqQaBlock');
      expect(block.querySelector('.kx-askin')).toBeFalsy();
      expect(block.textContent).toContain('จะมาแสดงที่นี่');
    });
  });

  /* View counts are gone: a number nobody acts on, and on a new listing "0 วิว"
     reads as "nobody is interested" rather than "this was posted an hour ago". */
  /* สถิติ shipped four headline figures and a bar chart, all literals in the
     markup — including a win rate for a thing the app no longer does. Nothing
     linked to it, so nobody ever saw it. */
  describe('the สถิติ page is gone', function () {
    it('is not in the document', function (w) {
      expect(w.document.getElementById('page-analytics')).toBeFalsy();
    });
    it('takes its invented figures with it', async function (w) {
      var src = await (await fetch('../index.html')).text();
      ['12,480', 'อัตราชนะ', '2.4 ชม.'].forEach(function (s) {
        expect(src.indexOf(s)).toBe(-1, '"' + s + '" was a literal, not a measurement');
      });
    });
  });

  // ================================= the card's average is everyone's average ===
  /* The feed card computed ราคาเฉลี่ย from the embedded quotes(price). That
     embed is behind the select policy, so it carries the viewer's own offer and
     nothing else — a bidder scrolling the feed saw their own price labelled as
     the average of everyone's. posts.quote_avg is a column a trigger keeps
     (quote_avg_column.sql), public the way quote_count is. */
  describe('postCardHTML — ราคาเฉลี่ย', function () {
    function card(w, post) {
      var el = w.document.createElement('div');
      el.innerHTML = w.kxPostCardHTML(post);
      return el;
    }
    function rfq(over) {
      return Object.assign({
        id: 'F1', kind: 'rfq', owner_id: OTHER, title: 'ทดสอบ', province: 'เชียงใหม่',
        status: 'open', deadline: '2099-01-01T00:00:00Z', created_at: '2026-08-20T00:00:00Z',
        post_images: [], post_attachments: [], quotes: [], quote_count: 2,
        profiles: { company_name: 'ผู้ซื้อ', avatar_url: null }
      }, over || {});
    }
    it('reads the average off the column, not the rows it was handed', function (w) {
      signIn(w, ME);
      // the embed carries only this viewer's own offer, as RLS would give it
      var el = card(w, rfq({ quote_avg: 9150000,
        quotes: [{ price: 9300000 }] }));
      var num = el.querySelector('.pc-price-num');
      expect(num.textContent).toContain('9,150,000');
      expect(num.textContent).notToContain('9,300,000', 'that is their own offer, not the average');
    });
    it('shows no average at all rather than a wrong one', function (w) {
      signIn(w, ME);
      // quote_avg missing (migration not run) and the listing is not mine
      var el = card(w, rfq({ quotes: [{ price: 9300000 }] }));
      expect(el.querySelector('.pc-price-num').textContent).toBe('ยังไม่มี');
    });
    it('still averages locally on your own listing, where the embed is complete', function (w) {
      signIn(w, ME);
      var el = card(w, rfq({ owner_id: ME, quotes: [{ price: 9000000 }, { price: 9300000 }] }));
      expect(el.querySelector('.pc-price-num').textContent).toContain('9,150,000');
    });
  });

  /* Pictures you can open showed a magnifier (zoom-in). Everything else you can
     click in the app shows a hand, and a photograph that opens a viewer is a
     click like any other. */
  describe('a picture you can open shows a hand', function () {
    it('uses pointer on gallery cells and their images', async function (w) {
      var src = await (await fetch('../index.html')).text();
      expect(/\.kx-gcell\{[^}]*cursor:pointer/.test(src.replace(/\s+/g, ''))
          || /min-width:0;min-height:0;background:var\(--bg\);cursor:pointer/.test(src.replace(/\s+/g, '')))
        .toBe(true, 'the gallery cell is the surface that opens the viewer');
    });
    it('leaves no zoom-in cursor outside the viewer itself', async function (w) {
      var src = await (await fetch('../index.html')).text();
      var hits = (src.match(/cursor:\s*zoom-in/g) || []).length;
      expect(hits).toBe(1,
        'the one left is the lightbox image, where the cursor really does mean zoom');
    });
    it('does not put a hand on a picture that opens nothing', function (w) {
      // the profile cover is decoration; a hand there would promise an action
      var cover = w.document.querySelector('#page-company-profile .hero-banner .cover');
      if (!cover) return;                       // not rendered without a profile
      expect(w.getComputedStyle(cover).cursor).notToContain('pointer');
    });
  });

  /* Money fields are text inputs precisely so they can carry separators, and
     every place that reads one already strips them. They just were not being
     put in: 9000000 with no grouping is the figure people are asked to check
     before they send it. */
  describe('money fields group their digits', function () {
    function typeInto(w, id, keys) {
      var el = w.document.getElementById(id);
      el.value = '';
      keys.split('').forEach(function (ch) {
        el.value += ch;
        el.dispatchEvent(new w.Event('input', { bubbles: true }));
      });
      return el.value;
    }
    it('groups as you type', function (w) {
      expect(typeInto(w, 'cpPrice', '9000000')).toBe('9,000,000');
      expect(typeInto(w, 'cpBudgetLow', '500')).toBe('500');
      expect(typeInto(w, 'cpBudgetHigh', '1250000')).toBe('1,250,000');
      w.document.getElementById('cpPrice').value = '';
      w.document.getElementById('cpBudgetLow').value = '';
      w.document.getElementById('cpBudgetHigh').value = '';
    });
    /* Rewriting the value on every keystroke sends the caret to the end, which
       throws you to the far right the moment you correct a digit in the middle. */
    it('leaves the caret where the typist put it', function (w) {
      var el = w.document.getElementById('cpPrice');
      typeInto(w, 'cpPrice', '1234567');
      var v = el.value;
      el.setSelectionRange(1, 1);
      el.value = v.slice(0, 1) + '9' + v.slice(1);
      el.setSelectionRange(2, 2);
      el.dispatchEvent(new w.Event('input', { bubbles: true }));
      expect(el.value).toBe('19,234,567');
      expect((el.value.slice(0, el.selectionStart).match(/\d/g) || []).length)
        .toBe(2, 'two digits typed, two digits behind the caret');
      el.value = '';
    });
    it('strips anything that is not a digit', function (w) {
      expect(typeInto(w, 'cpPrice', '1a2b3c4567')).toBe('1,234,567');
      w.document.getElementById('cpPrice').value = '';
    });
    /* The parsers already strip separators — this is what makes the above safe,
       so it is worth a test of its own. */
    it('is read back with the separators removed', async function (w) {
      var src = await (await fetch('../index.html')).text();
      ['offerPrice', 'cpPrice', 'qrBudget'].forEach(function (id) {
        expect(src.indexOf("getElementById('" + id + "')") > -1)
          .toBe(true, id + ' should still exist');
      });
      expect((src.match(/replace\(\/\[, \]\/g, ''\)/g) || []).length >= 3).toBe(true,
        'every money field is parsed through a separator strip');
    });
  });

  /* One 192px file used to serve every icon size, and the browser squeezed it
     to 16px for the tab: the king is drawn at 41% of the width, so what came
     through was a blue square with a smudge. */
  describe('the tab icon', function () {
    it('ships a file for each size a tab uses', function (w) {
      var links = w.document.querySelectorAll('link[rel~="icon"]');
      var sizes = Array.prototype.map.call(links, function (l) { return l.getAttribute('sizes'); });
      ['16x16', '32x32', '48x48'].forEach(function (s) {
        expect(sizes.indexOf(s) > -1).toBe(true, s + ' should be declared');
      });
    });
    it('points each one at a file drawn at that size', async function (w) {
      var links = w.document.querySelectorAll('link[rel~="icon"]');
      for (var i = 0; i < links.length; i++) {
        var want = parseInt(links[i].getAttribute('sizes'), 10);
        var href = links[i].getAttribute('href');
        var got = await new Promise(function (res) {
          var im = new w.Image();
          im.onload = function () { res(im.naturalWidth); };
          im.onerror = function () { res(-1); };
          im.src = '../' + href;
        });
        expect(got).toBe(want, href + ' should be ' + want + 'px, not scaled from a larger file');
      }
    });
  });

  // ============================ a notification opens the page it is about ===
  /* notifTarget picked the detail page from the kind of *notification*:
     `n.kind === 'new_request' ? 'offer' : 'rfq'`. A question answered on a
     ประกาศขาย is not a new_request, so it opened ต้องการซื้อ and showed whichever
     post that page held last. The post's own kind decides it now. */
  describe('notification routing', function () {
    var RFQ = '11111111-1111-1111-1111-111111111111';
    var OFF = '22222222-2222-2222-2222-222222222222';
    function notif(over) {
      return Object.assign({ id: 'n1', kind: 'question_answered', body: 'x',
        link_post_id: OFF, is_read: false, created_at: '2026-08-29T00:00:00Z',
        actor_id: null, posts: { kind: 'offer' } }, over || {});
    }
    async function land(w, rows, id, postLookup) {
      plan(w, { notifications: { _: { data: rows, error: null } },
                posts: { _: { data: postLookup || { kind: 'offer' }, error: null } },
                _: { data: [], error: null } });
      signIn(w, ME);
      await w.navigateTo('page-notifications', true);
      await w.kxLoadNotifications();
      await new Promise(function (r) { setTimeout(r, 60); });
      w.kxOpenNotification(id);
      await new Promise(function (r) { setTimeout(r, 120); });
      restore(w);
      return (w.document.querySelector('.app-page.active') || {}).id;
    }
    it('opens ประกาศขาย for a question answered on one', async function (w) {
      expect(await land(w, [notif()], 'n1')).toBe('page-offer-detail');
    });
    it('opens ต้องการซื้อ for the same notification on an RFQ', async function (w) {
      expect(await land(w, [notif({ link_post_id: RFQ, posts: { kind: 'rfq' } })], 'n1'))
        .toBe('page-rfq-detail');
    });
    it('looks the post up when the row does not carry its kind', async function (w) {
      // rows written before posts(kind) was fetched, or a post since deleted
      var old = notif(); delete old.posts;
      expect(await land(w, [old], 'n1', { kind: 'offer' })).toBe('page-offer-detail');
    });
    it('still sends a verification result to the profile', async function (w) {
      expect(await land(w, [notif({ kind: 'verify_approved', link_post_id: null, posts: null })], 'n1'))
        .toBe('page-company-profile');
    });
  });

  describe('no view counts', function () {
    it('shows none anywhere in the page', function (w) {
      expect(/\d+\s*วิว/.test(w.document.body.innerText)).toBe(false);
    });
    it('does not render one on a listing', async function (w) {
      var offer = { id: 'V9', kind: 'offer', owner_id: OTHER, title: 'ขายของ',
        province: 'เชียงใหม่', status: 'open', price_high: 500, view_count: 0,
        post_images: [], post_attachments: [], quotes: [], quote_requests: [],
        profiles: { company_name: 'ผู้ขาย', avatar_url: null } };
      plan(w, { posts: { _: { data: offer, error: null } }, _: { data: [], error: null } });
      signIn(w);
      await w.kxOpenPost(offer.id, 'offer');
      await new Promise(function (r) { setTimeout(r, 80); });
      restore(w);
      expect(w.document.querySelector('#page-offer-detail .offer-meta-row').textContent)
        .notToContain('วิว');
    });
  });

  describe('renderSidebars — the rail', function () {
    function items(w) {
      var nav = w.document.querySelector('#page-feed .side-nav');
      return Array.prototype.map.call(nav.children, function (c) { return c.textContent.trim(); });
    }
    it('lists ตั้งค่า exactly once', function (w) {
      w.renderSidebars('page-feed');
      var n = items(w).filter(function (t) { return /ตั้งค่า/.test(t); }).length;
      expect(n).toBe(1, 'a second one used to be appended after the account row');
    });
    it('ends with the account row', function (w) {
      w.renderSidebars('page-feed');
      var nav = w.document.querySelector('#page-feed .side-nav');
      expect(nav.lastElementChild.className).toContain('side-me');
    });
    it('shows the signed-in name once the profile is known', function (w) {
      w.kxCurrentUser = { id: ME, company_name: 'บจก. ชื่อจริง', business_type: 'company' };
      w.renderSidebars('page-feed');
      var name = w.document.querySelector('#page-feed .side-me-name');
      expect(name.textContent).toBe('บจก. ชื่อจริง');
    });
    it('never renders a name as markup', function (w) {
      w.kxCurrentUser = { id: ME, company_name: '<img src=x onerror=alert(1)>', business_type: 'company' };
      w.renderSidebars('page-feed');
      var name = w.document.querySelector('#page-feed .side-me-name');
      expect(name.querySelector('img')).toBeFalsy('the name is set as text, never parsed');
      w.kxCurrentUser = null;
    });
  });

  // ===================================================== where a sign-in lands ===
  /* A brand-new account used to be dropped on the feed with an empty profile —
     the one page that says nothing about what to do next. */
  describe('kxAuthLanding — the page a sign-in lands on', function () {
    it('sends a brand-new account to แก้ไขโปรไฟล์', function (w) {
      w.kxProfileIsNew = true;
      expect(w.kxAuthLanding()).toBe('page-edit-profile');
    });
    it('sends it there once, not on every sign-in after', function (w) {
      w.kxProfileIsNew = true;
      w.kxAuthLanding();
      expect(w.kxAuthLanding()).toBe('page-feed', 'the flag is spent on first landing');
    });
    it('sends a returning account to the feed', function (w) {
      w.kxProfileIsNew = false;
      expect(w.kxAuthLanding()).toBe('page-feed');
    });
  });

  // ================================================ what a new profile row holds ===
  describe('kxEnsureProfile — a new account starts empty', function () {
    function noRowYet(w) {
      return plan(w, { profiles: { select: { data: null, error: null },
                                   insert: { data: { id: ME }, error: null } } });
    }
    it('invents no name from the provider or the email address', async function (w) {
      var sb = noRowYet(w);
      w.localStorage.removeItem('kx.pendingProfile');
      await w.kxEnsureProfile({ id: ME, email: 'someone@example.com',
        user_metadata: { full_name: 'Laoyang', avatar_url: 'https://x/p.jpg' } });
      restore(w);
      var row = sb._writes[0].row;
      expect(row.company_name).toBe(null,
        'it used to fall back to the provider name, then to the email prefix');
      expect(row.contact_name).toBe(null);
    });
    it('still keeps the picture the provider gave', async function (w) {
      var sb = noRowYet(w);
      w.localStorage.removeItem('kx.pendingProfile');
      await w.kxEnsureProfile({ id: ME, email: 'someone@example.com',
        user_metadata: { avatar_url: 'https://x/p.jpg' } });
      restore(w);
      expect(sb._writes[0].row.avatar_url).toBe('https://x/p.jpg',
        'a picture is the person’s own; an empty text field is the confusing part');
    });
    it('keeps every detail the signup form collected', async function (w) {
      var sb = noRowYet(w);
      w.localStorage.setItem('kx.pendingProfile', JSON.stringify({
        email: 'typed@example.com', company_name: 'บจก. ที่พิมพ์เอง',
        contact_name: 'สมชาย', phone: '0899999999', tax_id: '0105558000000',
        business_type: 'company' }));
      await w.kxEnsureProfile({ id: ME, email: 'typed@example.com', user_metadata: {} });
      restore(w);
      var row = sb._writes[0].row;
      expect(row.company_name).toBe('บจก. ที่พิมพ์เอง', 'the person typed this themselves');
      expect(row.phone).toBe('0899999999');
      expect(w.localStorage.getItem('kx.pendingProfile')).toBe(null, 'and it is spent');
    });
    it('ignores a stash left by a different email', async function (w) {
      var sb = noRowYet(w);
      w.localStorage.setItem('kx.pendingProfile', JSON.stringify({
        email: 'someone.else@example.com', company_name: 'บัญชีอื่น' }));
      await w.kxEnsureProfile({ id: ME, email: 'me@example.com', user_metadata: {} });
      restore(w);
      expect(sb._writes[0].row.company_name).toBe(null,
        'the stash belongs to whoever started that signup, not to this account');
      w.localStorage.removeItem('kx.pendingProfile');
    });
    it('flags the account as new so the landing helper can route it', async function (w) {
      var sb = noRowYet(w);
      w.kxProfileIsNew = false;
      w.localStorage.removeItem('kx.pendingProfile');
      await w.kxEnsureProfile({ id: ME, email: 'a@b.c', user_metadata: {} });
      restore(w);
      expect(w.kxProfileIsNew).toBe(true);
      expect(sb._writes.length).toBe(1, 'reaching the insert is what "new" means');
    });
  });

  // ========================================== signing out empties the form too ===
  /* `data` lives in the profile module's closure for as long as the page is
     open, so signing in as someone else without reloading left the previous
     account's answers in the fields. */
  describe('kxProfileReset — nothing survives an account switch', function () {
    function fieldValues(w) {
      return ['epName', 'pfTagline', 'pfPhone', 'pfProvince'].map(function (id) {
        var el = w.document.getElementById(id);
        return el ? el.value : null;
      });
    }
    it('clears every field the previous account filled in', function (w) {
      w.kxProfileFromRow({ id: OTHER, company_name: 'บัญชีเก่า จำกัด',
        tagline: 'ของบัญชีก่อนหน้า', phone: '0812345678', province: 'เชียงใหม่' });
      expect(fieldValues(w).join('|')).toContain('บัญชีเก่า จำกัด');
      w.kxProfileReset();
      expect(fieldValues(w)).toEqual(['', '', '', ''], 'a signed-out form holds nothing');
    });
    it('drops the browser-wide cache key, which belongs to no account', function (w) {
      w.localStorage.setItem('kx.profile', JSON.stringify({ name: 'ของคนก่อน' }));
      w.kxProfileReset();
      expect(w.localStorage.getItem('kx.profile')).toBe(null,
        'the per-account key kx.profile:<uid> is namespaced and is left alone');
    });
  });

  // =============================================== whose request am I reading? ===
  describe('renderRfqDetail — เจ้าของประกาศ', function () {
    var POST = {
      id: 'P1', kind: 'rfq', owner_id: OTHER, title: 'ต้องการซื้อของ',
      province: 'เชียงใหม่', status: 'open', deadline: '2099-01-01T00:00:00Z',
      post_images: [], post_attachments: [], quotes: [],
      profiles: { company_name: 'บจก. ผู้ซื้อ', avatar_url: 'https://x/av.jpg' }
    };
    /* kxOpenPost resolves before the render has landed, so waiting on it alone
       reads whatever the previous test left in the DOM. Wait for this post's
       own name to appear instead. */
    async function open(w, post) {
      plan(w, { posts: { _: { data: post, error: null } }, _: { data: [], error: null } });
      signIn(w);
      await w.kxOpenPost(post.id, 'rfq');
      var want = (post.profiles && post.profiles.company_name) || 'ผู้ใช้ Konnex';
      for (var i = 0; i < 80; i++) {
        var el = w.document.querySelector('#page-rfq-detail .post-owner-name');
        if (el && el.textContent === want) break;
        await new Promise(function (r) { setTimeout(r, 10); });
      }
      restore(w);
    }
    it('names the person who posted it', async function (w) {
      await open(w, POST);
      var el = w.document.querySelector('#page-rfq-detail .post-owner-name');
      expect(el.textContent).toBe('บจก. ผู้ซื้อ',
        'the page knew the owner all along — it just never showed them');
    });
    it('shows their picture when they have one', async function (w) {
      await open(w, POST);
      var img = w.document.querySelector('#page-rfq-detail .post-owner-av img');
      expect(img).toBeTruthy();
      expect(img.getAttribute('src')).toBe('https://x/av.jpg');
    });
    it('falls back to an initial when they have no picture', async function (w) {
      var p = JSON.parse(JSON.stringify(POST));
      p.profiles = { company_name: 'สมชาย', avatar_url: null };
      await open(w, p);
      var av = w.document.querySelector('#page-rfq-detail .post-owner-av');
      expect(av.querySelector('img')).toBeFalsy();
      expect(av.textContent).toBe('ส');
    });
    it('never renders a name as markup', async function (w) {
      var p = JSON.parse(JSON.stringify(POST));
      p.profiles = { company_name: '<img src=x onerror=alert(1)>', avatar_url: null };
      await open(w, p);
      var el = w.document.querySelector('#page-rfq-detail .post-owner-name');
      expect(el.querySelector('img')).toBeFalsy('the name is set as text, never parsed');
    });
    it('opens their profile when clicked', async function (w) {
      await open(w, POST);
      var seen = [];
      var real = w.kxViewProfile;
      w.kxViewProfile = function (id) { seen.push(id); };
      w.document.getElementById('rfqOwner').onclick();
      w.kxViewProfile = real;
      expect(seen).toEqual([OTHER]);
    });
    it('sits above the title, not below it', async function (w) {
      await open(w, POST);
      var info = w.document.querySelector('#page-rfq-detail .header-info');
      var kids = Array.prototype.map.call(info.children, function (c) { return c.className || c.tagName; });
      expect(kids.indexOf('post-owner') < kids.indexOf('H1')).toBe(true,
        'who posted it is read before what they posted');
    });
  });

  // ================================== the same block, and order, on ประกาศขาย ===
  describe('renderOfferDetail — เจ้าของประกาศ', function () {
    var OFFER = {
      id: 'O1', kind: 'offer', owner_id: OTHER, title: 'รับออกแบบชิ้นงาน',
      province: 'ไม่ระบุ', status: 'open', price_high: 500, view_count: 0,
      post_images: [], post_attachments: [], quotes: [], quote_requests: [],
      profiles: { company_name: 'บจก. ผู้ขาย', avatar_url: 'https://x/s.jpg' }
    };
    async function open(w, post) {
      plan(w, { posts: { _: { data: post, error: null } }, _: { data: [], error: null } });
      signIn(w);
      await w.kxOpenPost(post.id, 'offer');
      var want = (post.profiles && post.profiles.company_name) || 'ผู้ใช้ Konnex';
      for (var i = 0; i < 80; i++) {
        var el = w.document.querySelector('#page-offer-detail .post-owner-name');
        if (el && el.textContent === want) break;
        await new Promise(function (r) { setTimeout(r, 10); });
      }
      restore(w);
    }
    it('names the seller in the header, not only in the sidebar', async function (w) {
      await open(w, OFFER);
      var el = w.document.querySelector('#page-offer-detail .post-owner-name');
      expect(el.textContent).toBe('บจก. ผู้ขาย',
        'the sidebar card stacks to the bottom on a narrow screen, where nobody reads it');
    });
    it('shows their picture', async function (w) {
      await open(w, OFFER);
      var img = w.document.querySelector('#page-offer-detail .post-owner-av img');
      expect(img).toBeTruthy();
      expect(img.getAttribute('src')).toBe('https://x/s.jpg');
    });
    it('never renders a name as markup', async function (w) {
      var p = JSON.parse(JSON.stringify(OFFER));
      p.profiles = { company_name: '<img src=x onerror=alert(1)>', avatar_url: null };
      await open(w, p);
      var el = w.document.querySelector('#page-offer-detail .post-owner-name');
      expect(el.querySelector('img')).toBeFalsy('the name is set as text, never parsed');
    });
    it('opens their profile when clicked', async function (w) {
      await open(w, OFFER);
      var seen = [];
      var real = w.kxViewProfile;
      w.kxViewProfile = function (id) { seen.push(id); };
      w.document.getElementById('offerOwner').onclick();
      w.kxViewProfile = real;
      expect(seen).toEqual([OTHER]);
    });
    it('sits above the title, not below it', async function (w) {
      await open(w, OFFER);
      var card = w.document.querySelector('#page-offer-detail .offer-header-card');
      var kids = Array.prototype.map.call(card.children, function (c) { return c.className || c.tagName; });
      expect(kids.indexOf('post-owner') < kids.indexOf('H1')).toBe(true);
    });
    /* The two detail pages kept drifting apart — the gallery opened ประกาศขาย
       but sat mid-card on ต้องการซื้อ, and the seller was in a sidebar that
       stacks to the bottom on a narrow screen. Rather than eyeball them, this
       reads the order of the blocks that actually rendered on each page and
       requires them to match. ประกาศขาย carries one extra block, its own
       price; ต้องการซื้อ states a budget inside the meta row instead. */
    it('lays its blocks out in the same order as ต้องการซื้อ', async function (w) {
      function roleOf(el) {
        var c = (el.className || '').toString(), id = el.id || '';
        if (/post-owner/.test(c)) return 'OWNER';
        if (el.tagName === 'H1') return 'TITLE';
        if (/tag-row|offer-tags-row/.test(c)) return 'TAG';
        if (/meta-row/.test(c)) return 'META';
        if (/price-block/.test(c)) return 'PRICE';
        if (/Gallery|gal/i.test(id + c)) return 'GALLERY';
        if (/desc/.test(c)) return 'DESC';
        if (/action-row/.test(c)) return 'ACTIONS';
        return null;
      }
      function sequence(w, sel) {
        var card = w.document.querySelector(sel), seq = [];
        (function walk(el, d) {
          Array.prototype.forEach.call(el.children, function (c) {
            if (w.getComputedStyle(c).display === 'none') return;
            var r = roleOf(c);
            if (r) { seq.push(r); return; }
            if (d < 2) walk(c, d + 1);
          });
        })(card, 0);
        return seq;
      }
      await open(w, OFFER);
      var offer = sequence(w, '#page-offer-detail .offer-header-card');

      var buy = { id: 'P9', kind: 'rfq', owner_id: OTHER, title: 'ต้องการซื้อ',
        province: 'เชียงใหม่', status: 'open', deadline: '2099-01-01T00:00:00Z',
        post_images: [], post_attachments: [], quotes: [],
        profiles: { company_name: 'บจก. ผู้ซื้อ', avatar_url: null } };
      plan(w, { posts: { _: { data: buy, error: null } }, _: { data: [], error: null } });
      signIn(w);
      await w.kxOpenPost(buy.id, 'rfq');
      for (var i = 0; i < 80; i++) {
        var el = w.document.querySelector('#page-rfq-detail .post-owner-name');
        if (el && el.textContent === 'บจก. ผู้ซื้อ') break;
        await new Promise(function (r) { setTimeout(r, 10); });
      }
      restore(w);
      var rfq = sequence(w, '#page-rfq-detail .header-card');

      expect(offer.filter(function (b) { return b !== 'PRICE'; })).toEqual(rfq,
        'ประกาศขาย: ' + offer.join(' → ') + '   ต้องการซื้อ: ' + rfq.join(' → '));
    });
  });


  // ======================================= ตรวจสอบการยืนยันตัวตน (admin queue) ===
  /* The applicant's half shipped long ago; nothing could answer a request
     because deciding was left to the service role and the app holds the anon
     key. These cover the app's half. The actual boundary is the RLS policy and
     the is_admin check inside kx_decide_verification, which live in
     database/verification_review.sql and are not reachable from here. */
  describe('page-admin-verify — the queue', function () {
    var PENDING = {
      id: 'req-1', profile_id: OTHER, kind: 'company', status: 'pending', note: null,
      files: [{ label: 'หนังสือรับรองบริษัท', name: 'cert.pdf', path: OTHER + '/cert.pdf' }],
      created_at: '2026-08-20T00:00:00Z', decided_at: null,
      profiles: { company_name: 'บจก. ทดสอบ', avatar_url: null, is_verified: false }
    };
    var DECIDED = {
      id: 'req-2', profile_id: THIRD, kind: 'person', status: 'approved', note: 'เอกสารครบ',
      files: [], created_at: '2026-08-10T00:00:00Z', decided_at: '2026-08-12T00:00:00Z',
      profiles: { company_name: 'สมชาย', avatar_url: null, is_verified: true }
    };
    function asAdmin(w, yes) {
      signIn(w);
      w.kxCurrentUser = { id: ME, company_name: 'ผู้ดูแล', is_admin: !!yes };
    }
    async function loadQueue(w, data) {
      /* kxDecideVerify asks confirm() before it writes. Stubbing that per test
         and putting it back left a window where a real dialog could open, and a
         native dialog blocks the page — the whole suite stops, which is a worse
         failure than any assertion. It stays stubbed for this group; the app
         window is a fixture, not something to hand back pristine. */
      w.confirm = function () { return true; };
      var sb = plan(w, { verification_requests: { _: { data: data, error: null } } });
      // the documents sit in a private bucket; the real helper asks storage for
      // a signed URL, which the fake sb has no storage to answer. Put the real
      // one back afterwards — fillDocs runs un-awaited, so the wait first.
      var realSigned = w.kxSignedUrl;
      w.kxSignedUrl = function (b, p) { return Promise.resolve('signed:' + b + '/' + p); };
      await w.kxLoadVerifyQueue();
      await new Promise(function (r) { setTimeout(r, 60); });
      w.kxSignedUrl = realSigned;
      return sb;
    }

    it('keeps the rail entry away from an ordinary account', function (w) {
      asAdmin(w, false);
      w.renderSidebars('page-feed');
      var nav = w.document.querySelector('#page-feed .side-nav').textContent;
      expect(/ตรวจสอบการยืนยันตัวตน/.test(nav)).toBe(false);
    });
    it('shows it to an administrator', function (w) {
      asAdmin(w, true);
      w.renderSidebars('page-feed');
      var nav = w.document.querySelector('#page-feed .side-nav').textContent;
      expect(/ตรวจสอบการยืนยันตัวตน/.test(nav)).toBe(true);
      w.kxCurrentUser = null;
    });
    it('turns an ordinary account away from the page', async function (w) {
      asAdmin(w, false);
      await w.kxLoadVerifyQueue();
      expect(w.document.getElementById('avList').textContent).toContain('ผู้ดูแลระบบเท่านั้น');
    });
    it('never queries the table for a non-admin', async function (w) {
      asAdmin(w, false);
      var sb = plan(w, { verification_requests: { _: { data: [], error: null } } });
      await w.kxLoadVerifyQueue();
      restore(w);
      expect(sb._calls.length).toBe(0, 'it stops before asking');
    });
    it('lists the pending requests and counts them', async function (w) {
      asAdmin(w, true);
      await loadQueue(w, [PENDING, DECIDED]);
      restore(w);
      expect(w.document.querySelectorAll('#avList .av-card').length).toBe(1, 'the pending tab shows only pending');
      expect(w.document.getElementById('avPendingN').textContent).toBe('(1)');
      expect(w.document.querySelector('#avList .av-who').textContent).toBe('บจก. ทดสอบ');
    });
    it('reaches the documents through a signed URL, not a public one', async function (w) {
      asAdmin(w, true);
      await loadQueue(w, [PENDING]);
      restore(w);
      var link = w.document.querySelector('#avList a.av-doc');
      expect(link).toBeTruthy('the tile becomes a link once the URL is granted');
      expect(link.getAttribute('href')).toContain('verify-docs',
        'a photo of an ID card must not be readable from the public attachments bucket');
    });
    it('refuses to reject without a reason, and asks nothing of the server', async function (w) {
      asAdmin(w, true);
      var sb = await loadQueue(w, [PENDING]);
      sb._calls.length = 0;
      w.document.querySelector('#avList .av-actions .btn-outline').click();
      await new Promise(function (r) { setTimeout(r, 60); });
      restore(w);
      expect(sb._calls.filter(function (c) { return c.rpc; }).length).toBe(0,
        'the note is what the applicant is told, so a blank one helps nobody');
    });
    it('sends the decision, the request id and the reason', async function (w) {
      asAdmin(w, true);
      var sb = await loadQueue(w, [PENDING]);
      w.document.querySelector('#avList .av-reason').value = 'เอกสารไม่ชัด';
      w.document.querySelector('#avList .av-actions .btn-outline').click();
      await new Promise(function (r) { setTimeout(r, 80); });
      restore(w);
      var call = sb._calls.filter(function (c) { return c.rpc === 'kx_decide_verification'; })[0];
      expect(call).toBeTruthy();
      expect(call.args).toEqual({ req_id: 'req-1', approve: false, admin_note: 'เอกสารไม่ชัด' });
    });
    it('approves with approve:true and no reason required', async function (w) {
      asAdmin(w, true);
      var sb = await loadQueue(w, [PENDING]);
      w.document.querySelector('#avList .av-actions .btn-primary').click();
      await new Promise(function (r) { setTimeout(r, 80); });
      restore(w);
      var call = sb._calls.filter(function (c) { return c.rpc === 'kx_decide_verification'; })[0];
      expect(call.args.approve).toBe(true);
      expect(call.args.req_id).toBe('req-1');
    });
    it('offers a way back for an approval given by mistake', async function (w) {
      asAdmin(w, true);
      await loadQueue(w, [PENDING, DECIDED]);
      w.kxVerifyFilter(w.document.querySelectorAll('#avTabs .sh-tab')[1], 'approved');
      await new Promise(function (r) { setTimeout(r, 40); });
      restore(w);
      var btn = w.document.querySelector('#avList .av-card .btn-outline');
      expect(btn).toBeTruthy('an approval you cannot take back is one you cannot safely give');
      expect(btn.textContent).toContain('ถอน');
      expect(w.document.querySelector('#avList .av-note').textContent).toContain('เอกสารครบ');
    });
    it('says which migration is missing rather than failing blankly', async function (w) {
      asAdmin(w, true);
      plan(w, { verification_requests: { _: { data: null, error: ERR.tableMissing } } });
      await w.kxLoadVerifyQueue();
      restore(w);
      expect(w.document.getElementById('avList').textContent).toContain('verification_review.sql');
      w.kxCurrentUser = null;
    });
  });

  describe('submitVerify — where the documents go', function () {
    /* `attachments` carries "anyone can view attachments ... to public", so a
       photograph of a national ID card uploaded there was readable by anyone
       holding the URL, signed out. This reads the shipped source rather than
       the running page, because the upload only happens with a real file
       picked — and the bucket name is the whole point. */
    it('never sends a verification document to the public bucket', async function (w) {
      var src = await (await fetch('../index.html')).text();
      var i = src.indexOf('async function submitVerify');
      expect(i > -1).toBe(true, 'submitVerify should still exist');
      var body = src.slice(i, i + 2600);
      expect(body).toContain("kxUploadFile('verify-docs'",
        'verification documents belong in the private bucket');
      expect(/kxUploadFile\('attachments'/.test(body)).toBe(false,
        'attachments is world-readable by policy');
    });
    it('stores the storage path, since a private bucket has no public URL', async function (w) {
      var src = await (await fetch('../index.html')).text();
      var i = src.indexOf('async function submitVerify');
      var body = src.slice(i, i + 2600);
      expect(body).toContain('returnPath', 'kxUploadFile hands back a path for a private bucket');
    });
    it('exposes a signed-URL helper that returns null when storage refuses', async function (w) {
      var realSb = w.sb;
      w.sb = { storage: { from: function () {
        return { createSignedUrl: function () {
          return Promise.resolve({ data: null, error: { message: 'denied' } }); } }; } } };
      var url = await w.kxSignedUrl('verify-docs', 'someone-else/id.jpg');
      w.sb = realSb;
      expect(url).toBe(null, 'a refused document shows a placeholder, never a broken link');
    });
  });

})(window.KX);
