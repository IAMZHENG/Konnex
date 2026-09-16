/* ============================================================================
 * ถ่ายหน้าเว็บจริงมาใช้ในคลิป
 * ============================================================================
 * Run from the project root:   node tools/build-shots.js [--site https://…]
 * Writes marketing/shots/<name>.png — phone-sized (480 CSS px wide, 2x) captures
 * of the live site's public pages, which tools/clip/intro.html shows inside
 * its phone frame. Nothing here is committed: marketing/ is git-ignored.
 *
 * Only pages a signed-out visitor can see are captured (the feed, a listing,
 * the sign-in page); nothing is entered anywhere. The listing is the newest
 * one on the feed at the time, read off the feed's own markup. The site is
 * the Workers deployment rather than qubequote.com because that hostname is
 * DNS-blocked on this machine (see README, "Known wrinkles").
 *
 * 480 wide, not 390: below that the page's layout is wider than headless
 * Chrome's window, and the right edge (เข้าสู่ระบบ, โพสต์ประกาศ) is cut off.
 * ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const ROOT = process.cwd();
const args = process.argv.slice(2), flags = {};
for (let i = 0; i < args.length; i++) if (args[i].startsWith('--')) { flags[args[i].slice(2)] = args[i + 1]; args.splice(i, 2); i--; }
const SITE = (flags.site || 'https://konnex.xeeb0262.workers.dev').replace(/\/$/, '');
const OUT = path.join(ROOT, 'marketing', 'shots');
fs.mkdirSync(OUT, { recursive: true });

function findChrome() {
  for (const c of ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
                   path.join(process.env.LOCALAPPDATA || '', 'Google/Chrome/Application/chrome.exe'), '/usr/bin/google-chrome', '/usr/bin/chromium',
                   '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'])
    try { if (fs.statSync(c).isFile()) return c; } catch (e) {}
  throw new Error('ไม่พบ Chrome');
}
const exe = findChrome(), profile = path.join(os.tmpdir(), 'kx-shot-profile');
const base = ['--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars', '--user-data-dir=' + profile,
              '--force-device-scale-factor=2', '--virtual-time-budget=20000'];

function shoot(name, hash, height) {
  const out = path.join(OUT, name + '.png');
  const r = spawnSync(exe, base.concat(['--window-size=480,' + height, '--screenshot=' + out, SITE + '/#' + hash]), { encoding: 'utf8', timeout: 90000 });   // piped, not ignored: with stdio ignored Chrome writes nothing here
  if (!fs.existsSync(out)) throw new Error(name + ': Chrome ไม่ได้เขียนภาพ');
  console.log('  ' + path.relative(ROOT, out) + '  (' + (fs.statSync(out).size / 1024).toFixed(0) + ' KB)');
}
function newestPost() {
  const r = spawnSync(exe, base.concat(['--window-size=480,900', '--dump-dom', SITE + '/#page-feed']), { encoding: 'utf8', maxBuffer: 64 << 20, timeout: 90000 });
  const m = (r.stdout || '').match(/kxOpenPost\('([0-9a-f-]{36})','rfq'\)/);
  if (!m) throw new Error('ไม่พบประกาศบนฟีด — เว็บโหลดไม่ขึ้น หรือฟีดว่าง');
  return m[1];
}

console.log('ถ่ายจาก ' + SITE);
shoot('feed', 'page-feed', 2200);
const id = newestPost();
console.log('  ประกาศล่าสุด ' + id);
shoot('detail', 'page-rfq-detail/' + id, 2200);
shoot('auth', 'page-auth', 1040);   // the card is centred vertically; a short window keeps it in frame
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify({ site: SITE, post: id, taken: new Date().toISOString(), width: 480, scale: 2 }, null, 2));
console.log('ครบ');
