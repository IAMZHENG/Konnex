/* ============================================================================
 * QubeQuote Worker — เสิร์ฟไฟล์คงที่ และหน้าแชร์รายประกาศ
 * ============================================================================
 * The app is a hash-routed single-page app: a listing lives at
 * `/#page-rfq-detail/<id>`. A URL fragment is never sent to a server, so every
 * crawler that followed a shared listing asked for `/` and got the whole
 * site's card — the same blue QubeQuote banner for every listing anybody
 * shared. No amount of tuning the tags in index.html could change that; the
 * listing had no address of its own to put tags on.
 *
 * So `/p/<id>` is that address. It answers with a small page carrying this
 * listing's title, its first photo and a line of its description in the
 * Open Graph tags, and sends a real browser straight on into the app. Everything
 * else falls through to the static assets exactly as before.
 *
 * The redirect is JavaScript, deliberately, with a plain link behind it:
 * Facebook and LINE do not run scripts, so they stay long enough to read the
 * head, and a person with scripts off still has something to click.
 * ========================================================================== */

const SUPABASE_URL = 'https://nziqjmqyqslfytdahkvz.supabase.co';
/* The same anon key the browser already carries. It is public by design — Row
   Level Security is the boundary, not the key — and this reads exactly what a
   signed-out visitor can already read. */
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im56aXFqbXF5cXNsZnl0ZGFoa3Z6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcyMDA4NTgsImV4cCI6MjEwMjc3Njg1OH0.N5hc2XaGGeOCayrec8kZbMBXe8cYpgY6gG42HnESdug';

const SITE = 'https://qubequote.com';
const FALLBACK_IMG = SITE + '/assets/img/qubequote-og.png';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
  });
}

/* One line, not the whole listing. Newlines and runs of spaces collapse because
   a description written as a spec sheet is mostly line breaks, and a card that
   opens with three blank lines looks broken rather than detailed. */
function oneLine(s, max) {
  const t = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  return t.length <= max ? t : t.slice(0, max - 1).trimEnd() + '…';
}

/* Facebook and LINE draw the big card only for an image they know is at least
   600x315. Nothing in the tags said how big the photo was, so they had to guess
   and drew the small square thumbnail instead — an 800x800 product photo, more
   than large enough, rendered as a postage stamp beside the text.

   So measure it and say. Read out of the file header rather than trusted from
   anywhere: the first 64KB is enough for PNG always and for JPEG in practice,
   and a Range request keeps this off the critical path for a 1MB photograph. */
function pngSize(b) {
  if (b.length > 24 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    const v = new DataView(b.buffer, b.byteOffset);
    return { w: v.getUint32(16), h: v.getUint32(20) };
  }
  return null;
}
function jpegSize(b) {
  if (b[0] !== 0xff || b[1] !== 0xd8) return null;
  const v = new DataView(b.buffer, b.byteOffset);
  let i = 2;
  while (i < b.length - 9) {
    if (b[i] !== 0xff) { i++; continue; }
    const m = b[i + 1];
    // a start-of-frame marker carries the dimensions; the rest are skipped by
    // their own declared length
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
      return { h: v.getUint16(i + 5), w: v.getUint16(i + 7) };
    }
    const len = v.getUint16(i + 2);
    if (len < 2) return null;          // malformed: stop rather than loop
    i += 2 + len;
  }
  return null;
}
async function imageSize(url) {
  try {
    const res = await fetch(url, {
      headers: { range: 'bytes=0-65535' },
      cf: { cacheTtl: 3600, cacheEverything: true }
    });
    if (!res.ok) return null;
    const b = new Uint8Array(await res.arrayBuffer());
    return pngSize(b) || jpegSize(b);
  } catch (e) {
    return null;                       // a card without dimensions still works
  }
}

function pickImage(post) {
  const imgs = (post.post_images || []).slice().sort(function (a, b) {
    return (a.sort == null ? 0 : a.sort) - (b.sort == null ? 0 : b.sort);
  });
  for (const im of imgs) {
    // absolute https only: a scraper does not resolve relative paths, and an
    // http image on an https page is dropped by most of them
    if (im && typeof im.url === 'string' && im.url.slice(0, 8) === 'https://') return im.url;
  }
  return null;
}

async function sharePage(id, env) {
  const appUrl = SITE + '/#page-rfq-detail/' + id;
  let post = null;
  try {
    const q = SUPABASE_URL + '/rest/v1/posts' +
      '?select=id,title,description,kind,post_images(url,sort)&id=eq.' + encodeURIComponent(id);
    const res = await fetch(q, {
      headers: { apikey: ANON_KEY, authorization: 'Bearer ' + ANON_KEY },
      cf: { cacheTtl: 60, cacheEverything: true }
    });
    if (res.ok) {
      const rows = await res.json();
      post = Array.isArray(rows) && rows.length ? rows[0] : null;
    }
  } catch (e) {
    // a listing whose lookup failed still has to open — fall through to the
    // generic card rather than answering a shared link with an error page
  }

  if (!post) {
    return Response.redirect(SITE + '/', 302);
  }

  const kind = post.kind === 'offer' ? 'offer' : 'rfq';
  const page = kind === 'offer' ? 'page-offer-detail' : 'page-rfq-detail';
  const target = SITE + '/#' + page + '/' + id;
  const title = oneLine(post.title, 90) || 'ประกาศบน QubeQuote';
  const desc = oneLine(post.description, 180) ||
    'ดูรายละเอียดและเสนอราคาได้ที่ QubeQuote';
  const canonical = SITE + '/p/' + id;

  /* Which picture, and how big we promise it is.

     A photo under 600x315 gets the small card no matter what we say, and a
     listing's own thumbnail shown at postage-stamp size is worse than the
     brand card shown properly — so below that threshold this falls back to the
     1200x630 card, which is at least large and legible. */
  const photo = pickImage(post);
  let img = FALLBACK_IMG, imgW = 1200, imgH = 630, imgAlt = 'QubeQuote';
  if (photo) {
    const size = await imageSize(photo);
    if (size && size.w >= 600 && size.h >= 315) {
      img = photo; imgW = size.w; imgH = size.h; imgAlt = title;
    } else if (!size) {
      // unmeasurable, but it is still this listing's own photograph: use it and
      // let the scraper size it, which is what happened before any of this
      img = photo; imgW = 0; imgH = 0; imgAlt = title;
    }
  }
  const sizeTags = imgW && imgH
    ? '\n<meta property="og:image:width" content="' + imgW + '">' +
      '\n<meta property="og:image:height" content="' + imgH + '">'
    : '';

  const html = `<!DOCTYPE html>
<html lang="th"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} — QubeQuote</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(canonical)}">
<link rel="icon" type="image/svg+xml" href="/assets/img/qubequote-icon.svg">
<meta property="og:type" content="article">
<meta property="og:site_name" content="QubeQuote">
<meta property="og:locale" content="th_TH">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${esc(img)}">${sizeTags}
<meta property="og:image:alt" content="${esc(imgAlt)}">
<meta name="twitter:card" content="summary_large_image">
<style>
  body{ margin:0; min-height:100vh; display:flex; align-items:center;
    justify-content:center; background:#f6f8fc; color:#1c1a18;
    font-family:system-ui,-apple-system,'Segoe UI',sans-serif; padding:24px; }
  .b{ text-align:center; max-width:520px; }
  h1{ font-size:19px; font-weight:600; margin:0 0 10px; line-height:1.5; }
  a{ color:#0846c7; font-weight:600; }
</style>
</head><body>
<div class="b">
  <h1>${esc(title)}</h1>
  <p><a href="${esc(target)}">เปิดประกาศนี้ใน QubeQuote →</a></p>
</div>
<script>location.replace(${JSON.stringify(target)});</script>
</body></html>`;

  return new Response(html, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      /* Short, and revalidated. A listing's title and photos can change, and a
         card cached for a day would keep showing the old ones. */
      'cache-control': 'public, max-age=0, must-revalidate'
    }
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const m = /^\/p\/([^/]+)\/?$/.exec(url.pathname);
    if (m) {
      const id = decodeURIComponent(m[1]);
      // anything not shaped like an id goes home rather than to a lookup
      if (!UUID.test(id)) return Response.redirect(SITE + '/', 302);
      return sharePage(id, env);
    }
    // everything else is the site exactly as before
    return env.ASSETS.fetch(request);
  }
};
