const fs = require('fs');
let text = fs.readFileSync('src/pages/Player.tsx', 'utf8');

const regex = /\/\/[^\n]*/g;
text = text.replace(regex, '\n');

fs.writeFileSync('src/pages/Player.tsx', text);
