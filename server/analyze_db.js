const Database = require('better-sqlite3');
const fs = require('fs');
const db = new Database('g:/Trier OS/data/Demo_Plant_1.db', { readonly: true });
const tables = db.prepare(\"SELECT name FROM sqlite_master WHERE type='table'\").all();
let out = '';
for (let t of tables) {
    const info = db.prepare('PRAGMA table_info(' + t.name + ')').all();
    const count = db.prepare('SELECT COUNT(*) as c FROM ' + t.name).get().c;
    out += '[' + t.name + '] (' + count + ' rows)\n';
    out += '  Columns: ' + info.map(i => i.name).join(', ') + '\n';
}
fs.writeFileSync('g:/Trier OS/data/schema_db.txt', out);
