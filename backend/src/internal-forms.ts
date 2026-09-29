// 院内専用帳票（internal-forms/）をパスワード認証つきで配信する Worker。
// パスワードが合えば署名付き Cookie を発行し、その間だけ静的ファイル（ASSETS）を返す。
// パスワードは secrets の FORMS_PASSWORD。変えると発行済みのセッションはすべて無効になる。
import { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";

type Bindings = {
  FORMS_PASSWORD: string;
  ASSETS: Fetcher;
};

const COOKIE_NAME = "forms_session";
const SESSION_SECONDS = 60 * 60 * 24 * 7; // 7日

const app = new Hono<{ Bindings: Bindings }>();

const encoder = new TextEncoder();

async function hmac(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// 長さを漏らさない比較のため、両辺を HMAC してから比べる
async function safeEqual(secret: string, a: string, b: string): Promise<boolean> {
  const [ha, hb] = await Promise.all([hmac(secret, a), hmac(secret, b)]);
  let diff = 0;
  for (let i = 0; i < ha.length; i++) diff |= ha.charCodeAt(i) ^ hb.charCodeAt(i);
  return diff === 0;
}

async function issueSession(secret: string): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
  return `${exp}.${await hmac(secret, `session:${exp}`)}`;
}

async function isValidSession(secret: string, value: string | undefined): Promise<boolean> {
  if (!value) return false;
  const [expStr, sig] = value.split(".");
  const exp = Number(expStr);
  if (!exp || !sig || exp < Date.now() / 1000) return false;
  return safeEqual(secret, sig, await hmac(secret, `session:${exp}`));
}

// ログイン後の戻り先は同一オリジンのパスに限る
function safeNext(next: string | undefined): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

function loginPage(next: string, error: boolean): string {
  const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex, nofollow">
<title>ログイン｜院内帳票</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Hiragino Kaku Gothic ProN", "Hiragino Sans", Meiryo, sans-serif; background: #f1f5f9; min-height: 100vh; display: grid; place-items: center; padding: 16px; }
  form { width: 100%; max-width: 360px; background: white; border: 1px solid #cbd5e1; border-radius: 12px; padding: 24px; display: grid; gap: 14px; }
  h1 { font-size: 1.05rem; color: #2c5f7c; }
  p { font-size: 0.85rem; color: #475569; }
  input { font: inherit; padding: 10px 12px; border: 1px solid #94a3b8; border-radius: 8px; }
  button { font: inherit; font-weight: 700; padding: 10px; border: none; border-radius: 8px; background: #2c5f7c; color: white; cursor: pointer; }
  .error { color: #b91c1c; }
</style>
</head>
<body>
<form method="post" action="/login">
  <h1>勾当台夕方内科クリニック　院内帳票</h1>
  <p>院内専用のページです。パスワードを入力してください。</p>
  ${error ? '<p class="error">パスワードが違います。</p>' : ""}
  <input type="password" name="password" autocomplete="current-password" aria-label="パスワード" required autofocus>
  <input type="hidden" name="next" value="${esc(next)}">
  <button type="submit">ログイン</button>
</form>
</body>
</html>`;
}

app.use("*", async (c, next) => {
  await next();
  c.header("X-Robots-Tag", "noindex, nofollow");
  c.header("Cache-Control", "private, no-store");
});

app.get("/robots.txt", (c) => c.text("User-agent: *\nDisallow: /\n"));

app.get("/login", (c) => c.html(loginPage(safeNext(c.req.query("next")), c.req.query("error") === "1")));

app.post("/login", async (c) => {
  const body = await c.req.parseBody();
  const password = typeof body.password === "string" ? body.password : "";
  const next = safeNext(typeof body.next === "string" ? body.next : undefined);
  const secret = c.env.FORMS_PASSWORD;

  if (!secret || !(await safeEqual(secret, password, secret))) {
    // 総当たりを遅らせる
    await new Promise((r) => setTimeout(r, 800));
    return c.redirect(`/login?error=1&next=${encodeURIComponent(next)}`, 303);
  }

  setCookie(c, COOKIE_NAME, await issueSession(secret), {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    path: "/",
    maxAge: SESSION_SECONDS,
  });
  return c.redirect(next, 303);
});

app.get("/logout", (c) => {
  deleteCookie(c, COOKIE_NAME, { path: "/", secure: true });
  return c.redirect("/login", 303);
});

app.all("*", async (c) => {
  if (!(await isValidSession(c.env.FORMS_PASSWORD, getCookie(c, COOKIE_NAME)))) {
    const url = new URL(c.req.url);
    return c.redirect(`/login?next=${encodeURIComponent(url.pathname + url.search)}`, 303);
  }
  const res = await c.env.ASSETS.fetch(c.req.raw);
  return new Response(res.body, res);
});

export default app;
