const fs = require('fs');
const path = require('path');

const pagesDir = path.join(__dirname, 'src', 'pages');

const files = fs.readdirSync(pagesDir).filter(f => f.endsWith('.tsx'));

for (const file of files) {
  const filePath = path.join(pagesDir, file);
  let content = fs.readFileSync(filePath, 'utf8');
  content = content.replace(/font-black/g, 'font-bold');
  fs.writeFileSync(filePath, content, 'utf8');
}

console.log('Replaced font-black with font-bold in all page files.');
