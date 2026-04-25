'use strict';
const Database = require('better-sqlite3');
const db = new Database('data/mfg_master.db', { readonly: true });

const total    = db.prepare("SELECT COUNT(*) as c FROM MasterParts").get().c;
const hasDesc  = db.prepare("SELECT COUNT(*) as c FROM MasterParts WHERE length(Description) >= 20").get().c;
const short    = db.prepare("SELECT COUNT(*) as c FROM MasterParts WHERE length(Description) < 20").get().c;
const empty    = db.prepare("SELECT COUNT(*) as c FROM MasterParts WHERE Description IS NULL OR Description = ''").get().c;

console.log('Total parts:        ' + total.toLocaleString());
console.log('Good (>=20 chars):  ' + hasDesc.toLocaleString() + '  (' + (hasDesc/total*100).toFixed(1) + '%)');
console.log('Short (<20 chars):  ' + short.toLocaleString()   + '  (' + (short/total*100).toFixed(1) + '%)');
console.log('Empty/null:         ' + empty.toLocaleString()   + '  (' + (empty/total*100).toFixed(1) + '%)');

console.log('\n--- By Manufacturer (top 20 by volume) ---');
const rows = db.prepare(`
  SELECT Manufacturer,
    COUNT(*) as total,
    SUM(CASE WHEN length(Description) >= 20 THEN 1 ELSE 0 END) as good,
    SUM(CASE WHEN length(Description) < 20  THEN 1 ELSE 0 END) as short
  FROM MasterParts
  GROUP BY Manufacturer
  ORDER BY total DESC
  LIMIT 20
`).all();

for (const r of rows) {
  const pct  = (r.good / r.total * 100).toFixed(0);
  const name = (r.Manufacturer || '(none)').padEnd(26);
  const tot  = r.total.toLocaleString().padStart(8);
  const s    = r.short.toLocaleString().padStart(7);
  console.log(name + tot + '  |  ' + String(pct + '%').padStart(5) + ' good  |  ' + s + ' short');
}
db.close();
