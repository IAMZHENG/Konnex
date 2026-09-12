/* ============================================================================
 * ออกคลิปอธิบาย 4 ขั้นตอน (MP4 + เพลง, ~34 วินาที) สามกรอบภาพ
 * ============================================================================
 * Run from the project root:   node tools/build-clip.js [9x16|16x9|1x1|all]
 * Writes marketing/qubequote-4-steps-<framing>.mp4   (default: all three)
 *
 *   9x16  1080x1920  Reels / TikTok / Shorts / LINE
 *   16x9  1920x1080  YouTube, Facebook video
 *   1x1   1080x1080  Facebook feed
 *
 * The clip is drawn and encoded entirely inside Chrome — tools/clip/clip.html
 * paints every frame on a canvas, the browser's own H.264 encoder (WebCodecs)
 * compresses them, mp4-muxer wraps the result — and the page POSTs the file
 * back to this script. No ffmpeg, no screen recording, no video toolchain:
 * the same headless-Chrome method as build-og-image.js, for the same reason.
 *
 * The project is served over http for the duration so the page can read the
 * brand mark and the app's own fonts; the @font-face rules are read out of
 * index.html and injected, so the clip is set in exactly the face the site
 * uses. Nothing here touches the app, the database, or the deployed site.
 *
 * To watch it before rendering: serve the root (npx serve -l 8845 .) and open
 * http://localhost:8845/tools/clip/clip.html?play=1 — but note that page
 * expects the fonts injected by this script; run this once to write
 * tools/clip/clip.preview.html, which has them inlined.
 * ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, 'marketing');
const PORT = 8899;
const FRAMINGS = { '9x16': [1080, 1920], '16x9': [1920, 1080], '1x1': [1080, 1080] };
const want = process.argv[2] && process.argv[2] !== 'all' ? [process.argv[2]] : Object.keys(FRAMINGS);
for (const f of want) if (!FRAMINGS[f]) { console.error('ไม่รู้จักกรอบ ' + f + ' — ใช้ ' + Object.keys(FRAMINGS).join(', ')); process.exit(1); }
const outFor = f => path.join(OUT_DIR, 'qubequote-4-steps-' + f + '.mp4');

function findChrome() {
  const candidates = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Google/Chrome/Application/chrome.exe'),
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    '/usr/bin/google-chrome', '/usr/bin/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  ];
  for (const c of candidates) { try { if (fs.statSync(c).isFile()) return c; } catch (e) {} }
  throw new Error('ไม่พบ Chrome หรือ Edge — ติดตั้งอย่างใดอย่างหนึ่งก่อน');
}

const src = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const faces = [];
for (let i = 0; (i = src.indexOf('@font-face', i)) >= 0; ) {
  const close = src.indexOf('}', src.indexOf('src:', i));
  faces.push(src.slice(i, close + 1).replace(/url\("assets\//g, 'url("/assets/'));
  i = close + 1;
}
if (!faces.length) throw new Error('ไม่พบ @font-face ใน index.html');

const pageSrc = fs.readFileSync(path.join(ROOT, 'tools', 'clip', 'clip.html'), 'utf8')
  .replace('<!-- FONTS -->', '<style>' + faces.join('\n') + '</style>');
// a copy with the fonts inlined, for watching it in a normal browser tab
fs.writeFileSync(path.join(ROOT, 'tools', 'clip', 'clip.preview.html'), pageSrc);

const MIME = { '.html': 'text/html; charset=utf-8', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
               '.png': 'image/png', '.jpg': 'image/jpeg', '.js': 'text/javascript', '.css': 'text/css' };

let chrome = null, finished = false, queue = want.slice(), current = null, failed = 0;
function finish(code, msg) {
  if (finished) return; finished = true;
  if (msg) console[code ? 'error' : 'log'](msg);
  if (chrome) try { chrome.kill(); } catch (e) {}
  server.close(() => process.exit(code));
  setTimeout(() => process.exit(code), 1500).unref();
}
// one Chrome per framing, in turn; the page reports back through /save
function next() {
  if (chrome) { try { chrome.kill(); } catch (e) {} chrome = null; }
  current = queue.shift();
  if (!current) return finish(failed ? 1 : 0, failed ? failed + ' กรอบไม่สำเร็จ' : 'ครบทั้ง ' + want.length + ' กรอบ');
  const [w, h] = FRAMINGS[current];
  const exe = findChrome();
  const profile = path.join(require('os').tmpdir(), 'kx-clip-profile');
  console.log('กำลังเรนเดอร์ ' + current + ' (' + w + 'x' + h + ') ใน ' + path.basename(exe) + ' …');
  const mine = chrome = spawn(exe, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
    '--user-data-dir=' + profile,
    // the encoder must run at its own pace; a virtual-time budget would starve it
    '--window-size=' + (w + 120) + ',' + (h + 280),
    'http://127.0.0.1:' + PORT + '/clip?w=' + w + '&h=' + h + '&name=' + current
  ], { stdio: 'ignore' });
  mine.on('exit', code => { if (chrome === mine && !finished) { console.error(current + ': Chrome ปิดก่อนส่งไฟล์ (code ' + code + ')'); failed++; next(); } });
}

const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/save') {
    const chunks = [];
    req.on('data', d => chunks.push(d));
    req.on('end', () => {
      const body = Buffer.concat(chunks);
      res.writeHead(200); res.end('ok');
      if (req.headers['x-error']) { console.error(current + ': หน้าเรนเดอร์รายงานข้อผิดพลาด:\n' + body.toString('utf8')); failed++; return next(); }
      fs.mkdirSync(OUT_DIR, { recursive: true });
      const out = outFor(current);
      fs.writeFileSync(out, body);
      console.log('เขียน ' + path.relative(ROOT, out) + ' (' + (body.length / 1e6).toFixed(1) + ' MB)');
      next();
    });
    return;
  }
  const url = decodeURIComponent(req.url.split('?')[0]);
  if (url === '/clip') { res.writeHead(200, { 'Content-Type': MIME['.html'] }); res.end(pageSrc); return; }
  const file = path.join(ROOT, url);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

server.listen(PORT, '127.0.0.1', () => {
  next();
  setTimeout(() => finish(1, 'หมดเวลา 20 นาที'), 20 * 60 * 1000).unref();
});
