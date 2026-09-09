/* ============================================================================
 * ออกรูปการ์ดแชร์ 1200x630 (Open Graph)
 * ============================================================================
 * Run from the project root:   node tools/build-og-image.js
 * Writes assets/img/qubequote-og.png
 *
 * LINE, Facebook and every other scraper draw a link from og:image. A square
 * icon gets a small thumbnail card beside the text; 1200x630 gets the wide one,
 * where the tagline is actually readable in a chat list.
 *
 * Same method as tools/build-docs-pdf.js and for the same reason: the page is
 * served over http for the duration, because @font-face from a file:// page is
 * not reliably allowed, and the fonts have to have arrived before the shot is
 * taken or the Thai renders in a fallback face. The font declarations and the
 * brand mark are read out of index.html rather than retyped, so the card cannot
 * drift from the site it advertises.
 *
 * The wording comes from the page's own <title> and description meta, for the
 * same reason — a share card that promises something the page does not say is
 * the kind of mismatch nobody notices until a customer does.
 * ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const ROOT = process.cwd();
const OUT = path.join(ROOT, 'assets', 'img', 'qubequote-og.png');
const PORT = 8898;
const W = 1200, H = 630;

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

// the @font-face blocks, so the card is set in the app's own Thai face
const faces = [];
for (let i = 0; (i = src.indexOf('@font-face', i)) >= 0; ) {
  const close = src.indexOf('}', src.indexOf('src:', i));
  faces.push(src.slice(i, close + 1));
  i = close + 1;
}

function meta(name) {
  const re = new RegExp('<meta[^>]*name="' + name + '"[^>]*content="([^"]*)"', 'i');
  const m = re.exec(src);
  return m ? m[1] : '';
}
const titleTag = (/<title>([^<]*)<\/title>/i.exec(src) || [, 'QubeQuote'])[1];
// "QubeQuote — ให้ผู้ขายเสนอราคามาหาคุณ" splits into a wordmark and a promise
const dash = titleTag.indexOf('—');
const brand   = (dash > -1 ? titleTag.slice(0, dash) : titleTag).trim();
const tagline = (dash > -1 ? titleTag.slice(dash + 1) : '').trim();
if (!tagline) throw new Error('<title> ไม่มีสโลแกนหลังเครื่องหมาย — ตรวจ index.html');

/* Three chips. The description is one sentence of clauses and splitting Thai
   prose on punctuation gives ragged fragments, so these are written out — and
   then checked against the description, which is what keeps the card and the
   page saying the same thing. */
const desc = meta('description');
const chips = ['โพสต์สิ่งที่ต้องการซื้อ', 'ผู้ขายหลายรายเสนอราคา', 'เปรียบเทียบราคาและเงื่อนไข'];
for (const c of chips) {
  if (desc && desc.indexOf(c.slice(0, 8)) < 0) {
    console.warn('เตือน: "' + c + '" ไม่ปรากฏใน meta description — การ์ดกับหน้าเว็บอาจไม่ตรงกัน');
  }
}

const markWhite = fs.readFileSync(path.join(ROOT, 'assets/img/qubequote-mark-white.svg'), 'utf8')
  .replace(/<\?xml[^>]*\?>/, '')
  .replace(/width="[^"]*"/, 'width="132"')
  .replace(/height="[^"]*"/, 'height="146"');

const html = `<!DOCTYPE html>
<html lang="th"><head><meta charset="UTF-8"><title>og</title>
<style>
${faces.join('\n')}
*{ box-sizing:border-box; margin:0; padding:0; }
html,body{ width:${W}px; height:${H}px; overflow:hidden; }
body{
  font-family:'IBM Plex Sans Thai','IBM Plex Sans',system-ui,sans-serif;
  color:#fff;
  /* the deep end of the brand blues: a link in a chat list sits on white, and
     this is what separates the card from it */
  background:
    radial-gradient(1100px 620px at 82% -12%, #0a5bff 0%, rgba(10,91,255,0) 62%),
    linear-gradient(146deg, #0846c7 0%, #052a7a 100%);
  display:flex; flex-direction:column; justify-content:center;
  padding:0 84px; position:relative;
}
/* one large hexagon bled off the right edge, echoing the mark without
   competing with it */
.ghost{ position:absolute; right:-118px; top:50%; transform:translateY(-50%);
  width:520px; height:520px; opacity:.085; }
.ghost svg{ width:100%; height:100%; }
.row{ display:flex; align-items:center; gap:30px; }
.name{ font-size:82px; font-weight:700; letter-spacing:-1.2px; line-height:1; }
.tag{ font-size:46px; font-weight:600; margin-top:30px; line-height:1.34;
  color:#dbe6ff; max-width:820px; }
.chips{ display:flex; gap:12px; margin-top:44px; flex-wrap:wrap; }
.chip{ font-size:23px; font-weight:500; color:#eaf1ff;
  border:1.5px solid rgba(255,255,255,.34); border-radius:999px;
  padding:11px 22px; white-space:nowrap; }
.host{ position:absolute; left:84px; bottom:46px;
  font-size:22px; font-weight:500; color:#a9c4ff; letter-spacing:.3px; }
</style></head><body>
<div class="ghost">${markWhite.replace(/width="132"/, 'width="520"').replace(/height="146"/, 'height="520"')}</div>
<div class="row">${markWhite}<div class="name">${brand}</div></div>
<div class="tag">${tagline}</div>
<div class="chips">${chips.map(c => '<div class="chip">' + c + '</div>').join('')}</div>
<div class="host">qubequote.com</div>
</body></html>`;

const PAGE = '_og-card.html';
fs.writeFileSync(path.join(ROOT, PAGE), html);

const TYPES = { '.html': 'text/html; charset=utf-8', '.woff2': 'font/woff2',
                '.svg': 'image/svg+xml', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '');
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
});

const chrome = findChrome();
const profileDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'qq-og-'));

server.listen(PORT, '127.0.0.1', () => {
  const tmpPng = path.join(profileDir, 'og.png');
  const child = spawn(chrome, [
    '--headless=new', '--disable-gpu', '--no-sandbox',
    '--user-data-dir=' + profileDir, '--no-first-run', '--no-default-browser-check',
    '--hide-scrollbars',
    // the fonts must have landed before the shot; same virtual clock as the PDFs
    '--virtual-time-budget=20000',
    '--window-size=' + W + ',' + H,
    '--screenshot=' + tmpPng,
    'http://127.0.0.1:' + PORT + '/' + PAGE
  ], { stdio: ['ignore', 'ignore', 'ignore'] });

  const killer = setTimeout(() => { child.kill(); finish(new Error('Chrome ค้างเกิน 90 วินาที')); }, 90000);

  function finish(err) {
    clearTimeout(killer);
    try { fs.unlinkSync(path.join(ROOT, PAGE)); } catch (e) {}
    try { fs.rmSync(profileDir, { recursive: true, force: true }); } catch (e) {}
    server.close();
    if (err) { console.error(String(err.message || err)); process.exit(1); }
  }

  child.on('error', finish);
  child.on('close', () => {
    try {
      if (!fs.existsSync(tmpPng)) throw new Error('Chrome ไม่ได้เขียนไฟล์ออกมา');
      const buf = fs.readFileSync(tmpPng);
      /* PNG header: width and height are big-endian 32-bit at byte 16 and 20.
         Checked rather than trusted — a window-size flag that is ignored gives
         a card of the wrong shape, which scrapers crop rather than reject, so
         nothing complains and the result is simply wrong. */
      if (buf.slice(1, 4).toString('latin1') !== 'PNG') throw new Error('ไฟล์ที่ได้ไม่ใช่ PNG');
      const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
      if (w !== W || h !== H) throw new Error('ขนาดไม่ถูกต้อง: ' + w + 'x' + h + ' (ต้องการ ' + W + 'x' + H + ')');
      fs.mkdirSync(path.dirname(OUT), { recursive: true });
      fs.writeFileSync(OUT, buf);
      console.log(w + 'x' + h + '  ' + buf.length + ' ไบต์  ' + path.relative(ROOT, OUT));
      finish(null);
    } catch (e) { finish(e); }
  });
});
