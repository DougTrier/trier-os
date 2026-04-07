const Database = require('better-sqlite3');
const db1 = new Database('g:/Trier OS/data/Demo_Plant_1.db');
db1.exec("ATTACH DATABASE 'g:/Trier OS/data/Plant_2.db' AS plant2;");
db1.exec("INSERT OR IGNORE INTO Asset SELECT * FROM plant2.Asset;");
db1.exec("INSERT OR IGNORE INTO Part SELECT * FROM plant2.Part;");
db1.exec("DETACH DATABASE plant2;");
console.log("Copied Assets and Parts to Demo_Plant_1");
