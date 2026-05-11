const fs = require("fs");
const path = require("path");
const dirs = [
  path.join(__dirname, "src", "pages"),
  path.join(__dirname, "src", "components")
];
const patterns = [
  /\bshadow-sm\b/g,
  /\bshadow-md\b/g,
  /\bshadow-lg\b/g,
  /\bshadow-xl\b/g,
  /\bshadow-2xl\b/g,
  /\bshadow-blue-500\/[0-9]+\b/g,
  /\bshadow-blue-600\/[0-9]+\b/g,
  /\bshadow-fuchsia-500\/[0-9]+\b/g,
  /\bshadow-slate-200\/[0-9]+\b/g
];
function processDir(dir) {
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      processDir(filePath);
    } else if (file.endsWith(".tsx") || file.endsWith(".ts")) {
      let content = fs.readFileSync(filePath, "utf8");
      let changed = false;
      for (const pattern of patterns) {
        if (pattern.test(content)) {
          content = content.replace(pattern, "");
          changed = true;
        }
      }
      if (changed) {
        content = content.replace(/\s{2,}/g, " ");
        fs.writeFileSync(filePath, content, "utf8");
        console.log(`Updated shadows in: ${filePath}`);
      }
    }
  }
}
dirs.forEach(processDir);
console.log("Shadow removal complete.");
