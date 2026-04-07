const db = require('better-sqlite3')('g:\\Trier OS\\data\\Demo_Plant_1.db');
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(t=>t.name);
console.log('Tables:', tables);
try {
console.log('Part columns:', db.prepare("PRAGMA table_info('Part')").all().map(c=>c.name));
} catch(e) { console.error(e); }
try {
console.log('WorkParts columns:', db.prepare("PRAGMA table_info('WorkParts')").all().map(c=>c.name));
} catch(e) { console.error(e); }
