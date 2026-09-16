/* ============================================================================
 * สังเคราะห์เสียงพูดสำหรับคลิป (ภาษาไทย เสียงผู้หญิง)
 * ============================================================================
 * Run from the project root:   node tools/build-voice.js <clip>
 * Reads tools/clip/<clip>.voice.json — an array of { id, at, text } lines, `at`
 * being the second the line starts in the clip — and writes the audio to
 * marketing/voice/<clip>/, plus manifest.json with the measured duration of
 * every piece, which tools/clip/lib.js mixes under the music when the clip is
 * rendered. Nothing here is committed: marketing/ is git-ignored.
 *
 * The voice is the Thai narrator behind Google Translate's speaker button
 * (female), fetched the way the translate page fetches it: one GET per phrase
 * of at most ~200 characters, MP3 back. No account, no key, no package. The
 * text of each phrase is sent to that service; nothing else leaves the machine.
 * This machine has only Pattara (Thai, male) installed offline, which is why
 * the clip does not use Windows' own voices; Microsoft's Edge read-aloud
 * voice (Premwadee) was tried first and now answers 401 to the token Edge
 * used to send, so it is not an option without an Azure key.
 *
 * Lines are split at spaces into phrases that fit the limit; each phrase is
 * one file, played back to back. Durations are read out of the MP3 frames,
 * so the clip can stretch a scene to fit its narration. Re-run after editing
 * the .voice.json; lines whose text has not changed are kept (the manifest
 * stores a hash), so a one-word fix costs one request.
 * ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');

const ROOT = process.cwd();
const args = process.argv.slice(2), flags = {};
for (let i = 0; i < args.length; i++) if (args[i].startsWith('--')) { flags[args[i].slice(2)] = args[i + 1]; args.splice(i, 2); i--; }
const clip = args[0];
if (!clip) { console.error('ใช้: node tools/build-voice.js <clip>'); process.exit(1); }
const scriptFile = path.join(ROOT, 'tools', 'clip', clip + '.voice.json');
if (!fs.existsSync(scriptFile)) { console.error('ไม่พบ ' + path.relative(ROOT, scriptFile)); process.exit(1); }
const lines = JSON.parse(fs.readFileSync(scriptFile, 'utf8'));
const OUT = path.join(ROOT, 'marketing', 'voice', clip);
fs.mkdirSync(OUT, { recursive: true });
const manifestFile = path.join(OUT, 'manifest.json');
const old = fs.existsSync(manifestFile) ? JSON.parse(fs.readFileSync(manifestFile, 'utf8')) : { lines: [] };
const LANG = flags.lang || 'th';
const LIMIT = 190;

/* Phrases of at most LIMIT characters, broken at the spaces Thai uses
   between clauses — never inside a word. */
function phrases(text) {
  const out = []; let cur = '';
  for (const w of text.split(/\s+/).filter(Boolean)) {
    const test = cur ? cur + ' ' + w : w;
    if (test.length <= LIMIT || !cur) cur = test; else { out.push(cur); cur = w; }
  }
  if (cur) out.push(cur);
  return out;
}

function fetchTts(text) {
  return new Promise((resolve, reject) => {
    const q = encodeURIComponent(text);
    const req = https.request({
      host: 'translate.google.com', method: 'GET',
      path: '/translate_tts?ie=UTF-8&tl=' + LANG + '&client=tw-ob&q=' + q,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36', 'Referer': 'https://translate.google.com/' }
    }, r => {
      const c = []; r.on('data', d => c.push(d));
      r.on('end', () => {
        const b = Buffer.concat(c);
        if (r.statusCode !== 200 || !/audio/.test(r.headers['content-type'] || '')) return reject(new Error('HTTP ' + r.statusCode + ' ' + (r.headers['content-type'] || '')));
        resolve(b);
      });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => req.destroy(new Error('หมดเวลา')));
    req.end();
  });
}

/* Seconds of audio in an MP3, from its frame headers (no decoder needed). */
function mp3Duration(b) {
  let i = 0;
  if (b.slice(0, 3).toString() === 'ID3') i = 10 + ((b[6] << 21) | (b[7] << 14) | (b[8] << 7) | b[9]);
  const BR = { 3: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320], 2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160] };
  const SR = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };
  let samples = 0, rate = 0;
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff || (b[i + 1] & 0xe0) !== 0xe0) { i++; continue; }
    const ver = (b[i + 1] >> 3) & 3, layer = (b[i + 1] >> 1) & 3, bri = b[i + 2] >> 4, sri = (b[i + 2] >> 2) & 3, pad = (b[i + 2] >> 1) & 1;
    if (ver === 1 || layer !== 1 || bri === 0 || bri === 15 || sri === 3) { i++; continue; }   // layer III only
    const mpeg1 = ver === 3;
    const br = BR[mpeg1 ? 3 : 2][bri] * 1000, sr = SR[ver][sri];
    const perFrame = mpeg1 ? 1152 : 576;
    const len = Math.floor((mpeg1 ? 144 : 72) * br / sr) + pad;
    if (len < 4) { i++; continue; }
    samples += perFrame; rate = sr; i += len;
  }
  return rate ? samples / rate : 0;
}

(async () => {
  const out = { source: 'google-translate-tts', lang: LANG, lines: [] };
  for (const ln of lines) {
    const hash = crypto.createHash('sha1').update(LANG + '|' + ln.text).digest('hex').slice(0, 12);
    const prev = old.lines.find(p => p.id === ln.id && p.hash === hash && (p.files || []).every(f => fs.existsSync(path.join(OUT, f.file))));
    if (prev) { out.lines.push({ ...prev, at: ln.at }); console.log('  ' + ln.id + ': เดิม (' + prev.duration.toFixed(1) + ' วิ)'); continue; }
    const parts = phrases(ln.text);
    process.stdout.write('  ' + ln.id + ': ' + parts.length + ' ท่อน… ');
    const files = [];
    for (let k = 0; k < parts.length; k++) {
      const mp3 = await fetchTts(parts[k]);
      const file = ln.id + (parts.length > 1 ? '-' + (k + 1) : '') + '.mp3';
      fs.writeFileSync(path.join(OUT, file), mp3);
      files.push({ file, duration: mp3Duration(mp3), text: parts[k] });
      await new Promise(r => setTimeout(r, 400));   // be a polite client
    }
    const duration = files.reduce((s, f) => s + f.duration, 0);
    out.lines.push({ id: ln.id, at: ln.at, files, duration, hash, text: ln.text });
    console.log(duration.toFixed(1) + ' วิ');
  }
  fs.writeFileSync(manifestFile, JSON.stringify(out, null, 2));
  console.log('เขียน ' + path.relative(ROOT, manifestFile));
})().catch(e => { console.error('ผิดพลาด: ' + (e && e.message || e)); process.exit(1); });
