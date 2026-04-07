const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '../data');
const plantsFile = path.join(dataDir, 'plants.json');
if (!fs.existsSync(plantsFile)) process.exit(1);

const plants = JSON.parse(fs.readFileSync(plantsFile, 'utf8'));

for (let p of plants) {
    const dbPath = path.join(dataDir, `${p.id}.db`);
    if(!fs.existsSync(dbPath)) continue;

    const db = new Database(dbPath);
    console.log(`Seeding warranties for ${p.label}...`);
    
    try {
        const hasAsset = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='Asset'").get();
        if(!hasAsset) continue;
        
        const cols = db.prepare('PRAGMA table_info(Asset)').all();
        if(!cols.find(c => c.name === 'WarrantyEnd')) {
             db.exec('ALTER TABLE Asset ADD COLUMN WarrantyStart TEXT');
             db.exec('ALTER TABLE Asset ADD COLUMN WarrantyEnd TEXT');
             db.exec('ALTER TABLE Asset ADD COLUMN WarrantyVendor TEXT');
        }

        const assets = db.prepare('SELECT ID FROM Asset').all();
        const vendors = ['Siemens', 'Allen-Bradley', 'Rockwell Automation', 'GE', 'ABB', 'Schneider Electric'];
        const updateAsset = db.prepare('UPDATE Asset SET WarrantyStart = ?, WarrantyEnd = ?, WarrantyVendor = ? WHERE ID = ?');

        db.exec('BEGIN TRANSACTION;');
        
        let i = 0;
        for (let ast of assets) {
            let start = null, end = null, vendor = null;
            const now = new Date();
            
            // 40% active (1-5 years left)
            if (i % 10 < 4) {
               start = new Date(now.getTime() - (Math.random() * 365 * 24 * 3600 * 1000)).toISOString().split('T')[0];
               end = new Date(now.getTime() + (100 + Math.random() * 1400) * 24 * 3600 * 1000).toISOString().split('T')[0];
               vendor = vendors[Math.floor(Math.random() * vendors.length)];
            } 
            // 20% expiring in within 90 days
            else if (i % 10 < 6) {
               start = new Date(now.getTime() - (Math.random() * 1000 * 24 * 3600 * 1000)).toISOString().split('T')[0];
               end = new Date(now.getTime() + (Math.random() * 85) * 24 * 3600 * 1000).toISOString().split('T')[0];
               vendor = vendors[Math.floor(Math.random() * vendors.length)];
            }
            // 10% expired
            else if (i % 10 < 7) {
               start = new Date(now.getTime() - (3000 * 24 * 3600 * 1000)).toISOString().split('T')[0];
               end = new Date(now.getTime() - (Math.random() * 500) * 24 * 3600 * 1000).toISOString().split('T')[0];
               vendor = vendors[Math.floor(Math.random() * vendors.length)];
            }
            // 30% no warranty
            
            updateAsset.run(start, end, vendor, ast.ID);
            i++;
        }
        
        db.exec('COMMIT');

        // Let's seed WarrantyClaims correctly
        db.exec(`
            CREATE TABLE IF NOT EXISTS WarrantyClaims (
                ID INTEGER PRIMARY KEY AUTOINCREMENT,
                AssetID TEXT,
                AssetDescription TEXT,
                PartID TEXT,
                WorkOrderID INTEGER,
                WorkOrderNumber TEXT,
                VendorName TEXT,
                ClaimDate TEXT,
                ClaimAmount REAL,
                AmountRecovered REAL,
                Description TEXT,
                Status TEXT,
                Notes TEXT,
                ClaimReference TEXT,
                SubmittedBy TEXT,
                StatusUpdatedAt TEXT,
                StatusUpdatedBy TEXT,
                CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                UpdatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        db.exec('DELETE FROM WarrantyClaims');
        
        const wos = db.prepare(`
            SELECT w.ID as woId, w.WorkOrderNumber, w.Description as woDesc, w.AstID, a.Description as assetDesc, w.CompDate, a.WarrantyVendor, COALESCE(w.ActualHours, 0) * 45.0 as laborCost, 0 as materialCost
            FROM Work w JOIN Asset a ON w.AstID = a.ID
            WHERE w.CompDate IS NOT NULL AND a.WarrantyEnd IS NOT NULL AND w.CompDate <= a.WarrantyEnd
            LIMIT 60
        `).all();
        
        const insClaim = db.prepare(`
            INSERT INTO WarrantyClaims (AssetID, AssetDescription, WorkOrderID, WorkOrderNumber, VendorName, ClaimDate, ClaimAmount, AmountRecovered, Status, Notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        db.exec('BEGIN TRANSACTION;');
        const statuses = ['Submitted', 'Acknowledged', 'Approved', 'Denied', 'Reimbursed', 'Reimbursed', 'Reimbursed']; // Bias toward successful reimbursement 
        
        for (let wo of wos) {
            let totalCost = wo.laborCost + wo.materialCost;
            if (totalCost < 100) totalCost = 1500 + Math.random() * 5000;
            
            let status = statuses[Math.floor(Math.random() * statuses.length)];
            let recovered = (status === 'Reimbursed') ? totalCost * (0.8 + Math.random() * 0.2) : 0;
            
            insClaim.run(wo.AstID, wo.assetDesc, wo.woId, wo.WorkOrderNumber, wo.WarrantyVendor, wo.CompDate, totalCost, recovered, status, "Seeded warranty claim for component failure");
        }
        db.exec('COMMIT;');
        
        db.close();

    } catch (e) {
        if(db.inTransaction) db.exec('ROLLBACK;');
        console.error(e.message);
    }
}
console.log('Warranty seeding complete.');
