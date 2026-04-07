const fs = require('fs');
const path = require('path');

function walk(dir, fileList = []) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const stat = fs.statSync(path.join(dir, file));
        if (stat.isDirectory() && file !== 'node_modules' && !file.startsWith('.')) {
            walk(path.join(dir, file), fileList);
        } else if (file.endsWith('.js') || file.endsWith('.sql')) {
            fileList.push(path.join(dir, file));
        }
    }
    return fileList;
}

const files = walk('g:/Trier OS/server');

const queriedTables = new Set();
const createdTables = new Set();

const tableRegexes = [
    /FROM\s+([a-zA-Z0-9_]+)/gi,
    /JOIN\s+([a-zA-Z0-9_]+)/gi,
    /INTO\s+([a-zA-Z0-9_]+)/gi,
    /UPDATE\s+([a-zA-Z0-9_]+)/gi
];

const createRegex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-zA-Z0-9_]+)/gi;

for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    
    let match;
    while ((match = createRegex.exec(content)) !== null) {
        createdTables.add(match[1].toLowerCase());
    }
    
    for (const reg of tableRegexes) {
        let m;
        while ((m = reg.exec(content)) !== null) {
            queriedTables.add(m[1].toLowerCase());
        }
    }
}

// Additional legacy plant tables that exist inside schema_template.db schema_template
// We can parse schema_template.db directly
const Database = require('better-sqlite3');
const dbPath = 'g:/Trier OS/data/schema_template.db';
if (fs.existsSync(dbPath)) {
    const db = new Database(dbPath, { readonly: true });
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    for (const t of tables) {
        createdTables.add(t.name.toLowerCase());
    }
    db.close();
}

const missing = [];
for (const t of queriedTables) {
    if (!createdTables.has(t)) {
        // Filter out sqlite internal tables and common keywords
        if (!t.startsWith('sqlite_') && t !== 'select' && t !== 'where' && t !== 'set') {
            missing.push(t);
        }
    }
}

console.log('Potentially Missing Tables:', Array.from(new Set(missing)).sort().join(', '));
