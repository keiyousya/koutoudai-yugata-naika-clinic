import sharp from "sharp";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const WIDTH = 1200;
const HEIGHT = 630;

// Load logo PNG as base64 data URI
function loadLogoBase64() {
  const logoPath = join(__dirname, "..", "src", "assets", "logo.png");
  const buf = readFileSync(logoPath);
  return `data:image/png;base64,${buf.toString("base64")}`;
}

// Generate random stars
function generateStars(count) {
  let stars = "";
  for (let i = 0; i < count; i++) {
    const x = Math.random() * WIDTH;
    const y = Math.random() * (HEIGHT * 0.6);
    const r = Math.random() * 1.5 + 0.5;
    const opacity = Math.random() * 0.6 + 0.3;
    stars += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}" fill="white" opacity="${opacity.toFixed(2)}"/>`;
  }
  return stars;
}

// City skyline — denser, more opaque, brighter windows (matching reference)
function generateSkyline() {
  const buildings = [
    [0, 50, 110], [52, 30, 75], [84, 65, 160], [152, 40, 90],
    [194, 55, 135], [252, 70, 180], [325, 35, 85], [362, 55, 145],
    [420, 45, 100], [468, 75, 175], [546, 40, 90], [588, 60, 155],
    [650, 35, 80], [688, 80, 185], [770, 30, 95], [802, 55, 140],
    [860, 45, 100], [908, 70, 170], [980, 40, 85], [1022, 60, 150],
    [1084, 35, 95], [1120, 55, 135], [1178, 25, 75],
  ];

  let svg = "";
  const baseY = HEIGHT;

  for (const [x, w, h] of buildings) {
    const y = baseY - h;
    // Building body — more opaque
    svg += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#1a2d45" opacity="0.85"/>`;

    // Windows — brighter
    const windowW = 7;
    const windowH = 9;
    const cols = Math.floor((w - 8) / 13);
    const rows = Math.floor((h - 12) / 18);
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const wx = x + 5 + col * 13;
        const wy = y + 8 + row * 18;
        if (Math.random() > 0.35) {
          svg += `<rect x="${wx}" y="${wy}" width="${windowW}" height="${windowH}" fill="#ffd78a" opacity="${(Math.random() * 0.3 + 0.5).toFixed(2)}" rx="1"/>`;
        }
      }
    }
  }
  return svg;
}

// Schedule table — matching reference exactly
function generateScheduleTable() {
  const tableX = 640;
  const tableY = 310;
  const tableW = 510;

  const days = [
    { label: "月", open: false },
    { label: "火", open: false },
    { label: "水", open: true },
    { label: "木", open: true },
    { label: "金", open: true },
    { label: "土", open: true, weekend: true },
    { label: "日", open: true, weekend: true },
  ];

  const labelColW = 140;
  const headerH = 52;
  const bodyH = 52;
  const noteH = 32;
  const totalH = headerH + bodyH + noteH;
  const font = "'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Noto Sans JP', sans-serif";

  // Inner dimensions
  const pad = 0;
  const innerW = tableW;
  const innerLabelW = labelColW;
  const innerDayColW = (innerW - innerLabelW) / 7;

  let svg = "";

  // Drop shadow for table
  svg += `<rect x="${tableX + 3}" y="${tableY + 3}" width="${tableW}" height="${totalH}" rx="4" fill="rgba(0,0,0,0.2)"/>`;

  // White outer border/container
  svg += `<rect x="${tableX}" y="${tableY}" width="${tableW}" height="${totalH}" rx="4" fill="white" stroke="#1e3a5f" stroke-width="2"/>`;

  // Header row (white bg) — top part
  // Horizontal line separating header from body
  svg += `<line x1="${tableX}" y1="${tableY + headerH}" x2="${tableX + tableW}" y2="${tableY + headerH}" stroke="#ccc" stroke-width="1"/>`;

  // Header text: 診療時間
  svg += `<text x="${tableX + innerLabelW / 2}" y="${tableY + headerH / 2 + 7}" text-anchor="middle" font-family="${font}" font-size="17" font-weight="600" fill="#1e3a5f" letter-spacing="5">診療時間</text>`;

  // Day headers
  for (let i = 0; i < days.length; i++) {
    const cx = tableX + pad + innerLabelW + innerDayColW * i + innerDayColW / 2;
    const color = days[i].weekend ? "#d03030" : "#1e3a5f";
    svg += `<text x="${cx}" y="${tableY + headerH / 2 + 8}" text-anchor="middle" font-family="${font}" font-size="21" font-weight="600" fill="${color}" letter-spacing="3">${days[i].label}</text>`;
  }

  // Body row — white bg, time + dots
  const bodyY = tableY + headerH;

  // Time label
  svg += `<text x="${tableX + innerLabelW / 2}" y="${bodyY + bodyH / 2 + 6}" text-anchor="middle" font-family="${font}" font-size="16" font-weight="700" fill="#1e3a5f" letter-spacing="0.5">17:00−21:00</text>`;

  // Day status
  for (let i = 0; i < days.length; i++) {
    const cx = tableX + pad + innerLabelW + innerDayColW * i + innerDayColW / 2;
    const cy = bodyY + bodyH / 2;
    if (days[i].open) {
      svg += `<circle cx="${cx}" cy="${cy}" r="13" fill="#e8a04c"/>`;
    } else {
      svg += `<text x="${cx}" y="${cy + 6}" text-anchor="middle" font-family="${font}" font-size="20" fill="#999">―</text>`;
    }
  }

  // Horizontal line separating body from note
  const noteY = bodyY + bodyH;
  svg += `<line x1="${tableX}" y1="${noteY}" x2="${tableX + tableW}" y2="${noteY}" stroke="#ccc" stroke-width="1"/>`;

  // Note row (white bg)
  svg += `<text x="${tableX + 14}" y="${noteY + noteH / 2 + 5}" font-family="${font}" font-size="12" font-weight="600" fill="#1e3a5f">【休診日】月曜日・火曜日・祝日</text>`;
  svg += `<text x="${tableX + 230}" y="${noteY + noteH / 2 + 5}" font-family="${font}" font-size="10" fill="#888">※急な休診等はウェブサイトにてお知らせいたします。</text>`;

  return svg;
}

// Geometric decorative lines (circuit-board style like reference)
function generateDecoLines() {
  let svg = "";
  const color = "rgba(255,255,255,0.12)";
  const sw = "1.5";

  // Top-left area circuit patterns
  // Horizontal + vertical connector lines
  svg += `<polyline points="250,25 310,25 310,55 370,55" fill="none" stroke="${color}" stroke-width="${sw}"/>`;
  svg += `<rect x="308" y="23" width="5" height="5" fill="${color}" rx="1"/>`;

  svg += `<polyline points="420,15 420,45 490,45" fill="none" stroke="${color}" stroke-width="${sw}"/>`;
  svg += `<rect x="488" y="43" width="5" height="5" fill="${color}" rx="1"/>`;

  svg += `<polyline points="550,30 620,30 620,60" fill="none" stroke="${color}" stroke-width="${sw}"/>`;
  svg += `<rect x="618" y="28" width="5" height="5" fill="${color}" rx="1"/>`;

  // Top-right area
  svg += `<polyline points="750,20 750,50 810,50 810,35" fill="none" stroke="${color}" stroke-width="${sw}"/>`;
  svg += `<rect x="808" y="33" width="5" height="5" fill="${color}" rx="1"/>`;

  svg += `<polyline points="900,40 960,40 960,15 1020,15" fill="none" stroke="${color}" stroke-width="${sw}"/>`;
  svg += `<rect x="958" y="13" width="5" height="5" fill="${color}" rx="1"/>`;

  svg += `<polyline points="1060,50 1100,50 1100,25" fill="none" stroke="${color}" stroke-width="${sw}"/>`;
  svg += `<rect x="1098" y="23" width="5" height="5" fill="${color}" rx="1"/>`;

  // Mid area subtle connectors
  svg += `<polyline points="350,70 400,70 400,90" fill="none" stroke="${color}" stroke-width="${sw}"/>`;
  svg += `<polyline points="700,65 700,85 740,85" fill="none" stroke="${color}" stroke-width="${sw}"/>`;
  svg += `<rect x="738" y="83" width="4" height="4" fill="${color}" rx="1"/>`;

  return svg;
}

function generateSVG() {
  const stars = generateStars(90);
  const skyline = generateSkyline();
  const schedule = generateScheduleTable();
  const logoDataUri = loadLogoBase64();
  const decoLines = generateDecoLines();

  const font = "'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Noto Sans JP', sans-serif";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <defs>
    <linearGradient id="bgGradient" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#1e3a5f"/>
      <stop offset="30%" stop-color="#2a4a6e"/>
      <stop offset="55%" stop-color="#4a6a8a"/>
      <stop offset="78%" stop-color="#d4886a"/>
      <stop offset="100%" stop-color="#e8a87c"/>
    </linearGradient>
    <linearGradient id="shootingStar" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="white" stop-opacity="0"/>
      <stop offset="80%" stop-color="white" stop-opacity="0.6"/>
      <stop offset="100%" stop-color="white" stop-opacity="0.9"/>
    </linearGradient>
    <!-- White glow filter: strong intensity, narrow spread -->
    <filter id="whiteGlow" x="-5%" y="-20%" width="110%" height="140%">
      <feGaussianBlur in="SourceGraphic" stdDeviation="4 6" result="blur"/>
      <feColorMatrix in="blur" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 1.8 0" result="whiteBlur"/>
      <feMerge>
        <feMergeNode in="whiteBlur"/>
        <feMergeNode in="whiteBlur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
    <!-- Same glow for logo -->
    <filter id="logoGlow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur in="SourceGraphic" stdDeviation="5 7" result="blur"/>
      <feColorMatrix in="blur" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 1.6 0" result="whiteBlur"/>
      <feMerge>
        <feMergeNode in="whiteBlur"/>
        <feMergeNode in="whiteBlur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>

  <!-- Background gradient -->
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bgGradient)"/>

  <!-- Subtle radial glow -->
  <circle cx="900" cy="100" r="400" fill="rgba(230, 126, 34, 0.08)"/>
  <circle cx="200" cy="500" r="300" fill="rgba(255, 180, 120, 0.1)"/>

  <!-- Stars -->
  ${stars}

  <!-- Shooting star -->
  <line x1="340" y1="35" x2="440" y2="115" stroke="url(#shootingStar)" stroke-width="1.5"/>
  <circle cx="440" cy="115" r="2" fill="white" opacity="0.8"/>
  <line x1="820" y1="75" x2="880" y2="120" stroke="url(#shootingStar)" stroke-width="1.2"/>
  <circle cx="880" cy="120" r="1.5" fill="white" opacity="0.6"/>

  <!-- Geometric decorative lines -->
  ${decoLines}

  <!-- City skyline -->
  ${skyline}

  <!-- Logo (PNG) with white glow -->
  <image href="${logoDataUri}" x="10" y="55" width="160" height="160" filter="url(#logoGlow)"/>

  <!-- Title: navy text with white glow -->
  <text x="190" y="175" font-family="${font}" font-size="72" font-weight="800" fill="#1e3a5f" letter-spacing="4" filter="url(#whiteGlow)">勾当台夕方内科クリニック</text>

  <!-- Subtitle -->
  <text font-family="${font}" font-size="26" font-weight="400" fill="rgba(255,255,255,0.9)" letter-spacing="2">
    <tspan x="60" y="295">お仕事帰りや夕方のお時間に</tspan>
    <tspan x="60" dy="40">気軽に受診できるクリニック。</tspan>
  </text>

  <!-- Schedule table -->
  ${schedule}
</svg>`;
}

async function main() {
  const svg = generateSVG();
  const outputPath = join(__dirname, "..", "public", "og-image.png");

  await sharp(Buffer.from(svg))
    .png({ quality: 95, compressionLevel: 9 })
    .toFile(outputPath);

  const stats = await sharp(outputPath).metadata();
  console.log(`OG image generated: ${outputPath}`);
  console.log(`Size: ${stats.width}x${stats.height}`);
}

main().catch(console.error);
