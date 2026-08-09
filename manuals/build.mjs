import { readdir, readFile, writeFile, mkdir, rm, copyFile } from "node:fs/promises";
import { join, parse } from "node:path";
import { marked } from "marked";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";

const execFileAsync = promisify(execFile);

export const DOCS_DIR = new URL("./docs/", import.meta.url);
export const DIST_DIR = new URL("./dist/", import.meta.url);
export const EMERGENCY_DOCS_DIR = new URL("./emergency-docs/", import.meta.url);
const EMERGENCY_DIST_DIR = new URL("./dist/emergency/", import.meta.url);
const EMERGENCY_IMAGES_DIR = new URL("./emergency-docs/images/", import.meta.url);

const IMAGES_DIR = new URL("./docs/images/", import.meta.url);

// dev サーバ（dev.mjs）から呼ばれたときだけ、ライブリロード用のスクリプトを埋め込む
let liveReload = false;

// Minimal clinic-style CSS
const CSS = `
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP", sans-serif; line-height: 1.8; color: #333; max-width: 820px; margin: 0 auto; padding: 2rem 1.5rem; background: #fafaf8; }
h1 { font-size: 1.6rem; color: #5b4a3f; border-bottom: 2px solid #c9b99a; padding-bottom: 0.4rem; margin-bottom: 1.2rem; }
h2 { font-size: 1.3rem; color: #5b4a3f; margin-top: 2rem; margin-bottom: 0.6rem; padding-left: 0.6rem; border-left: 4px solid #c9b99a; }
h3 { font-size: 1.1rem; color: #6b5d52; margin-top: 1.4rem; margin-bottom: 0.4rem; }
p { margin-bottom: 0.8rem; }
ul, ol { margin: 0.5rem 0 1rem 1.5rem; }
li { margin-bottom: 0.3rem; }
table { width: 100%; border-collapse: collapse; margin: 1rem 0; }
th, td { border: 1px solid #d0c8b8; padding: 0.5rem 0.8rem; text-align: left; }
th { background: #f0ebe0; color: #5b4a3f; font-weight: 600; }
tr:nth-child(even) { background: #f8f6f0; }
code { background: #f0ebe0; padding: 0.15rem 0.4rem; border-radius: 3px; font-size: 0.9em; }
pre { background: #f0ebe0; padding: 1rem; border-radius: 6px; overflow-x: auto; margin: 1rem 0; }
pre code { background: none; padding: 0; }
blockquote { border-left: 4px solid #c9b99a; padding: 0.5rem 1rem; margin: 1rem 0; background: #f8f6f0; color: #6b5d52; }
a { color: #8b6d4f; }
hr { border: none; border-top: 1px solid #d0c8b8; margin: 1.5rem 0; }
img { max-width: 100%; height: auto; border: 1px solid #d0c8b8; border-radius: 6px; margin: 1rem 0; }
.back-link { display: inline-block; margin-bottom: 1.5rem; color: #8b6d4f; text-decoration: none; font-size: 0.9rem; }
.back-link:hover { text-decoration: underline; }
.page-controls { display: flex; gap: 0.8rem; margin-bottom: 1.5rem; }
.print-btn { padding: 0.5rem 1rem; background: #c9b99a; color: #fff; border: none; border-radius: 4px; font-size: 0.9rem; cursor: pointer; text-decoration: none; font-family: inherit; }
.print-btn:hover { background: #b5a581; }
@media print { .page-controls { display: none; } }
`;

const INDEX_CSS = `
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP", sans-serif; line-height: 1.8; color: #333; max-width: 820px; margin: 0 auto; padding: 2rem 1.5rem; background: #fafaf8; }
h1 { font-size: 1.6rem; color: #5b4a3f; border-bottom: 2px solid #c9b99a; padding-bottom: 0.4rem; margin-bottom: 0.5rem; }
h2 { font-size: 1.1rem; color: #5b4a3f; margin-top: 1.5rem; margin-bottom: 0.8rem; }
.subtitle { color: #8b7d6b; font-size: 0.95rem; margin-bottom: 2rem; }
.external-links { display: grid; gap: 0.6rem; margin-bottom: 2rem; }
.external-links a { display: flex; align-items: center; justify-content: center; padding: 0.8rem 1rem; background: #c9b99a; color: #fff; border: none; border-radius: 6px; text-decoration: none; font-size: 0.95rem; transition: background 0.15s; }
.external-links a:hover { background: #b5a581; }
.manual-list { list-style: none; }
.manual-list li { margin-bottom: 0.5rem; }
.manual-list a { display: block; padding: 0.8rem 1rem; background: #fff; border: 1px solid #d0c8b8; border-radius: 6px; color: #5b4a3f; text-decoration: none; transition: background 0.15s; }
.manual-list a:hover { background: #f0ebe0; }
.emergency-banner { margin-bottom: 2rem; }
.emergency-banner a { display: block; padding: 1.3rem 1.2rem; background: #a32b2b; color: #fff; border-radius: 8px; text-decoration: none; font-size: 1.3rem; font-weight: 700; text-align: center; line-height: 1.4; transition: background 0.15s; }
.emergency-banner a:hover { background: #872323; }
.emergency-banner span { display: block; font-size: 0.85rem; font-weight: 400; opacity: 0.9; margin-top: 0.2rem; }
`;

// 緊急時マニュアル用。通常マニュアルより文字を大きく、赤系のアクセントにする
const EMERGENCY_CSS = `
${CSS}
body { max-width: 860px; font-size: 1.05rem; background: #fdfaf9; }
h1 { color: #a32b2b; border-bottom-color: #d98b8b; }
h2 { color: #a32b2b; border-left-color: #d98b8b; font-size: 1.4rem; }
h3 { color: #8c3a3a; }
th { background: #f7e9e9; color: #a32b2b; }
th, td { border-color: #e0c8c8; }
tr:nth-child(even) { background: #fbf4f4; }
blockquote { border-left-color: #d98b8b; background: #fbf1f1; color: #8c3a3a; }
strong { color: #a32b2b; }
a { color: #a32b2b; }
code { background: #f7e9e9; }
img { max-height: 440px; width: auto; }
.back-link { color: #a32b2b; }
.print-btn { background: #a32b2b; }
.print-btn:hover { background: #872323; }
`;

const EMERGENCY_INDEX_CSS = `
${INDEX_CSS}
body { background: #fdfaf9; }
h1 { color: #a32b2b; border-bottom-color: #d98b8b; }
h2 { color: #a32b2b; }
.manual-list a { border-color: #e0c8c8; color: #a32b2b; font-size: 1.15rem; font-weight: 600; padding: 1.1rem 1rem; }
.manual-list a:hover { background: #f7e9e9; }
.back-link { display: inline-block; margin-bottom: 1.5rem; color: #8b6d4f; text-decoration: none; font-size: 0.9rem; }
.back-link:hover { text-decoration: underline; }
`;

// 掲示用A4。1枚に収まるよう余白と文字を詰める
const POSTER_CSS = `
${EMERGENCY_CSS}
body { max-width: 780px; font-size: 0.82rem; line-height: 1.5; padding: 1rem; }
h1 { font-size: 1.35rem; margin-bottom: 0.5rem; padding-bottom: 0.2rem; }
h2 { font-size: 0.95rem; margin-top: 0.7rem; margin-bottom: 0.2rem; padding-left: 0.4rem; border-left-width: 3px; }
table { margin: 0.25rem 0; }
th, td { padding: 0.18rem 0.4rem; }
ul, ol { margin: 0.2rem 0 0.4rem 1.2rem; }
li { margin-bottom: 0.05rem; }
blockquote { margin: 0.3rem 0; padding: 0.3rem 0.6rem; }
p { margin-bottom: 0.3rem; }
@page { size: A4 portrait; margin: 7mm; }
@media print { body { font-size: 8.2pt; padding: 0; } .back-link { display: none; } }
.page-controls { margin-bottom: 0.6rem; }
.print-btn { font-size: 0.85rem; padding: 0.4rem 0.9rem; }
`;

// 掲示用ページの目印
const POSTER_MARKER = "<!-- layout: poster -->";

// dev サーバのSSEを購読して、再ビルドされたらリロードする
const LIVE_RELOAD_SCRIPT = `
<script>
(() => {
  const connect = () => {
    const es = new EventSource("/__reload");
    es.onmessage = (e) => { if (e.data === "reload") location.reload(); };
    es.onerror = () => { es.close(); setTimeout(connect, 1000); };
  };
  connect();
})();
</script>`;

function wrapHtml(title, bodyHtml, opts = {}) {
  const { isIndex = false, emergency = false, poster = false, backHref, backLabel } = opts;
  const href = backHref ?? "./index.html";
  const label = backLabel ?? "マニュアル一覧に戻る";
  const backLink = isIndex && !backHref ? "" : `<a class="back-link" href="${href}">&larr; ${label}</a>\n`;
  const printBtn = isIndex
    ? ""
    : `<div class="page-controls"><button class="print-btn" onclick="window.print()">印刷する</button></div>\n`;
  const css = poster
    ? POSTER_CSS
    : emergency
      ? isIndex
        ? EMERGENCY_INDEX_CSS
        : EMERGENCY_CSS
      : isIndex
        ? INDEX_CSS
        : CSS;
  const suffix = emergency ? "緊急時マニュアル" : "院内マニュアル";
  // 緊急時マニュアルはパスワードなしで公開されるため検索避けを入れる
  const robots = emergency ? `<meta name="robots" content="noindex, nofollow">\n` : "";
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
${robots}<title>${title} - ${suffix}</title>
<link rel="icon" type="image/svg+xml" href="${emergency ? "../favicon.svg" : "./favicon.svg"}">
<style>${css}</style>
</head>
<body>
${backLink}${printBtn}${bodyHtml}
${liveReload ? LIVE_RELOAD_SCRIPT : ""}
</body>
</html>`;
}

// 外部リンク（PMDA添付文書など）は別タブで開く。マニュアル本体を見失わないようにするため
function openExternalInNewTab(html) {
  return html.replace(/<a href="(https?:\/\/)/g, '<a target="_blank" rel="noopener" href="$1');
}

// Extract first H1 from markdown as title, fallback to filename
function extractTitle(md, filename) {
  const match = md.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : filename;
}

// 緊急時マニュアルは dist/emergency/ に別サイトとして出力する。
// 急変時にパスワード入力で足止めされないよう、Staticryptの対象には含めない。
async function buildEmergency() {
  console.log("\nBuilding emergency manuals (unencrypted)...");
  await mkdir(EMERGENCY_DIST_DIR, { recursive: true });

  try {
    const imageFiles = await readdir(EMERGENCY_IMAGES_DIR);
    if (imageFiles.length > 0) {
      const distImagesDir = new URL("./images/", EMERGENCY_DIST_DIR);
      await mkdir(distImagesDir, { recursive: true });
      for (const file of imageFiles) {
        await copyFile(
          join(EMERGENCY_IMAGES_DIR.pathname, file),
          join(distImagesDir.pathname, file)
        );
      }
      console.log(`  Copied ${imageFiles.length} image(s) from emergency-docs/images/`);
    }
  } catch {
    // images folder doesn't exist, skip
  }

  const files = (await readdir(EMERGENCY_DOCS_DIR)).filter((f) => f.endsWith(".md")).sort();
  const pages = [];

  for (const file of files) {
    const md = await readFile(join(EMERGENCY_DOCS_DIR.pathname, file), "utf-8");
    const slug = parse(file).name;
    const title = extractTitle(md, slug);
    const poster = md.includes(POSTER_MARKER);
    const htmlBody = openExternalInNewTab(await marked(md));
    const html = wrapHtml(title, htmlBody, {
      emergency: true,
      poster,
      backLabel: "緊急時マニュアル一覧に戻る",
    });
    await writeFile(join(EMERGENCY_DIST_DIR.pathname, `${slug}.html`), html);
    pages.push({ slug, title });
    console.log(`  ${file} → emergency/${slug}.html${poster ? " (poster)" : ""}`);
  }

  const listItems = pages.map((p) => `<li><a href="./${p.slug}.html">${p.title}</a></li>`).join("\n");
  const indexHtml = wrapHtml(
    "緊急時マニュアル",
    `<h1>🚨 緊急時マニュアル</h1>\n<p class="subtitle">勾当台夕方内科クリニック</p>\n<ul class="manual-list">\n${listItems}\n</ul>`,
    {
      isIndex: true,
      emergency: true,
      backHref: "../index.html",
      backLabel: "院内マニュアル一覧に戻る",
    },
  );
  await writeFile(join(EMERGENCY_DIST_DIR.pathname, "index.html"), indexHtml);
  console.log(`  emergency/index.html (${pages.length} manuals listed)`);
}

export async function build(options = {}) {
  const { encrypt = true, password, liveReload: enableLiveReload = false } = options;
  liveReload = enableLiveReload;

  // Clean and create dist
  await rm(DIST_DIR, { recursive: true, force: true });
  await mkdir(DIST_DIR, { recursive: true });

  // Copy the manuals favicon (book icon)
  await copyFile(
    new URL("./favicon.svg", import.meta.url).pathname,
    join(DIST_DIR.pathname, "favicon.svg")
  );
  console.log("Copied favicon.svg");

  // Copy images folder if exists
  try {
    const imageFiles = await readdir(IMAGES_DIR);
    if (imageFiles.length > 0) {
      const distImagesDir = new URL("./images/", DIST_DIR);
      await mkdir(distImagesDir, { recursive: true });
      for (const file of imageFiles) {
        await copyFile(
          join(IMAGES_DIR.pathname, file),
          join(distImagesDir.pathname, file)
        );
      }
      console.log(`Copied ${imageFiles.length} image(s) from docs/images/`);
    }
  } catch {
    // images folder doesn't exist, skip
  }

  // Read all markdown files
  const files = (await readdir(DOCS_DIR)).filter((f) => f.endsWith(".md")).sort();

  if (files.length === 0) {
    console.error("No .md files found in docs/");
    process.exit(1);
  }

  const manuals = [];

  // Convert each MD to HTML
  for (const file of files) {
    const md = await readFile(join(DOCS_DIR.pathname, file), "utf-8");
    const slug = parse(file).name;
    const title = extractTitle(md, slug);
    const htmlBody = openExternalInNewTab(await marked(md));
    const html = wrapHtml(title, htmlBody, {});
    const outPath = join(DIST_DIR.pathname, `${slug}.html`);
    await writeFile(outPath, html);
    manuals.push({ slug, title });
    console.log(`  ${file} → ${slug}.html`);
  }

  // Generate index page
  const listItems = manuals.map((m) => `<li><a href="./${m.slug}.html">${m.title}</a></li>`).join("\n");
  const indexHtml = wrapHtml(
    "院内マニュアル",
    `<h1>院内マニュアル</h1>\n<p class="subtitle">勾当台夕方内科クリニック</p>\n<div class="emergency-banner">\n<a href="./emergency/index.html">🚨 緊急時マニュアル<span>急変・救急セットはこちら</span></a>\n</div>\n<h2>操作マニュアル</h2>\n<div class="external-links">\n<a href="https://www.notion.so/3356e8ba85c58016818ed588fda40651?source=copy_link" target="_blank">📋 電子カルテ・レセコン操作マニュアル</a>\n</div>\n<h2>院内マニュアル</h2>\n<ul class="manual-list">\n${listItems}\n</ul>`,
    { isIndex: true },
  );
  await writeFile(join(DIST_DIR.pathname, "index.html"), indexHtml);
  console.log(`  index.html (${manuals.length} manuals listed)`);

  await buildEmergency();

  // Encrypt with Staticrypt
  if (encrypt) {
    console.log("\nEncrypting with Staticrypt...");
    const htmlFiles = [...manuals.map((m) => join(DIST_DIR.pathname, `${m.slug}.html`)), join(DIST_DIR.pathname, "index.html")];
    const staticryptBin = new URL("./node_modules/.bin/staticrypt", import.meta.url).pathname;
    await execFileAsync(staticryptBin, [
      ...htmlFiles,
      "-p", password,
      "--remember", "30",
      "--short",
      "-d", DIST_DIR.pathname,
      "-c", "false",
      "-s", "56d2f874ff867f08c716c247c7e55597",
      "--template-color-primary", "#333",
      "--template-color-secondary", "#f5f5f5",
      "--template-title", "勾当台夕方内科クリニック 院内マニュアル",
      "--template-button", "開く",
      "--template-placeholder", "パスワード",
      "--template-remember", "次回から入力を省略",
      "--template-error", "パスワードが違います",
    ]);
    console.log("  All files encrypted.");
  } else {
    console.log("\n--no-encrypt: skipping encryption");
  }

  console.log("\nDone! Output in manuals/dist/");
}

// CLI として直接実行されたときだけ引数・env を読む（dev.mjs からは build() を直接呼ぶ）
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const encrypt = !process.argv.includes("--no-encrypt");
  const cliPassword = process.env.MANUALS_PASSWORD;

  if (encrypt && !cliPassword) {
    console.error("Error: MANUALS_PASSWORD env var is required (or use --no-encrypt)");
    process.exit(1);
  }

  await build({ encrypt, password: cliPassword });
}
