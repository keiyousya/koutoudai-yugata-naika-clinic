// public/forms/*.html（予診票など）から同名の PDF を作る。
// HTML が原本。HTML を直したらこのスクリプトを実行して PDF もコミットする。
//   pnpm --filter frontend forms:pdf
import { execFileSync } from "child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "fs";
import { tmpdir } from "os";
import { dirname, join } from "path";
import { fileURLToPath, pathToFileURL } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const formsDir = join(__dirname, "..", "public", "forms");

const chromeCandidates = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
].filter(Boolean);
const chrome = chromeCandidates.find((p) => existsSync(p));
if (!chrome) {
  console.error("Chrome が見つかりません。CHROME_PATH で指定してください。");
  process.exit(1);
}

const htmlFiles = readdirSync(formsDir).filter((f) => f.endsWith(".html"));
// 普段使いの Chrome と干渉しないよう、使い捨てのプロファイルで起動する
const userDataDir = mkdtempSync(join(tmpdir(), "forms-pdf-"));

try {
  for (const file of htmlFiles) {
    const input = join(formsDir, file);
    const output = join(formsDir, file.replace(/\.html$/, ".pdf"));
    execFileSync(chrome, [
      "--headless=new",
      "--disable-gpu",
      `--user-data-dir=${userDataDir}`,
      "--no-pdf-header-footer",
      "--run-all-compositor-stages-before-draw",
      // Google Fonts（Noto Sans JP）の読み込みを待つ
      "--virtual-time-budget=15000",
      `--print-to-pdf=${output}`,
      pathToFileURL(input).href,
    ], { stdio: "inherit" });
    console.log(`PDF generated: ${output}`);
  }
} finally {
  rmSync(userDataDir, { recursive: true, force: true });
}
