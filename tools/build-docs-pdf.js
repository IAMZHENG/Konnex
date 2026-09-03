/* ============================================================================
 * ออกไฟล์ PDF ของข้อกำหนดการใช้งาน และ นโยบายความเป็นส่วนตัว
 * ============================================================================
 * Run from the project root:   node tools/build-docs-pdf.js
 *
 * The documents are **extracted from index.html**, never retyped. A PDF that
 * says something the app does not is exactly the failure this whole exercise
 * exists to avoid, and a second copy of the wording is how that happens.
 *
 * Printing is done by the Chrome that is already on the machine, so the text in
 * the PDF is real selectable text in the app's own Thai font — not the shape of
 * text. (The draft this was modelled on had every glyph converted to outlines,
 * which is why nothing in it could be searched, copied, or read by a screen
 * reader.) The page is served over http for the duration, because @font-face
 * from a file:// page is not reliably allowed.
 *
 * No dependencies: http and child_process are built in, and Chrome is found by
 * looking in the usual places.
 * ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, 'docs');
const PORT = 8899;

// ---------------------------------------------------------------- chrome ---
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

// ----------------------------------------------------- pull from index.html ---
const src = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

function docOf(pageId) {
  const page = src.indexOf('<div id="' + pageId + '" class="app-page">');
  if (page < 0) throw new Error('ไม่พบ ' + pageId + ' ใน index.html');
  const a = src.indexOf('<article class="legal-doc">', page);
  const b = src.indexOf('</article>', a);
  if (a < 0 || b < 0) throw new Error('โครงสร้าง ' + pageId + ' เปลี่ยนไป');
  return src.slice(a, b + '</article>'.length);
}

const faces = [];
for (let i = 0; (i = src.indexOf('@font-face', i)) >= 0; ) {
  const close = src.indexOf('}', src.indexOf('src:', i));
  faces.push(src.slice(i, close + 1));
  i = close + 1;
}

const CSS_START = '/* ===== ข้อกำหนดการใช้งาน / นโยบายความเป็นส่วนตัว ===== */';
const CSS_END   = '/* ===== เวิร์ดมาร์ก QubeQuote =====';
const a = src.indexOf(CSS_START), b = src.indexOf(CSS_END, a);
if (a < 0 || b < 0) throw new Error('ไม่พบบล็อก CSS ของเอกสารใน index.html');
const docCss = src.slice(a, b);

function pageHtml(bodyHtml, title) {
  return `<!DOCTYPE html>
<html lang="th"><head><meta charset="UTF-8"><title>${title}</title>
<style>
${faces.join('\n')}
:root{ --ink:#1c1a18; --ink-soft:#565b6e; --line:#e6e7f0; }
*{ box-sizing:border-box; }
body{ margin:0; background:#fff; color:var(--ink);
  font-family:'IBM Plex Sans Thai','IBM Plex Sans',system-ui,sans-serif;
  -webkit-print-color-adjust:exact; print-color-adjust:exact; }
${docCss}
/* on paper the page is the card, so the card chrome goes */
.legal-doc{ border:0; border-radius:0; padding:0; font-size:13.5px; line-height:1.85; }
.legal-doc h1{ font-size:23px; }
.legal-doc h2{ font-size:14.5px; margin:22px 0 8px; }
.doc-head{ margin-bottom:20px; }
.doc-foot{ display:none; }              /* an in-app link is not a thing on paper */
.page-break{ break-after:page; page-break-after:always; height:0; }
/* a heading stranded at the foot of a page is the one thing print gets wrong
   that a screen never does */
.legal-doc h1, .legal-doc h2{ break-after:avoid; page-break-after:avoid; }
.legal-doc p, .doc-note, .doc-table, .doc-contact{ break-inside:avoid; page-break-inside:avoid; }
.doc-table{ font-size:12.5px; }
@page{ size:A4; margin:16mm 15mm 18mm; }
</style></head><body>
${bodyHtml}
</body></html>`;
}

const terms = docOf('page-terms');
const privacy = docOf('page-privacy');

/* ---------------------------------------------------------------------------
 * Standalone web pages at real paths.
 *
 * Inside the app these documents live behind a hash route, and a hash never
 * reaches a server: nothing that fetches the URL — Facebook's app review,
 * Google's OAuth consent screen, a link checker — can see anything but the app
 * shell. Both of those require a privacy policy URL before they will let an
 * app go live, so the documents need an address of their own.
 *
 * Same extraction as the PDFs, so there is still only one source for the
 * wording, and the same stylesheet, so they look like the app.
 * ------------------------------------------------------------------------- */
function webPage(bodyHtml, title, otherHref, otherLabel) {
  return `<!DOCTYPE html>
<html lang="th"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<link rel="icon" type="image/svg+xml" href="assets/img/qubequote-icon.svg">
<style>
${faces.join('\n')}
:root{ --ink:#1c1a18; --ink-soft:#565b6e; --line:#e6e7f0; --bg:#f6f8fc; --blue-700:#0846c7; }
*{ box-sizing:border-box; }
body{ margin:0; background:var(--bg); color:var(--ink);
  font-family:'IBM Plex Sans Thai','IBM Plex Sans',system-ui,sans-serif; }
${docCss}
.doc-foot a{ color:var(--blue-700); text-decoration:none; font-weight:600; }
.doc-foot a:hover{ text-decoration:underline; }
</style></head><body>
<div class="doc-wrap">
${bodyHtml}
<p style="max-width:860px;margin:16px auto 0;font-size:13px;color:var(--ink-soft);text-align:center">
  <a href="/" style="color:var(--blue-700);text-decoration:none">← กลับไปที่ QubeQuote</a>
  &nbsp;·&nbsp;
  <a href="${otherHref}" style="color:var(--blue-700);text-decoration:none">${otherLabel}</a>
</p>
</div>
</body></html>`;
}

// the in-app cross-link navigates the SPA; on a standalone page it must be a href
const asWeb = (html, href, label) =>
  html.replace(/<a class="au-link"[^>]*>[^<]*<\/a>/,
               '<a class="au-link" href="' + href + '">' + label + '</a>');

fs.writeFileSync(path.join(ROOT, 'terms.html'), webPage(
  asWeb(terms, 'privacy.html', 'อ่านนโยบายความเป็นส่วนตัว →'),
  'ข้อกำหนดการใช้งาน — QubeQuote', 'privacy.html', 'นโยบายความเป็นส่วนตัว'));
fs.writeFileSync(path.join(ROOT, 'privacy.html'), webPage(
  asWeb(privacy, 'terms.html', 'อ่านข้อกำหนดการใช้งาน →'),
  'นโยบายความเป็นส่วนตัว — QubeQuote', 'terms.html', 'ข้อกำหนดการใช้งาน'));
console.log('   เขียน terms.html และ privacy.html (หน้าแยก มี URL จริง)');

const JOBS = [
  { file: '_print-both.html',
    html: pageHtml(terms + '\n<div class="page-break"></div>\n' + privacy,
                   'QubeQuote — ข้อกำหนดการใช้งาน และ นโยบายความเป็นส่วนตัว'),
    pdf:  'QubeQuote-ข้อกำหนดการใช้งาน-และ-นโยบายความเป็นส่วนตัว.pdf' },
  { file: '_print-terms.html',
    html: pageHtml(terms, 'QubeQuote — ข้อกำหนดการใช้งาน'),
    pdf:  'QubeQuote-ข้อกำหนดการใช้งาน.pdf' },
  { file: '_print-privacy.html',
    html: pageHtml(privacy, 'QubeQuote — นโยบายความเป็นส่วนตัว'),
    pdf:  'QubeQuote-นโยบายความเป็นส่วนตัว.pdf' }
];

// ---------------------------------------------------------------- serve -----
const TYPES = { '.html': 'text/html; charset=utf-8', '.woff2': 'font/woff2',
                '.svg': 'image/svg+xml', '.png': 'image/png', '.css': 'text/css' };
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
// throwaway profile so this never attaches to the user's own browser
const profileDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'qq-pdf-'));
fs.mkdirSync(OUT_DIR, { recursive: true });

/* Chrome has to be waited for asynchronously. The page it prints is served by
   this same process, and execFileSync blocks the event loop — so the request
   for the page arrives at a server that cannot answer it, and the two sides sit
   waiting for each other until something times out. */
function run(job, index) {
  return new Promise((resolve, reject) => {
    fs.writeFileSync(path.join(ROOT, job.file), job.html);
    // Chrome writes to an ASCII path and Node does the renaming: a Thai path
    // handed through CreateProcess is at the mercy of the console codepage
    const tmpPdf = path.join(profileDir, 'out-' + index + '.pdf');
    const child = spawn(chrome, [
      '--headless=new', '--disable-gpu', '--no-sandbox',
      // a fresh profile, or Chrome hands the job to whatever instance is
      // already running on the machine and this call never returns
      '--user-data-dir=' + profileDir,
      '--no-first-run', '--no-default-browser-check',
      // The fonts have to have arrived before the page is drawn, or Thai prints
      // in a fallback face and nobody notices until it is on paper.
      // (--run-all-compositor-stages-before-draw looks like the flag for this
      // and hangs headless=new indefinitely; the virtual clock is enough.)
      '--virtual-time-budget=20000',
      '--print-to-pdf-no-header',
      '--print-to-pdf=' + tmpPdf,
      'http://127.0.0.1:' + PORT + '/' + job.file
    ], { stdio: ['ignore', 'ignore', 'ignore'] });

    const killer = setTimeout(() => { child.kill(); reject(new Error('Chrome ค้างเกิน 90 วินาที')); }, 90000);
    child.on('error', e => { clearTimeout(killer); reject(e); });
    child.on('close', () => {
      clearTimeout(killer);
      try {
        if (!fs.existsSync(tmpPdf)) throw new Error('Chrome ไม่ได้เขียนไฟล์ออกมา: ' + job.pdf);
        const out = path.join(OUT_DIR, job.pdf);
        fs.copyFileSync(tmpPdf, out);
        const buf = fs.readFileSync(out);
        const text = buf.toString('latin1');
        const pages = (text.match(/\/Type\s*\/Page[^s]/g) || []).length;
        /* Judged on the object dictionaries, which are plain, and never on the
           drawing operators, which live inside compressed streams — a `Tj` is
           found there or not by luck, and this check failed one file for that
           reason while passing the other two on the same data.
           An embedded font program plus a ToUnicode map is what separates real
           searchable text from text converted to outlines. */
        const embedded = /\/FontFile[23]?\b/.test(text);
        const mapped = /ToUnicode/.test(text);
        const thai = /IBMPlexSansThai/.test(text);
        if (!pages) throw new Error(job.pdf + ' ออกมาไม่มีหน้า');
        if (!embedded || !mapped)
          throw new Error(job.pdf + ' ไม่ใช่ข้อความจริง (ฟอนต์ฝัง=' + embedded +
                          ' ToUnicode=' + mapped + ')');
        if (!thai) throw new Error(job.pdf + ' ไม่ได้ใช้ฟอนต์ไทยของแอป — โหลดฟอนต์ไม่ทัน');
        console.log(String(pages).padStart(2) + ' หน้า  ' +
                    String(buf.length).padStart(7) + ' ไบต์  docs/' + job.pdf);
        resolve();
      } catch (e) { reject(e); }
    });
  });
}

server.listen(PORT, '127.0.0.1', async () => {
  let failed = null;
  try {
    for (let i = 0; i < JOBS.length; i++) await run(JOBS[i], i);
  } catch (e) {
    failed = e;
  } finally {
    JOBS.forEach(j => { try { fs.unlinkSync(path.join(ROOT, j.file)); } catch (e) {} });
    try { fs.rmSync(profileDir, { recursive: true, force: true }); } catch (e) {}
    server.close();
  }
  if (failed) { console.error(String(failed.message || failed)); process.exit(1); }
});
