import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

async function generate() {
  const publicDir = path.join(process.cwd(), 'public');
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }

  // Fetch Jalnan font to embed as base64 in SVG for pixel-perfect standalone rendering
  const fontRes = await fetch('https://fastly.jsdelivr.net/gh/projectnoonnu/noonfonts_four@1.2/JalnanOTF00.woff');
  const fontBuffer = await fontRes.arrayBuffer();
  const fontBase64 = Buffer.from(fontBuffer).toString('base64');

  // Exact reproduction of the logo in the user's image:
  // - Top line: "슬기로운"
  // - Bottom line: "가계생활." with rounded olive dot (#829F38)
  // - Color: Deep pine/forest dark green (#1D3B2B)
  // - Left aligned: '슬' and '가' start at x=0
  // - Tight vertical gap between lines
  const svgContent = `<svg width="560" height="280" viewBox="0 0 560 280" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <style>
      @font-face {
        font-family: 'Jalnan';
        src: url('data:font/woff;charset=utf-8;base64,${fontBase64}') format('woff');
        font-weight: 900;
        font-style: normal;
      }
      .logo-text {
        font-family: 'Jalnan', sans-serif;
        font-weight: 900;
        fill: #1D3B2B;
        letter-spacing: -0.04em;
      }
    </style>
  </defs>
  
  <rect width="100%" height="100%" fill="none"/>

  <!-- Logo Content Group -->
  <g transform="translate(60, 30)">
    <!-- Line 1: 슬기로운 -->
    <text x="0" y="96" class="logo-text" font-size="102" text-anchor="start">슬기로운</text>
    
    <!-- Line 2: 가계생활 and Dot -->
    <g transform="translate(0, 115)">
      <text x="0" y="96" class="logo-text" font-size="102" text-anchor="start">가계생활</text>
      <!-- Olive green rounded period dot -->
      <rect x="382" y="72" width="22" height="22" rx="4.5" fill="#829F38"/>
    </g>
  </g>
</svg>`;

  // Save SVG
  fs.writeFileSync(path.join(publicDir, 'Login-selection.svg'), svgContent);

  // Convert to PNG with crisp DPI
  await sharp(Buffer.from(svgContent))
    .png()
    .toFile(path.join(publicDir, 'Login-selection.png'));

  console.log('Login-selection.png with Jalnan font generated successfully!');
}

generate().catch(console.error);
