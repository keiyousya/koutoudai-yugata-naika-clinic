// マニュアルの開発サーバ。docs/ を watch して再ビルドし、ブラウザを自動リロードする。
// 暗号化(Staticrypt)はかけないので、そのまま中身が見える状態で確認できる。
import { createServer } from "node:http";
import { watch } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { join, extname, normalize } from "node:path";
import { execFile } from "node:child_process";

const PORT = Number(process.env.PORT ?? 5178);
const ROOT = new URL("./", import.meta.url).pathname;
const DIST = join(ROOT, "dist");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".pdf": "application/pdf",
};

/** @type {Set<import("node:http").ServerResponse>} */
const clients = new Set();

let buildCount = 0;
let building = Promise.resolve();

async function rebuild() {
  const started = Date.now();
  // build.mjs 自体（CSS やレイアウト）の編集も拾えるよう、毎回キャッシュを外して読み直す
  const { build } = await import(`./build.mjs?v=${++buildCount}`);
  await build({ encrypt: false, liveReload: true });
  console.log(`\nBuilt in ${Date.now() - started}ms — http://localhost:${PORT}/`);
}

function notifyReload() {
  for (const res of clients) res.write("data: reload\n\n");
}

async function serveFile(res, filePath) {
  const body = await readFile(filePath);
  res.writeHead(200, {
    "Content-Type": MIME[extname(filePath).toLowerCase()] ?? "application/octet-stream",
    "Cache-Control": "no-store",
  });
  res.end(body);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname === "/__reload") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    res.write(": connected\n\n");
    clients.add(res);
    req.on("close", () => clients.delete(res));
    return;
  }

  // 再ビルド中は dist を作り直しているので、終わるまで待ってから返す
  await building;

  const rel = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, "");
  let filePath = join(DIST, rel);

  try {
    if ((await stat(filePath)).isDirectory()) filePath = join(filePath, "index.html");
    await serveFile(res, filePath);
  } catch {
    // 拡張子なしのパスは .html を補ってみる
    try {
      await serveFile(res, `${filePath}.html`);
    } catch {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("404 Not Found");
    }
  }
});

let timer = null;
function scheduleRebuild(label) {
  clearTimeout(timer);
  timer = setTimeout(() => {
    console.log(`\nChanged: ${label} — rebuilding...`);
    building = rebuild().then(notifyReload, (err) => {
      console.error("Build failed:", err.message);
    });
  }, 100);
}

building = rebuild();
await building;

for (const target of ["docs", "emergency-docs", "build.mjs", "favicon.svg"]) {
  watch(join(ROOT, target), { recursive: true }, (_event, filename) => {
    scheduleRebuild(filename ? join(target, filename) : target);
  });
}

server.listen(PORT, () => {
  console.log(`\nWatching docs/ and emergency-docs/ — http://localhost:${PORT}/`);
  if (!process.argv.includes("--no-open")) {
    execFile("open", [`http://localhost:${PORT}/`]);
  }
});
