'use strict';
const fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '../..'), dest = path.join(root, 'functions-staging-payment-certification');
fs.mkdirSync(dest, {recursive: true});
const seen = new Set();
function copy(file) {
  if (seen.has(file)) return; seen.add(file);
  const text = fs.readFileSync(path.join(root, 'functions', file), 'utf8');
  fs.writeFileSync(path.join(dest, file === 'staging_payment_certification_entry.js' ? 'index.js' : file), text);
  for (const match of text.matchAll(/require\(['"](\.\/[^'"]+)['"]\)/g)) {
    const dep = path.posix.normalize(path.posix.join(path.posix.dirname(file), match[1]));
    copy(path.extname(dep) ? dep : dep + '.js');
  }
}
copy('staging_payment_certification_entry.js');
for (const name of ['package.json','package-lock.json']) fs.copyFileSync(path.join(root,'functions',name), path.join(dest,name));
console.log(`Prepared staging-only entry with ${seen.size} exact maintained source modules.`);
