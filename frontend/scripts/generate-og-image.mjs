import puppeteer from "puppeteer";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function main() {
  const htmlPath = join(__dirname, "og-preview.html");
  const outputPath = join(__dirname, "..", "public", "og-image.jpg");

  const browser = await puppeteer.launch({
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  });
  const page = await browser.newPage();

  await page.setViewport({ width: 1200, height: 630, deviceScaleFactor: 2 });
  await page.goto(`file://${htmlPath}`, { waitUntil: "networkidle0" });

  // Screenshot just the .og-container element
  const container = await page.$(".og-container");
  await container.screenshot({
    path: outputPath,
    type: "jpeg",
    quality: 90,
  });

  await browser.close();
  console.log(`OG image generated: ${outputPath}`);
  console.log("Size: 1200x630 (2x DPR)");
}

main().catch(console.error);
