import { readdir, readFile, writeFile, mkdir, rm, copyFile } from "node:fs/promises";
import { join, parse } from "node:path";
import { marked } from "marked";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const DOCS_DIR = new URL("./docs/", import.meta.url);
const DIST_DIR = new URL("./dist/", import.meta.url);
const noEncrypt = process.argv.includes("--no-encrypt");
const password = process.env.MANUALS_PASSWORD;

if (!noEncrypt && !password) {
  console.error("Error: MANUALS_PASSWORD env var is required (or use --no-encrypt)");
  process.exit(1);
}

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
`;

function wrapHtml(title, bodyHtml, isIndex = false) {
  const backLink = isIndex ? "" : `<a class="back-link" href="./index.html">&larr; マニュアル一覧に戻る</a>\n`;
  const printBtn = isIndex ? "" : `<div class="page-controls"><button class="print-btn" onclick="window.print()">印刷する</button></div>\n`;
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title} - 院内マニュアル</title>
<link rel="icon" type="image/png" sizes="32x32" href="./favicon-32x32.png">
<link rel="icon" type="image/png" sizes="16x16" href="./favicon-16x16.png">
<link rel="apple-touch-icon" sizes="180x180" href="./apple-touch-icon.png">
<style>${isIndex ? INDEX_CSS : CSS}</style>
</head>
<body>
${backLink}${printBtn}${bodyHtml}
</body>
</html>`;
}

// Extract first H1 from markdown as title, fallback to filename
function extractTitle(md, filename) {
  const match = md.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : filename;
}

async function main() {
  // Clean and create dist
  await rm(DIST_DIR, { recursive: true, force: true });
  await mkdir(DIST_DIR, { recursive: true });

  // Copy favicon files from frontend/public
  const FRONTEND_PUBLIC = new URL("../frontend/public/", import.meta.url);
  const faviconFiles = ["favicon-16x16.png", "favicon-32x32.png", "apple-touch-icon.png"];
  for (const file of faviconFiles) {
    await copyFile(
      join(FRONTEND_PUBLIC.pathname, file),
      join(DIST_DIR.pathname, file)
    );
  }
  console.log("Copied favicon files from frontend/public/");

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
    const htmlBody = await marked(md);
    const html = wrapHtml(title, htmlBody);
    const outPath = join(DIST_DIR.pathname, `${slug}.html`);
    await writeFile(outPath, html);
    manuals.push({ slug, title });
    console.log(`  ${file} → ${slug}.html`);
  }

  // Generate index page
  const listItems = manuals.map((m) => `<li><a href="./${m.slug}.html">${m.title}</a></li>`).join("\n");
  const indexHtml = wrapHtml(
    "院内マニュアル",
    `<h1>院内マニュアル</h1>\n<p class="subtitle">勾当台夕方内科クリニック</p>\n<h2>操作マニュアル</h2>\n<div class="external-links">\n<a href="https://www.notion.so/3356e8ba85c58016818ed588fda40651?source=copy_link" target="_blank">📋 電子カルテ・レセコン操作マニュアル</a>\n</div>\n<h2>院内マニュアル</h2>\n<ul class="manual-list">\n${listItems}\n</ul>`,
    true,
  );
  await writeFile(join(DIST_DIR.pathname, "index.html"), indexHtml);
  console.log(`  index.html (${manuals.length} manuals listed)`);

  // Encrypt with Staticrypt
  if (!noEncrypt) {
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

main();
