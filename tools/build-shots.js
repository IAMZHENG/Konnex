/* ============================================================================
 * ถ่ายหน้าเว็บ (บนข้อมูลตัวอย่าง) มาใช้ในคลิป
 * ============================================================================
 * Run from the project root:   node tools/build-shots.js [page ...]
 * Writes marketing/shots/<page>.png — phone-sized (480 CSS px wide, 2x) captures
 * of the real app drawing sample data, which the clips show inside their phone
 * frame. Nothing here is committed: marketing/ is git-ignored.
 *
 * The pages are tools/shots/sample.html: index.html in an iframe, its Supabase
 * client swapped for the test suite's fake and a fake session, so signed-in
 * pages (โพสต์ประกาศ, เปรียบเทียบข้อเสนอ, the quote form, ใบเสนอราคา ที่ส่ง) can be
 * drawn without an account — and without anyone real on screen: every company
 * is invented and no profile has a photo. The project is served over http for
 * the duration, like build-clip.js does; the app's boot still reaches the live
 * project for its first reads (it cannot be stopped before it runs), but the
 * fake is in place before any page in the list is drawn, and nothing writes.
 *
 * 480 wide, not 390: below that the page's layout is wider than headless
 * Chrome's window, and the right edge (เข้าสู่ระบบ, โพสต์ประกาศ) is cut off.
 * ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const { spawn } = require('child_process');

const ROOT = process.cwd();
const PORT = 8898;
const OUT = path.join(ROOT, 'marketing', 'shots');
fs.mkdirSync(OUT, { recursive: true });

// page → window height in CSS px (the modal one is short so the overlay centres its box).
// keep these at 2400 or under; taller windows fail more often than not
const PAGES = { feed: 2400, compose: 2400, compare: 2400, detail: 2400, quote: 1500, mybids: 1800, auth: 1040 };
const want = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(PAGES);
for (const p of want) if (!PAGES[p]) { console.error('ไม่รู้จักหน้า ' + p + ' — มี ' + Object.keys(PAGES).join(', ')); process.exit(1); }

function findChrome() {
  for (const c of ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
                   path.join(process.env.LOCALAPPDATA || '', 'Google/Chrome/Application/chrome.exe'), '/usr/bin/google-chrome', '/usr/bin/chromium',
                   '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'])
    try { if (fs.statSync(c).isFile()) return c; } catch (e) {}
  throw new Error('ไม่พบ Chrome');
}
const exe = findChrome();

const MIME = { '.html': 'text/html; charset=utf-8', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png',
               '.jpg': 'image/jpeg', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.pdf': 'application/pdf' };
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  const file = path.join(ROOT, url === '/' ? 'index.html' : url);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

function shoot(page) {
  return new Promise((resolve, reject) => {
    const out = path.join(OUT, page + '.png');
    try { fs.unlinkSync(out); } catch (e) {}
    // a fresh profile every time: the app keeps timers and sockets alive, so a headless
    // Chrome can outlive its screenshot, and a second one on the same profile hands
    // off to it and writes nothing
    const profile = path.join(os.tmpdir(), 'kx-shot-' + page + '-' + Date.now());
    const p = spawn(exe, ['--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars', '--user-data-dir=' + profile,
      '--force-device-scale-factor=2', '--virtual-time-budget=25000', '--window-size=480,' + PAGES[page],
      '--screenshot=' + out, 'http://127.0.0.1:' + PORT + '/tools/shots/sample.html?page=' + page], { stdio: ['ignore', 'pipe', 'pipe'] });
    // piped, not ignored: with stdio ignored Chrome writes nothing here
    let err = ''; p.stdout.on('data', () => {}); p.stderr.on('data', d => { err += d; });
    const watchdog = setTimeout(() => { p.kill(); }, 120000);
    // the file is the finish line; Chrome is not waited for beyond it
    const poll = setInterval(() => { if (fs.existsSync(out) && fs.statSync(out).size > 0) { clearInterval(poll); setTimeout(() => p.kill(), 300); } }, 500);
    p.on('exit', () => {
      clearTimeout(watchdog); clearInterval(poll);
      try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {}
      if (!fs.existsSync(out)) return reject(new Error(page + ': Chrome ไม่ได้เขียนภาพ ' + err.slice(-600)));
      console.log('  ' + path.relative(ROOT, out) + '  (' + (fs.statSync(out).size / 1024).toFixed(0) + ' KB)');
      resolve();
    });
  });
}

server.listen(PORT, '127.0.0.1', async () => {
  try {
    // headless Chrome now and then exits after a minute without writing, for no
    // reason the page shows — the same page passes on the next try
    for (const p of want) {
      let last;
      for (let i = 0; i < 3; i++) { try { await shoot(p); last = null; break; } catch (e) { last = e; console.log('  ' + p + ': ลองใหม่ (' + (i + 1) + ')'); } }
      if (last) throw last;
    }
    fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify({ source: 'tools/shots/sample.html', pages: want, taken: new Date().toISOString(), width: 480, scale: 2 }, null, 2));
    console.log('ครบ');
    server.close(() => process.exit(0));
  } catch (e) { console.error('ผิดพลาด: ' + e.message); server.close(() => process.exit(1)); }
});
