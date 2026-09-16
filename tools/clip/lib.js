/* ============================================================================
 * Shared drawing kit for the QubeQuote clips (tools/clip/*.html).
 *
 * Everything a clip page needs that is not its own story: the canvas and the
 * framing (portrait / square / landscape from ?w= and ?h=), the brand colours
 * and fonts, easing, the drawing helpers (cards, pills, text, the phone frame,
 * an offer row), the synthesised music, and the WebCodecs + mp4-muxer encoder
 * that turns draw(t) into an MP4 and posts it to tools/build-clip.js.
 *
 * A clip page defines DURATION and draw(t), then calls boot(). Every clip is
 * a pure function of time, so ?t=12.5 freezes a frame and ?play=1 loops it.
 * ========================================================================== */
'use strict';

const q = new URLSearchParams(location.search);
const W = +q.get('w') || 1080, H = +q.get('h') || 1920, FPS = 30;
const c = document.getElementById('c'), ctx = c.getContext('2d');
c.width = W; c.height = H;

/* ---- brand ---- */
// --blue-600 in the app; the mark's SVG is this exact value
const BLUE = '#0a5bff', BLUE_DEEP = '#0036a8', BLUE_SOFT = '#eef3ff', INK = '#1c1a18', INK_SOFT = '#565b6e';
const BG = '#f6f8fc', CARD = '#ffffff', LINE = '#e3e7f0', GREEN = '#16a34a', GREEN_SOFT = '#e8f7ec', AMBER = '#f59e0b';
const TH = '"IBM Plex Sans Thai", "IBM Plex Sans", sans-serif';
const font = (w, px) => `${w} ${px}px ${TH}`;

/* ---- framing ---- */
const BODY_W = 860, BODY_H = 1300;              // the body's own coordinate system
function framing() {
  const ar = W / H;
  if (ar < .8) return {
    kind: 'portrait', twoCol: false,
    brand: { x: 70, y: 76, h: 62 },
    header: { x: 120, y: 250, px: 66, badge: 56, sub: { y: 330, px: 32 } },
    body: { x: 110, y: 400, s: 1 },
    dots: { x: W / 2, y: H - 130 }
  };
  if (ar < 1.3) return {
    kind: 'square', twoCol: true,
    brand: { x: 60, y: 56, h: 50 },
    header: { x: 60, y: 250, px: 46, badge: 42, twoLine: true, sub: { y: 370, px: 26, wrap: 400 } },
    body: { x: 520, y: 120, s: .60 },
    dots: { x: 250, y: H - 90 }
  };
  return {
    kind: 'landscape', twoCol: true,
    brand: { x: 100, y: 70, h: 64 },
    header: { x: 100, y: 380, px: 66, badge: 56, sub: { y: 460, px: 32, wrap: 760 } },
    body: { x: 990, y: 60, s: .74 },
    dots: { x: 480, y: H - 100 }
  };
}
const F = framing();

/* ---- easing ---- */
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, u) => a + (b - a) * u;
const outCubic = u => 1 - Math.pow(1 - clamp(u, 0, 1), 3);
const inOutCubic = u => { u = clamp(u, 0, 1); return u < .5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2; };
const outBack = u => { u = clamp(u, 0, 1); const s = 1.70158; return 1 + (s + 1) * Math.pow(u - 1, 3) + s * Math.pow(u - 1, 2); };
const seg = (t, a, b, ease) => (ease || outCubic)((t - a) / (b - a));
const fadeInOut = (t, a, b, f) => Math.min(seg(t, a, a + f), 1 - seg(t, b - f, b, u => clamp(u, 0, 1)));

/* ---- drawing helpers ---- */
function rr(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function card(x, y, w, h, r) {
  ctx.save();
  ctx.shadowColor = 'rgba(12,63,115,.10)'; ctx.shadowBlur = 40; ctx.shadowOffsetY = 14;
  ctx.fillStyle = CARD; rr(x, y, w, h, r); ctx.fill();
  ctx.restore();
  ctx.strokeStyle = LINE; ctx.lineWidth = 2; rr(x, y, w, h, r); ctx.stroke();
}
function text(s, x, y, o) {
  o = o || {};
  ctx.save();
  ctx.font = font(o.w || 500, o.px || 40);
  ctx.fillStyle = o.color || INK;
  ctx.textAlign = o.align || 'left';
  ctx.textBaseline = o.base || 'alphabetic';
  if (o.alpha != null) ctx.globalAlpha *= clamp(o.alpha, 0, 1);
  ctx.fillText(s, x, y);
  ctx.restore();
}
function measure(s, w, px) { ctx.font = font(w, px); return ctx.measureText(s).width; }
/* Thai has no spaces to break on, so lines are broken where they fit — a
   caption in the narrow left column of the square framing needs it. */
function wrapText(s, w, px, maxW) {
  ctx.font = font(w, px);
  if (ctx.measureText(s).width <= maxW) return [s];
  const words = s.split(' ');
  const lines = []; let cur = '';
  for (const wd of words) {
    const test = cur ? cur + ' ' + wd : wd;
    if (ctx.measureText(test).width <= maxW || !cur) cur = test; else { lines.push(cur); cur = wd; }
  }
  if (cur) lines.push(cur);
  return lines;
}
function pill(label, x, y, o) {
  o = o || {};
  const px = o.px || 30, padX = o.padX || 26, h = o.h || px * 1.9;
  const w = measure(label, 600, px) + padX * 2;
  const left = o.align === 'center' ? x - w / 2 : o.align === 'right' ? x - w : x;
  ctx.save();
  if (o.alpha != null) ctx.globalAlpha *= clamp(o.alpha, 0, 1);
  ctx.fillStyle = o.bg || BLUE_SOFT; rr(left, y, w, h, h / 2); ctx.fill();
  if (o.border) { ctx.strokeStyle = o.border; ctx.lineWidth = 2; rr(left, y, w, h, h / 2); ctx.stroke(); }
  text(label, left + w / 2, y + h / 2 + 1, { w: 600, px, color: o.color || BLUE, align: 'center', base: 'middle' });
  ctx.restore();
  return w;
}
function baht(n) { return '฿' + n.toLocaleString('en-US'); }
function star(x, y, r, fill) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 5, rad = i % 2 ? r * .45 : r;
    ctx[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * rad, y + Math.sin(a) * rad);
  }
  ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
}
function check(x, y, r, u, color, width) {
  ctx.save();
  ctx.strokeStyle = color; ctx.lineWidth = width || 14; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const cu = clamp(u / .55, 0, 1), tu = clamp((u - .5) / .5, 0, 1);
  ctx.beginPath(); ctx.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * outCubic(cu)); ctx.stroke();
  if (tu > 0) {
    const p = [[x - r * .42, y + r * .02], [x - r * .1, y + r * .36], [x + r * .46, y - r * .3]];
    ctx.beginPath(); ctx.moveTo(p[0][0], p[0][1]);
    const e = outCubic(tu);
    if (e < .45) { const k = e / .45; ctx.lineTo(lerp(p[0][0], p[1][0], k), lerp(p[0][1], p[1][1], k)); }
    else { const k = (e - .45) / .55; ctx.lineTo(p[1][0], p[1][1]); ctx.lineTo(lerp(p[1][0], p[2][0], k), lerp(p[1][1], p[2][1], k)); }
    ctx.stroke();
  }
  ctx.restore();
}

/* ---- assets ---- */
const IMG = {};
function loadImg(key, src) {
  return new Promise((res, rej) => { const im = new Image(); im.onload = () => { IMG[key] = im; res(); }; im.onerror = rej; im.src = src; });
}
function mark(x, y, h, white) {
  const im = white ? IMG.markWhite : IMG.mark;
  if (!im) return 0;
  const w = h * im.width / im.height;
  ctx.drawImage(im, x, y, w, h);
  return w;
}
/* As .brand-word in the app: the whole word in the mark's blue, Qube heavier. */
function wordmark(x, y, px, white) {
  ctx.save();
  ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  ctx.fillStyle = white ? '#fff' : BLUE;
  ctx.font = font(700, px); ctx.fillText('Qube', x, y);
  const w1 = ctx.measureText('Qube').width;
  ctx.font = font(500, px); ctx.fillText('Quote', x + w1, y);
  ctx.restore();
  return w1 + measure('Quote', 500, px);
}
function wordmarkWidth(px) { return measure('Qube', 700, px) + measure('Quote', 500, px); }

/* ---- tutorial gestures and form pieces ---- */
const typed = (s, t, a, b) => s.slice(0, Math.round(s.length * clamp((t - a) / (b - a), 0, 1)));
const blink = t => Math.floor(t * 2.5) % 2 === 0;
const pressAt = (t, t0) => t > t0 && t < t0 + .3 ? 1 - Math.abs((t - t0 - .15) / .15) : 0;

/* A fingertip ripple where the viewer should look — the tutorial's pointer. */
function tap(x, y, t, t0) {
  const u = (t - t0) / .55;
  if (u <= 0 || u >= 1) return;
  ctx.save();
  ctx.globalAlpha *= (1 - u) * .7;
  ctx.fillStyle = 'rgba(0,86,253,.25)'; ctx.beginPath(); ctx.arc(x, y, lerp(22, 80, outCubic(u)), 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = BLUE; ctx.lineWidth = 4; ctx.stroke();
  ctx.restore();
}
/* A form field with a label; `value` typed, `ph` shown grey when empty. */
function field(label, x, y, w, value, ph, o) {
  o = o || {};
  text(label, x, y, { w: 600, px: 28 });
  ctx.fillStyle = '#fff'; ctx.strokeStyle = o.focus ? BLUE : LINE; ctx.lineWidth = 3; rr(x, y + 20, w, 88, 18); ctx.fill(); ctx.stroke();
  if (value) text(value, x + 28, y + 76, { w: 500, px: 32 });
  else if (ph) text(ph, x + 28, y + 76, { w: 400, px: 30, color: '#aeb6c8' });
  if (o.caret && blink(o.t)) { const cw = measure(value, 500, 32); ctx.fillStyle = BLUE; ctx.fillRect(x + 30 + cw, y + 44, 3, 44); }
  return y + 108;
}
function button(label, cx, cy, w, h, o) {
  o = o || {};
  const press = o.press || 0;
  ctx.save();
  if (o.alpha != null) ctx.globalAlpha *= clamp(o.alpha, 0, 1);
  ctx.translate(cx, cy); ctx.scale(1 - press * .06, 1 - press * .06);
  ctx.fillStyle = o.bg || (press ? BLUE_DEEP : BLUE); rr(-w / 2, -h / 2, w, h, h / 2); ctx.fill();
  if (o.border) { ctx.strokeStyle = o.border; ctx.lineWidth = 3; rr(-w / 2, -h / 2, w, h, h / 2); ctx.stroke(); }
  text(label, 0, 3, { w: 700, px: o.px || 36, color: o.color || '#fff', align: 'center', base: 'middle' });
  ctx.restore();
}
function toast(label, cx, cy, u) {
  if (u <= 0) return;
  ctx.save(); ctx.globalAlpha *= clamp(u, 0, 1); ctx.translate(cx, cy); ctx.scale(u, u);
  const w = measure(label, 600, 30) + 90;
  ctx.fillStyle = GREEN_SOFT; rr(-w / 2, -40, w, 80, 40); ctx.fill();
  text(label, 0, 3, { w: 600, px: 30, color: GREEN, align: 'center', base: 'middle' });
  ctx.restore();
}

/* ---- grounds ---- */
function paper() { ctx.fillStyle = BG; ctx.fillRect(0, 0, W, H); }
function blueGround(t) {
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#0a5cff'); g.addColorStop(1, '#0036a8');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.save(); ctx.globalAlpha = .07; ctx.fillStyle = '#fff';
  const R = Math.min(W, H);
  for (let i = 0; i < 5; i++) {
    const a = t * .15 + i * 1.3;
    ctx.beginPath(); ctx.arc(W * (.2 + .6 * (.5 + .5 * Math.sin(a))), H * (.15 + .7 * (.5 + .5 * Math.cos(a * .8 + i))), R * (.15 + .055 * i), 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}
function topBrand(white) {
  const b = F.brand;
  const w = mark(b.x, b.y, b.h, white);
  wordmark(b.x + w + 18, b.y + b.h / 2, b.h * .7, white);
}

/* Step header: badge, title and a one-line caption. In the two-column
   framings this is the whole left column. */
function stepHeader(n, title, sub, t, a) {
  const h = F.header;
  const u = seg(t, a, a + .55, outBack);
  ctx.save(); ctx.globalAlpha *= clamp(u, 0, 1);
  ctx.fillStyle = BLUE; ctx.beginPath(); ctx.arc(h.x, h.y, h.badge * u, 0, Math.PI * 2); ctx.fill();
  // n is usually a step number; a clip without steps passes an emoji instead
  text(String(n), h.x, h.y + 2, { w: 700, px: typeof n === 'number' ? h.badge : h.badge * .9, color: '#fff', align: 'center', base: 'middle' });
  const dx = lerp(40, 0, u);
  // a '|' in the title marks where the narrow left column of the square
  // framing breaks it; the other two have room for one line
  // the square framing always breaks there; the others only when one line
  // would run into the body column (or off the right edge)
  const left = h.x + h.badge + 34;
  const maxW = (F.twoCol ? F.body.x - 40 : W - 40) - left;
  const twoLine = title.includes('|') && (h.twoLine || measure(title.replace('|', ''), 700, h.px) > maxW);
  const lines = twoLine ? title.split('|') : [title.replace('|', '')];
  if (lines.length === 1) text(lines[0], h.x + h.badge + 34 + dx, h.y + 2, { w: 700, px: h.px, base: 'middle' });
  else lines.forEach((ln, i) => text(ln.trim(), h.x + h.badge + 34 + dx, h.y + 2 + (i - .5) * h.px * 1.3, { w: 700, px: h.px, base: 'middle' }));
  ctx.restore();
  if (sub) {
    const su = seg(t, a + .4, a + .9);
    const lines = h.sub.wrap ? wrapText(sub, 400, h.sub.px, h.sub.wrap) : [sub];
    // a title that broke onto two lines in a framing laid out for one pushes the caption down
    const shift = twoLine && !h.twoLine ? h.px * 1.3 : 0;
    lines.forEach((ln, i) => text(ln, h.x - h.badge, h.sub.y + shift + i * h.sub.px * 1.5, { w: 400, px: h.sub.px, color: INK_SOFT, alpha: su }));
  }
}
function dots(step, n) {
  n = n || 4;
  const gap = 44;
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = i === step ? BLUE : '#c9d3ea';
    ctx.beginPath(); ctx.arc(F.dots.x + (i - (n - 1) / 2) * gap, F.dots.y, i === step ? 10 : 7, 0, Math.PI * 2); ctx.fill();
  }
}
/* Runs a body drawer in body coordinates, placed per framing. */
function body(fn) {
  ctx.save();
  ctx.translate(F.body.x, F.body.y); ctx.scale(F.body.s, F.body.s);
  fn();
  ctx.restore();
}

/* Phone frame with the app's top bar; returns the content box (body coords).
   o.url draws a browser address bar above the app — the clip about opening
   the site wants the viewer to see it is a web page, not an install. */
function phone(x, y, w, h, o) {
  o = o || {};
  ctx.save();
  ctx.shadowColor = 'rgba(12,63,115,.18)'; ctx.shadowBlur = 60; ctx.shadowOffsetY = 24;
  ctx.fillStyle = '#0f172a'; rr(x, y, w, h, 64); ctx.fill();
  ctx.restore();
  ctx.fillStyle = BG; rr(x + 16, y + 16, w - 32, h - 32, 50); ctx.fill();
  ctx.save(); rr(x + 16, y + 16, w - 32, h - 32, 50); ctx.clip();
  let top = y + 16;
  if (o.url != null) {
    ctx.fillStyle = '#eceff5'; ctx.fillRect(x + 16, top, w - 32, 96);
    ctx.fillStyle = '#fff'; rr(x + 46, top + 20, w - 92, 60, 30); ctx.fill();
    text('🔒', x + 76, top + 52, { px: 24, base: 'middle' });
    text(o.url, x + 116, top + 52, { w: 500, px: 30, color: o.url ? INK : INK_SOFT, base: 'middle' });
    if (o.caret) { const cw = measure(o.url, 500, 30); ctx.fillStyle = BLUE; ctx.fillRect(x + 118 + cw, top + 32, 3, 40); }
    top += 96;
  }
  if (!o.blank) {
    ctx.fillStyle = '#fff'; ctx.fillRect(x + 16, top, w - 32, 110);
    ctx.fillStyle = LINE; ctx.fillRect(x + 16, top + 110, w - 32, 2);
    const mh = 46; const mw = mark(x + 56, top + 32, mh);
    wordmark(x + 56 + mw + 12, top + 32 + mh / 2, 32);
    top += 112;
  }
  ctx.restore();
  return { x: x + 16, y: top, w: w - 32, h: y + h - 16 - top };
}


function offerRow(s, x, y, w, i, price, low, hl) {
  const rowH = 250;
  card(x, y, w, rowH, 28);
  if (low && hl > 0) { ctx.save(); ctx.globalAlpha *= hl; ctx.strokeStyle = GREEN; ctx.lineWidth = 5; rr(x, y, w, rowH, 28); ctx.stroke(); ctx.restore(); }
  ctx.fillStyle = ['#dbe7ff', '#e6f6ea', '#fff1d6'][i]; ctx.beginPath(); ctx.arc(x + 74, y + 74, 40, 0, Math.PI * 2); ctx.fill();
  text(s.name.replace(/^(บจก\. |ร้าน)/, '').charAt(0), x + 74, y + 78, { w: 700, px: 34, color: INK, align: 'center', base: 'middle' });
  text(s.name, x + 136, y + 66, { w: 700, px: 32 });
  for (let k = 0; k < 5; k++) star(x + 150 + k * 32, y + 106, 12, k < Math.round(s.stars) ? AMBER : '#e2e6ef');
  text(s.stars.toFixed(1), x + 316, y + 114, { w: 500, px: 24, color: INK_SOFT });
  text(baht(price), x + w - 34, y + 84, { w: 700, px: 52, color: low && hl > 0 ? GREEN : INK, align: 'right' });
  text('รวมค่าส่ง', x + w - 34, y + 122, { w: 400, px: 24, color: INK_SOFT, align: 'right' });
  ctx.fillStyle = LINE; ctx.fillRect(x + 34, y + 152, w - 68, 2);
  pill('🚚 ส่งใน ' + s.days + ' วัน', x + 34, y + 176, { px: 24, bg: '#f1f3f8', color: INK_SOFT });
  pill('📎 แนบใบเสนอราคา', x + 260, y + 176, { px: 24, bg: '#f1f3f8', color: INK_SOFT });
  if (low && hl > 0) pill('ราคาต่ำสุด', x + w - 34, y + 176, { align: 'right', px: 24, bg: GREEN_SOFT, color: GREEN, alpha: hl });
}


/* ====================== MUSIC ====================== */
/* A light, unhurried bed: a soft pad under a plucked arpeggio, a round bass
   on the strong beats, a quiet kick and shaker for pace. Four chords over
   nine and a half seconds, repeated; rendered offline so it is the same on
   every run. Written here rather than licensed: a track nobody has to clear. */
/* `voice`, when given, is the decoded narration from decodeVoice(): the
   lines are laid over the music at their times, and the music ducks under
   each one — the bed sits between the instruments and the master so the
   fade in and out stay on the master and the ducking on the bed. */
async function music(seconds, voice) {
  const sr = 48000;
  const ac = new OfflineAudioContext(2, Math.ceil(seconds * sr), sr);
  const master = ac.createGain();
  const comp = ac.createDynamicsCompressor();
  comp.threshold.value = -18; comp.ratio.value = 3; comp.attack.value = .01; comp.release.value = .25;
  master.connect(comp); comp.connect(ac.destination);
  master.gain.setValueAtTime(0, 0);
  master.gain.linearRampToValueAtTime(1.3, 1.2);
  master.gain.setValueAtTime(1.3, seconds - 2.8);
  master.gain.linearRampToValueAtTime(0, seconds - .15);
  const bed = ac.createGain(); bed.connect(master);
  const DUCK = .22;
  if (voice && voice.lines.length) {
    bed.gain.setValueAtTime(voice.lines[0].at < .5 ? DUCK : 1, 0);
    const vg = ac.createGain(); vg.gain.value = .95; vg.connect(master);
    for (const ln of voice.lines) {
      let t = ln.at;
      for (const p of ln.parts) {
        const src = ac.createBufferSource(); src.buffer = p.buffer; src.connect(vg); src.start(t);
        t += p.buffer.duration + .12;
      }
      const end = t - .12;
      bed.gain.setValueAtTime(bed.gain.value, Math.max(0, ln.at - .45));
      bed.gain.linearRampToValueAtTime(DUCK, Math.max(0, ln.at - .1));
      bed.gain.setValueAtTime(DUCK, end + .15);
      bed.gain.linearRampToValueAtTime(1, Math.min(seconds, end + .9));
    }
  }

  const bpm = 100, beat = 60 / bpm, bar = beat * 4;
  const midi = n => 440 * Math.pow(2, (n - 69) / 12);
  // Cmaj7 · G · Am7 · Fmaj7, as MIDI notes around C4
  const CHORDS = [[60, 64, 67, 71], [55, 59, 62, 67], [57, 60, 64, 67], [53, 57, 60, 64]];
  const ROOTS = [48, 43, 45, 41];
  const bars = Math.ceil(seconds / bar);

  function osc(type, freq, t0, t1, gain, dest, detune) {
    const o = ac.createOscillator(); o.type = type; o.frequency.value = freq; if (detune) o.detune.value = detune;
    const g = ac.createGain(); g.gain.value = gain;
    o.connect(g); g.connect(dest || bed); o.start(t0); o.stop(t1);
    return g;
  }
  // pad through a gentle low-pass
  const padLp = ac.createBiquadFilter(); padLp.type = 'lowpass'; padLp.frequency.value = 900; padLp.Q.value = .5; padLp.connect(bed);
  for (let b = 0; b < bars; b++) {
    const t0 = b * bar, t1 = t0 + bar + .6, ch = CHORDS[b % 4];
    ch.forEach(n => {
      [-7, 7].forEach(d => {
        const g = osc('sawtooth', midi(n), t0, t1, 0, padLp, d);
        g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(.028, t0 + .5);
        g.gain.setValueAtTime(.028, t1 - .6); g.gain.linearRampToValueAtTime(0, t1);
      });
    });
    // bass on 1 and 3
    [0, 2].forEach(k => {
      const s = t0 + k * beat;
      const g = osc('sine', midi(ROOTS[b % 4]), s, s + beat * 1.6, 0);
      g.gain.setValueAtTime(0, s); g.gain.linearRampToValueAtTime(.16, s + .02); g.gain.exponentialRampToValueAtTime(.001, s + beat * 1.5);
    });
    // plucked arpeggio, 8th notes, up an octave
    const pattern = [0, 2, 1, 3, 2, 3, 1, 2];
    for (let k = 0; k < 8; k++) {
      const s = t0 + k * beat / 2;
      const n = ch[pattern[k]] + 12;
      const vel = .11 * (k % 2 ? .75 : 1);
      const g = osc('triangle', midi(n), s, s + .5, 0);
      g.gain.setValueAtTime(0, s); g.gain.linearRampToValueAtTime(vel, s + .008); g.gain.exponentialRampToValueAtTime(.0005, s + .42);
      const g2 = osc('sine', midi(n + 12), s, s + .3, 0);
      g2.gain.setValueAtTime(0, s); g2.gain.linearRampToValueAtTime(vel * .25, s + .005); g2.gain.exponentialRampToValueAtTime(.0005, s + .22);
    }
    // soft kick on every beat from the second bar, shaker on the off-beats
    for (let k = 0; k < 4; k++) {
      const s = t0 + k * beat;
      if (b >= 1) {
        const o = ac.createOscillator(); o.type = 'sine';
        o.frequency.setValueAtTime(140, s); o.frequency.exponentialRampToValueAtTime(45, s + .12);
        const g = ac.createGain(); g.gain.setValueAtTime(.32, s); g.gain.exponentialRampToValueAtTime(.001, s + .28);
        o.connect(g); g.connect(bed); o.start(s); o.stop(s + .3);
      }
      const sh = s + beat / 2;
      const len = .06, buf = ac.createBuffer(1, Math.ceil(len * sr), sr), d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2);
      const src = ac.createBufferSource(); src.buffer = buf;
      const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 7000;
      const g = ac.createGain(); g.gain.value = .045;
      src.connect(hp); hp.connect(g); g.connect(bed); src.start(sh);
    }
  }
  return ac.startRendering();
}

/* ====================== NARRATION ====================== */
/* A clip may set VOICE_MANIFEST to the manifest tools/build-voice.js wrote
   (marketing/voice/<clip>/manifest.json). Missing file: the clip renders
   without narration and says so. The manifest is loaded before the first
   frame so a clip can size its scenes to the lines — applyVoice(manifest),
   if the page defines it, is called with the parsed manifest (or null) and
   may change T, DURATION and each line's `at`. */
async function loadVoiceManifest() {
  if (typeof VOICE_MANIFEST === 'undefined' || !VOICE_MANIFEST) return null;
  try {
    const r = await fetch(VOICE_MANIFEST);
    if (!r.ok) throw new Error(r.status);
    const m = await r.json();
    m.base = VOICE_MANIFEST.replace(/[^/]*$/, '');
    return m;
  } catch (e) { log('ไม่มีเสียงพูด (' + VOICE_MANIFEST + ' — ' + (e.message || e) + ') เรนเดอร์แบบไม่มีเสียงพูด'); return null; }
}
async function decodeVoice(m) {
  if (!m) return null;
  const dec = new OfflineAudioContext(1, 1, 48000);
  const lines = [];
  for (const ln of m.lines) {
    const parts = [];
    for (const f of ln.files) {
      const ab = await (await fetch(m.base + f.file)).arrayBuffer();
      parts.push({ buffer: await dec.decodeAudioData(ab) });
    }
    lines.push({ at: ln.at, parts });
  }
  return { lines };
}

/* ====================== ENCODE ====================== */
const log = m => { document.getElementById('log').textContent += m + '\n'; console.log(m); };

async function ready() {
  await Promise.all([
    loadImg('mark', '/assets/img/qubequote-mark.svg'),
    loadImg('markWhite', '/assets/img/qubequote-mark-white.svg')
  ]);
  await Promise.all([400, 500, 600, 700].map(w => document.fonts.load(`${w} 40px "IBM Plex Sans Thai"`, 'เสนอราคา')));
  await Promise.all([400, 500, 700].map(w => document.fonts.load(`${w} 40px "IBM Plex Sans"`, 'QubeQuote 12345')));
  await document.fonts.ready;
}

async function encode() {
  const vcodec = 'avc1.64002a';                     // H.264 High 4.2: 1080p/1920x1080/1080x1920 at 30 fps all fit
  const vcfg = { codec: vcodec, width: W, height: H, bitrate: 9_000_000, framerate: FPS, avc: { format: 'avc' } };
  const vs = await VideoEncoder.isConfigSupported(vcfg);
  if (!vs.supported) throw new Error('ไม่รองรับ ' + vcodec);
  const acfg = { codec: 'mp4a.40.2', sampleRate: 48000, numberOfChannels: 2, bitrate: 128000 };
  const as = await AudioEncoder.isConfigSupported(acfg);
  if (!as.supported) throw new Error('ไม่รองรับ AAC');

  const muxer = new Mp4Muxer.Muxer({
    target: new Mp4Muxer.ArrayBufferTarget(),
    video: { codec: 'avc', width: W, height: H, frameRate: FPS },
    audio: { codec: 'aac', sampleRate: 48000, numberOfChannels: 2 },
    fastStart: 'in-memory'
  });

  log('กำลังสร้างดนตรี' + (VOICE ? 'และเสียงพูด' : '') + '…');
  const abuf = await music(DURATION, VOICE ? await decodeVoice(VOICE) : null);
  const aenc = new AudioEncoder({ output: (ch, meta) => muxer.addAudioChunk(ch, meta), error: e => { throw e; } });
  aenc.configure(acfg);
  const CH = 2, STEP = 1024, N = abuf.length;
  const planes = [abuf.getChannelData(0), abuf.getChannelData(1)];
  for (let i = 0; i < N; i += STEP) {
    const n = Math.min(STEP, N - i);
    const data = new Float32Array(n * CH);
    for (let ch = 0; ch < CH; ch++) data.set(planes[ch].subarray(i, i + n), ch * n);
    const ad = new AudioData({ format: 'f32-planar', sampleRate: 48000, numberOfFrames: n, numberOfChannels: CH, timestamp: Math.round(i * 1e6 / 48000), data });
    aenc.encode(ad); ad.close();
  }
  await aenc.flush(); aenc.close();

  const venc = new VideoEncoder({ output: (ch, meta) => muxer.addVideoChunk(ch, meta), error: e => { throw e; } });
  venc.configure(vcfg);
  const total = Math.round(DURATION * FPS);
  for (let i = 0; i < total; i++) {
    draw(i / FPS);
    const frame = new VideoFrame(c, { timestamp: Math.round(i * 1e6 / FPS), duration: Math.round(1e6 / FPS) });
    venc.encode(frame, { keyFrame: i % (FPS * 2) === 0 });
    frame.close();
    while (venc.encodeQueueSize > 8) await new Promise(r => setTimeout(r, 5));
    if (i % 90 === 0) log('เฟรม ' + i + '/' + total);
  }
  await venc.flush(); venc.close();
  muxer.finalize();
  return new Blob([muxer.target.buffer], { type: 'video/mp4' });
}

/* Entry point: a clip page calls this after defining DURATION and draw(t). */
let VOICE = null;
async function boot() {
  try {
    await ready();
    // a clip may load extra pictures (screenshots) before its first frame
    if (typeof prepare === 'function') await prepare();
    VOICE = await loadVoiceManifest();
    if (typeof applyVoice === 'function') applyVoice(VOICE);
    // ?bare=1: the canvas at its true size in the top-left corner, for --frame screenshots
    if (q.has('bare')) { c.style.cssText = 'margin:0;max-width:none;max-height:none;width:' + W + 'px;height:' + H + 'px'; document.getElementById('log').hidden = true; }
    if (q.has('t')) { draw(parseFloat(q.get('t'))); document.title = 'frame'; return; }
    if (q.has('play')) {
      const t0 = performance.now();
      (function loop() { draw(((performance.now() - t0) / 1000) % DURATION); requestAnimationFrame(loop); })();
      return;
    }
    log('เริ่มเข้ารหัส ' + W + 'x' + H + ' ' + Math.round(DURATION * FPS) + ' เฟรม');
    const blob = await encode();
    log('ได้ไฟล์ ' + (blob.size / 1e6).toFixed(1) + ' MB — กำลังส่ง');
    const r = await fetch('/save', { method: 'POST', headers: { 'Content-Type': 'video/mp4', 'X-Name': q.get('name') || (W + 'x' + H) }, body: blob });
    log(r.ok ? 'บันทึกแล้ว' : 'บันทึกไม่สำเร็จ ' + r.status);
    document.title = r.ok ? 'saved' : 'failed';
  } catch (e) {
    log('ผิดพลาด: ' + (e && e.message || e));
    document.title = 'failed';
    fetch('/save', { method: 'POST', headers: { 'Content-Type': 'text/plain', 'X-Error': '1' }, body: String(e && e.stack || e) }).catch(() => {});
  }
}
