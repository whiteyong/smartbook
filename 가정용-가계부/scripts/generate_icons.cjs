const fs = require('fs');
const path = require('path');

const iconsDir = path.join(__dirname, '..', 'public', 'icons');
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

const content = fs.readFileSync(path.join(__dirname, '..', 'src', 'data', 'uploadedIcons.ts'), 'utf8');
const regex = /fileName:\s*['"]([^'"]+)['"][\s\S]*?svg:\s*`([\s\S]*?)`/g;
let match;
let count = 0;
while ((match = regex.exec(content)) !== null) {
  const fileName = match[1];
  const svg = match[2];
  fs.writeFileSync(path.join(iconsDir, fileName), svg.trim(), 'utf8');
  count++;
}
console.log(`Generated ${count} SVG files in ${iconsDir}`);
