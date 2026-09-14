/* ============================================================================
 * ออกคลิปการตลาด (MP4 + เพลง) สามกรอบภาพ
 * ============================================================================
 * Run from the project root:
 *   node tools/build-clip.js [4-steps|start|sell] [9x16|16x9|1x1|all]
 * Writes marketing/qubequote-<clip>-<framing>.mp4   (default: all three)
 *
 *   4-steps  คลิปอธิบาย 4 ขั้นตอน ~34 วินาที          tools/clip/clip.html
 *   start    เริ่มต้นใช้งานใน 1 นาที ~60 วินาที        tools/clip/start.html
 *   sell     เสนอราคาใน QubeQuote (ฝั่งผู้ขาย) ~60 วินาที   tools/clip/sell.html
 *
 *   9x16  1080x1920  Reels / TikTok / Shorts / LINE
 *   16x9  1920x1080  YouTube, Facebook video
 *   1x1   1080x1080  Facebook feed
 *
 *   --frame 12.5[,30,55]   instead of a video, save those moments as PNGs
 *                          (to --out <dir>, default marketing/frames) — for
 *                          checking a layout without a two-minute render
 *
 * A clip is drawn and encoded entirely inside Chrome — its page paints every
 * frame on a canvas, the browser's own H.264 encoder (WebCodecs) compresses
 * them, mp4-muxer wraps the result — and the page POSTs the file back to
 * this script. No ffmpeg, no screen recording, no video toolchain: the same
 * headless-Chrome method as build-og-image.js, for the same reason. The
 * drawing kit the pages share is tools/clip/lib.js.
 *
 * The project is served over http for the duration so the page can read the
 * brand mark and the app's own fonts; the @font-face rules are read out of
 * index.html and injected, so the clip is set in exactly the face the site
 * uses. Nothing here touches the app, the database, or the deployed site.
 *
 * To watch one before rendering: serve the root (npx serve -l 8845 .) and open
 * http://localhost:8845/tools/clip/<page>.preview.html?play=1 — the .preview
 * copy is written by this script with the app's fonts inlined, because the
 * page itself expects them injected.
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
const CLIPS = { '4-steps': 'clip.html', 'start': 'start.html', 'sell': 'sell.html' };

const args = process.argv.slice(2), flags = {};
for (let i = 0; i < args.length; i++) if (args[i].startsWith('--')) { flags[args[i].slice(2)] = args[i + 1]; args.splice(i, 2); i--; }
// the old form, a bare framing, still means the 4-steps clip
const clip = CLIPS[args[0]] ? args.shift() : '4-steps';
const want = args[0] && args[0] !== 'all' ? [args[0]] : Object.keys(FRAMINGS);
for (const f of want) if (!FRAMINGS[f]) { console.error('ไม่รู้จักกรอบ ' + f + ' — ใช้ ' + Object.keys(FRAMINGS).join(', ')); process.exit(1); }
const frames = flags.frame ? flags.frame.split(',').map(Number) : null;
const FRAME_DIR = flags.out || path.join(OUT_DIR, 'frames');
const outFor = f => path.join(OUT_DIR, 'qubequote-' + clip + '-' + f + '.mp4');

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

const pageFile = CLIPS[clip];
const pageSrc = fs.readFileSync(path.join(ROOT, 'tools', 'clip', pageFile), 'utf8')
  .replace('<!-- FONTS -->', '<style>' + faces.join('\n') + '</style>');
// a copy with the fonts inlined, for watching it in a normal browser tab
fs.writeFileSync(path.join(ROOT, 'tools', 'clip', pageFile.replace(/\.html$/, '.preview.html')), pageSrc);

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
// --frame: screenshots instead of a video, one Chrome run per (framing, t)
function shootFrames() {
  fs.mkdirSync(FRAME_DIR, { recursive: true });
  const exe = findChrome(), profile = path.join(require('os').tmpdir(), 'kx-clip-profile');
  const jobs = [];
  for (const f of want) for (const t of frames) jobs.push([f, t]);
  (function run() {
    const job = jobs.shift();
    if (!job) return finish(0, 'เขียนภาพ ' + want.length * frames.length + ' เฟรมไว้ที่ ' + path.relative(ROOT, FRAME_DIR));
    const [f, t] = job, [w, h] = FRAMINGS[f];
    const out = path.join(FRAME_DIR, clip + '-' + f + '-' + t.toFixed(1) + 's.png');
    const p = spawn(exe, ['--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars', '--user-data-dir=' + profile,
      '--window-size=' + w + ',' + h, '--virtual-time-budget=4000', '--screenshot=' + out,
      'http://127.0.0.1:' + PORT + '/clip?w=' + w + '&h=' + h + '&t=' + t + '&bare=1'], { stdio: 'ignore' });
    p.on('exit', () => { console.log('  ' + path.relative(ROOT, out)); run(); });
  })();
}
// one Chrome per framing, in turn; the page reports back through /save
function next() {
  if (chrome) { try { chrome.kill(); } catch (e) {} chrome = null; }
  current = queue.shift();
  if (!current) return finish(failed ? 1 : 0, failed ? failed + ' กรอบไม่สำเร็จ' : 'ครบทั้ง ' + want.length + ' กรอบ');
  const [w, h] = FRAMINGS[current];
  const exe = findChrome();
  const profile = path.join(require('os').tmpdir(), 'kx-clip-profile');
  console.log('กำลังเรนเดอร์ ' + clip + ' ' + current + ' (' + w + 'x' + h + ') ใน ' + path.basename(exe) + ' …');
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
  if (frames) return shootFrames();
  next();
  setTimeout(() => finish(1, 'หมดเวลา 20 นาที'), 20 * 60 * 1000).unref();
});
