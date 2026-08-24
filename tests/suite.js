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
    it('leaves the wall and ผลงานล่าสุด across both columns', function (w) {
      var r = widths(w, ['pfWallCard','pfRecentCard']);
      var wrong = r.filter(function (x) { return !x.spans; }).map(function (x) { return x.id; });
      expect(wrong).toEqual([], 'these are lists of posts — half a column reads badly');
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

  // ============================================================== the sidebar ===
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
})(window.KX);
