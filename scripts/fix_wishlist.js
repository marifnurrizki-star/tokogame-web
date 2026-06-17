const fs = require('fs');
const p = 'public/js/app.js';
let s = fs.readFileSync(p, 'utf8');
let ns = s.replace(/font-medi`?um/g, 'font-medium');
if (s === ns) console.log('nochange'); else { fs.writeFileSync(p, ns, 'utf8'); console.log('fixed'); }
