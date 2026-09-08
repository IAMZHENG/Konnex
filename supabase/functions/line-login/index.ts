/* ============================================================================
 * เข้าสู่ระบบด้วย LINE
 * ============================================================================
 * Why this exists at all, given Supabase has a custom-provider feature:
 *
 *   LINE's discovery document advertises id_token_signing_alg_values_supported
 *   ["ES256"], but LINE's own manual says ES256 is what native and LIFF apps
 *   get — **web login is signed HS256**, keyed on the channel secret. Supabase
 *   trusts the discovery document and refuses the token:
 *
 *     Failed to verify ID token: oidc: malformed jwt:
 *     unexpected signature algorithm "HS256"; expected ["ES256"]
 *
 *   Both ways around it inside the dashboard are closed, and we tried each:
 *
 *     /oauth2/v2.1/userinfo  has `sub`, but needs the `openid` scope, which
 *                            makes LINE return the ID token that gets refused
 *     /v2/profile            needs no `openid`, so no ID token — but it calls
 *                            the id `userId`, and Supabase answers
 *                            "error missing provider id"
 *
 * So the exchange happens here instead, where LINE itself does the verifying:
 * POST /oauth2/v2.1/verify takes the ID token and the channel id and hands back
 * sub, name, picture and email. No HS256 implementation of our own, and no
 * signature check we could get subtly wrong.
 *
 * The email is the part that makes this better than the built-in provider would
 * have been even if it had worked: with an address in hand this signs the person
 * into the account they already have, instead of starting a second one beside it.
 *
 * ---------------------------------------------------------------------------
 * Deploy: Supabase Dashboard → Edge Functions → line-login
 *         **Verify JWT must be OFF** — LINE calls the callback with no token of
 *         ours, and with the check on, every sign-in dies at the door with 401.
 *
 * Secrets (Edge Functions → Secrets):
 *   LINE_CHANNEL_ID      the channel id, digits only
 *   LINE_CHANNEL_SECRET  the channel secret — it lives here and nowhere else,
 *                        which is the whole reason this runs on a server
 *   LINE_STATE_SECRET    any long random string; signs the state parameter
 * SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected by the platform.
 *
 * In the LINE console, Callback URL must be exactly:
 *   https://<project>.supabase.co/functions/v1/line-login/callback
 * ========================================================================== */

const LINE_AUTHORIZE = 'https://access.line.me/oauth2/v2.1/authorize';
const LINE_TOKEN     = 'https://api.line.me/oauth2/v2.1/token';
const LINE_VERIFY    = 'https://api.line.me/oauth2/v2.1/verify';

/* Where this is allowed to send a signed-in browser.
 *
 * Not a formality. The last hop of this flow carries a link that creates a
 * session, so an unchecked `redirect` would let anyone hand out a URL that
 * signs a QubeQuote user in and drops them — session and all — on a site they
 * chose. Anything not on this list is refused rather than trimmed. */
const ALLOWED_ORIGINS = [
  'https://qubequote.com',
  'https://www.qubequote.com',
  'https://konnex.xeeb0262.workers.dev',
  'http://localhost:8845'
];

const STATE_MAX_AGE_MS = 10 * 60 * 1000;   // a login someone walked away from

// --------------------------------------------------------------- helpers ---

const enc = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlDecode(s: string): string {
  const pad = s.replace(/-/g, '+').replace(/_/g, '/');
  return atob(pad + '='.repeat((4 - pad.length % 4) % 4));
}

async function hmac(secret: string, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(msg))));
}

/* The state carries the return address and the nonce across the round trip, and
   is signed so neither can be edited while it is out of our hands. Signed rather
   than stored: a table row per attempted login is a table of litter, most of it
   from people who closed the tab. */
async function signState(secret: string, payload: unknown): Promise<string> {
  const body = b64url(enc.encode(JSON.stringify(payload)));
  return body + '.' + await hmac(secret, body);
}
async function readState(secret: string, state: string): Promise<any | null> {
  const dot = state.lastIndexOf('.');
  if (dot < 1) return null;
  const body = state.slice(0, dot), sig = state.slice(dot + 1);
  const expect = await hmac(secret, body);
  // length-independent compare is overkill for a 10-minute nonce, but constant
  // effort here costs nothing and removes the question
  if (sig.length !== expect.length) return null;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expect.charCodeAt(i);
  if (diff !== 0) return null;
  try {
    const data = JSON.parse(b64urlDecode(body));
    if (!data || typeof data.t !== 'number') return null;
    if (Date.now() - data.t > STATE_MAX_AGE_MS) return null;
    return data;
  } catch { return null; }
}

function randomId(): string {
  return b64url(crypto.getRandomValues(new Uint8Array(24)));
}

function allowedRedirect(raw: string | null): string | null {
  if (!raw) return null;
  let u: URL;
  try { u = new URL(raw); } catch { return null; }
  return ALLOWED_ORIGINS.indexOf(u.origin) > -1 ? u.toString() : null;
}

/* Failures land the person back on the login page with the reason in the URL,
   in the same shape Supabase itself uses — the app already reads that pair and
   prints it, so nothing new is needed on the page to show these. */
function fail(back: string | null, code: string, description: string): Response {
  const to = back || ALLOWED_ORIGINS[0] + '/';
  const u = new URL(to);
  u.searchParams.set('error', code);
  u.searchParams.set('error_description', description);
  return Response.redirect(u.toString(), 302);
}

function env(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error('ยังไม่ได้ตั้งค่า secret: ' + name);
  return v;
}

// ------------------------------------------------------------------ start ---

async function start(req: Request, url: URL): Promise<Response> {
  const back = allowedRedirect(url.searchParams.get('redirect'))
            || ALLOWED_ORIGINS[0] + '/';
  const nonce = randomId();
  const state = await signState(env('LINE_STATE_SECRET'), { r: back, n: nonce, t: Date.now() });

  const go = new URL(LINE_AUTHORIZE);
  go.searchParams.set('response_type', 'code');
  go.searchParams.set('client_id', env('LINE_CHANNEL_ID'));
  go.searchParams.set('redirect_uri', new URL('/functions/v1/line-login/callback', url.origin).toString());
  go.searchParams.set('state', state);
  go.searchParams.set('nonce', nonce);
  // email is what lets this land on the account the person already has
  go.searchParams.set('scope', 'openid profile email');
  return Response.redirect(go.toString(), 302);
}

// --------------------------------------------------------------- callback ---

async function callback(req: Request, url: URL): Promise<Response> {
  const stateRaw = url.searchParams.get('state') || '';
  const parsed = await readState(env('LINE_STATE_SECRET'), stateRaw);
  // With no valid state there is no verified return address either, so this one
  // error has to go to the default origin rather than anywhere the URL asked for
  if (!parsed) return fail(null, 'invalid_state', 'คำขอหมดอายุหรือถูกแก้ไข กรุณาลองใหม่');
  const back: string = parsed.r;

  // the person pressed cancel on LINE's consent screen
  const denied = url.searchParams.get('error');
  if (denied) {
    return fail(back, denied, url.searchParams.get('error_description') || 'ยกเลิกการเข้าสู่ระบบ');
  }

  const code = url.searchParams.get('code');
  if (!code) return fail(back, 'missing_code', 'LINE ไม่ได้ส่งรหัสยืนยันกลับมา');

  // ---- code → tokens.  LINE wants the credentials in the body, not in a
  //      Basic header, which is one of the places a generic client goes wrong
  const tokenRes = await fetch(LINE_TOKEN, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: new URL('/functions/v1/line-login/callback', url.origin).toString(),
      client_id: env('LINE_CHANNEL_ID'),
      client_secret: env('LINE_CHANNEL_SECRET')
    })
  });
  const token = await tokenRes.json().catch(() => null);
  if (!tokenRes.ok || !token?.id_token) {
    console.error('LINE token exchange failed', tokenRes.status, token);
    return fail(back, 'token_exchange_failed',
      'แลกรหัสกับ LINE ไม่สำเร็จ: ' + (token?.error_description || token?.error || tokenRes.status));
  }

  /* ---- LINE verifies its own signature.
     This is the step the dashboard provider could not do: the token is HS256
     over the channel secret, and this endpoint takes both and answers with the
     claims. `nonce` is handed back so LINE checks it against the one it was
     given at the start — that is what makes a replayed callback useless. */
  const vRes = await fetch(LINE_VERIFY, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      id_token: token.id_token,
      client_id: env('LINE_CHANNEL_ID'),
      nonce: parsed.n
    })
  });
  const claims = await vRes.json().catch(() => null);
  if (!vRes.ok || !claims?.sub) {
    console.error('LINE id_token verify failed', vRes.status, claims);
    return fail(back, 'verify_failed',
      'LINE ตรวจสอบข้อมูลไม่ผ่าน: ' + (claims?.error_description || claims?.error || vRes.status));
  }

  const email: string | undefined = claims.email;
  if (!email) {
    /* Only reachable if the channel's email permission is withdrawn, or the
       person unticks it. Said plainly rather than papered over with a made-up
       address: an account keyed on a placeholder is one nobody can ever recover. */
    return fail(back, 'no_email',
      'LINE ไม่ได้ให้อีเมลมา จึงเข้าสู่ระบบไม่ได้ — กรุณาเข้าด้วย Google หรืออีเมล');
  }

  // ---- find or make the account, then hand the browser a way in -----------
  const SUPABASE_URL = env('SUPABASE_URL');
  const SERVICE_KEY  = env('SUPABASE_SERVICE_ROLE_KEY');
  const admin = {
    'apikey': SERVICE_KEY,
    'authorization': 'Bearer ' + SERVICE_KEY,
    'content-type': 'application/json'
  };

  /* Created if new, and a duplicate is not an error — it is the ordinary case
     of somebody who already signed up with this address and is now arriving
     through LINE. email_confirm is true because LINE has already confirmed it;
     asking the person to confirm an address they just proved they hold is
     ceremony, not security. */
  const createRes = await fetch(SUPABASE_URL + '/auth/v1/admin/users', {
    method: 'POST',
    headers: admin,
    body: JSON.stringify({
      email,
      email_confirm: true,
      user_metadata: {
        line_sub: claims.sub,
        full_name: claims.name || null,
        avatar_url: claims.picture || null
      }
    })
  });
  if (!createRes.ok) {
    const body = await createRes.json().catch(() => ({}));
    const msg = String(body?.msg || body?.message || body?.error_description || '');
    const already = createRes.status === 422 || /already|registered|exists/i.test(msg);
    if (!already) {
      console.error('admin createUser failed', createRes.status, body);
      return fail(back, 'account_failed', 'สร้างบัญชีไม่สำเร็จ: ' + (msg || createRes.status));
    }
  }

  /* A one-time link for this address. The browser follows it, Supabase sets the
     session and forwards to `back` — so no token this function holds is ever
     written into a page or a log. */
  const linkRes = await fetch(SUPABASE_URL + '/auth/v1/admin/generate_link', {
    method: 'POST',
    headers: admin,
    // redirect_to is top level here — this is GoTrue's own admin API, not the
    // JS client, which is where the nested `options` shape comes from
    body: JSON.stringify({ type: 'magiclink', email, redirect_to: back })
  });
  const link = await linkRes.json().catch(() => null);
  if (!linkRes.ok || !link?.action_link) {
    console.error('generate_link failed', linkRes.status, link);
    return fail(back, 'session_failed',
      'ออกเซสชันไม่สำเร็จ: ' + (link?.msg || link?.error_description || linkRes.status));
  }
  return Response.redirect(link.action_link, 302);
}

// ------------------------------------------------------------------ route ---

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  try {
    if (url.pathname.endsWith('/callback')) return await callback(req, url);
    return await start(req, url);
  } catch (e) {
    // a missing secret lands here, and saying which one saves an hour
    console.error('line-login crashed', e);
    return fail(null, 'server_error', String((e as Error)?.message || e));
  }
});
