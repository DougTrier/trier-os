// Copyright © 2026 Trier OS. All Rights Reserved.

const path = require('path');
const dbPath = path.join(__dirname, '..', 'data', 'trier_logistics.db');
const Database = require('better-sqlite3');
const db = new Database(dbPath);

console.log('Seeding LOTO data into trier_logistics.db...');

try {
    db.exec(`
        CREATE TABLE IF NOT EXISTS LotoPermits (
            ID INTEGER PRIMARY KEY AUTOINCREMENT,
            PermitNumber TEXT UNIQUE NOT NULL,
            PlantID TEXT NOT NULL,
            AssetID TEXT,
            AssetDescription TEXT,
            WorkOrderID TEXT,
            Description TEXT NOT NULL,
            IssuedBy TEXT NOT NULL,
            IssuedAt TEXT NOT NULL DEFAULT (datetime('now')),
            PermitType TEXT DEFAULT 'LOTO',
            Status TEXT DEFAULT 'ACTIVE',
            ExpiresAt TEXT,
            ClosedBy TEXT,
            ClosedAt TEXT,
            VoidedBy TEXT,
            VoidedAt TEXT,
            VoidReason TEXT,
            Notes TEXT,
            HazardousEnergy TEXT DEFAULT 'Electrical',
            IsolationMethod TEXT
        );
        CREATE TABLE IF NOT EXISTS LotoIsolationPoints (
            ID INTEGER PRIMARY KEY AUTOINCREMENT,
            PermitID INTEGER NOT NULL,
            PointNumber INTEGER NOT NULL,
            EnergyType TEXT NOT NULL,
            Location TEXT NOT NULL,
            IsolationDevice TEXT,
            LockNumber TEXT,
            TagNumber TEXT,
            VerifiedBy TEXT,
            VerifiedAt TEXT,
            ReleasedBy TEXT,
            ReleasedAt TEXT,
            Status TEXT DEFAULT 'LOCKED',
            FOREIGN KEY (PermitID) REFERENCES LotoPermits(ID)
        );
        CREATE TABLE IF NOT EXISTS LotoSignatures (
            ID INTEGER PRIMARY KEY AUTOINCREMENT,
            PermitID INTEGER NOT NULL,
            SignatureType TEXT NOT NULL,
            SignedBy TEXT NOT NULL,
            SignedAt TEXT NOT NULL DEFAULT (datetime('now')),
            Role TEXT,
            FOREIGN KEY (PermitID) REFERENCES LotoPermits(ID)
        );
        CREATE TABLE IF NOT EXISTS LotoAuditLog (
            ID INTEGER PRIMARY KEY AUTOINCREMENT,
            PermitID INTEGER,
            Action TEXT NOT NULL,
            PerformedBy TEXT NOT NULL,
            PerformedAt TEXT NOT NULL DEFAULT (datetime('now')),
            Details TEXT,
            FOREIGN KEY (PermitID) REFERENCES LotoPermits(ID)
        );
        DELETE FROM LotoAuditLog;
        DELETE FROM LotoSignatures;
        DELETE FROM LotoIsolationPoints;
        DELETE FROM LotoPermits;
    `);

    // Basic arrays
    const plantsArr = ['Plant_1', 'Plant_2', 'Corporate', 'examples'];
    const assets = ['AST00010', 'AST00025', 'AST00050', 'AST00075', 'AST00080', 'AST00110'];
    const workers = ['Maint_Bob', 'Tech_Sally', 'Elec_Mike', 'Operator_Dave', 'Safety_Sam'];
    const energies = ['Electrical', 'Pneumatic', 'Hydraulic', 'Mechanical', 'Thermal'];
    
    // We need 25 months history (approx 760 days).
    const now = new Date();
    
    const insertPermit = db.prepare(`
        INSERT INTO LotoPermits (PermitNumber, PlantID, AssetID, AssetDescription, Description, IssuedBy, IssuedAt, PermitType, Status, ExpiresAt, ClosedBy, ClosedAt, HazardousEnergy)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertPoint = db.prepare(`
        INSERT INTO LotoIsolationPoints (PermitID, PointNumber, EnergyType, Location, IsolationDevice, LockNumber, TagNumber, VerifiedBy, VerifiedAt, ReleasedBy, ReleasedAt, Status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertSig = db.prepare(`
        INSERT INTO LotoSignatures (PermitID, SignatureType, SignedBy, SignedAt, Role)
        VALUES (?, ?, ?, ?, ?)
    `);
    const insertLog = db.prepare(`
        INSERT INTO LotoAuditLog (PermitID, Action, PerformedBy, PerformedAt, Details)
        VALUES (?, ?, ?, ?, ?)
    `);

    db.exec('BEGIN TRANSACTION;');
    
    let permitsInjected = 0;
    
    // Generate 3000 historical permits across the last 760 days (25 months)
    for (let i = 0; i < 3000; i++) {
        const plantId = plantsArr[Math.floor(Math.random() * plantsArr.length)];
        const assetId = assets[Math.floor(Math.random() * assets.length)];
        const worker = workers[Math.floor(Math.random() * workers.length)];
        const energy = energies[Math.floor(Math.random() * energies.length)];
        
        // Random days ago from 0 to 760
        const daysAgo = Math.floor(Math.random() * 760);
        const issueDate = new Date(now.getTime() - (daysAgo * 24 * 60 * 60 * 1000) - (Math.random() * 12 * 60 * 60 * 1000));
        
        // Duration between 2 and 48 hours for expiration timer
        const durationHours = 2 + Math.floor(Math.random() * 46);
        const expiresDate = new Date(issueDate.getTime() + (durationHours * 60 * 60 * 1000));
        
        // 95% of past permits are closed, 1% void, 4% active (if very recent)
        let status = 'CLOSED';
        if (daysAgo < 3 && Math.random() < 0.2) status = 'ACTIVE';
        if (Math.random() < 0.01) status = 'VOIDED';

        let closeDate = null;
        if (status === 'CLOSED') {
            const actualDuration = 0.5 + (Math.random() * durationHours * 0.8);
            closeDate = new Date(issueDate.getTime() + (actualDuration * 60 * 60 * 1000));
        } else if (status === 'VOIDED') {
            closeDate = new Date(issueDate.getTime() + (0.5 * 60 * 60 * 1000));
        }
        
        // Ensure no duplicate permit numbers (using index to salt the randomness)
        const permitString = `LOTO-${plantId.substring(0,3).toUpperCase()}-${String(issueDate.getFullYear()).slice(-2)}${String(issueDate.getMonth()+1).padStart(2,'0')}${String(issueDate.getDate()).padStart(2,'0')}-${String(i).padStart(4,'0')}`;

        const resPer = insertPermit.run(
            permitString,
            plantId,
            assetId,
            `Industrial Machine ${assetId}`,
            `Routine maintenance isolation - Engine room`,
            worker,
            issueDate.toISOString(),
            'LOTO',
            status,
            expiresDate.toISOString(),
            status === 'CLOSED' ? worker : null,
            status === 'CLOSED' ? closeDate.toISOString() : (status === 'VOIDED' ? closeDate.toISOString() : null), // In this schema, VoidAt isn't param'd here directly but ClosedAt acts as placeholder if needed, actually let's leave it null for Voided to keep logical consistency
            energy
        );
        
        const permitId = resPer.lastInsertRowid;
        
        if (status === 'VOIDED') {
            db.prepare('UPDATE LotoPermits SET VoidedBy = ?, VoidedAt = ?, VoidReason = ? WHERE ID = ?')
              .run(worker, closeDate.toISOString(), 'Administrative override - Duplicate', permitId);
        }
        
        const numPoints = 1 + Math.floor(Math.random() * 3);
        for(let p=1; p<=numPoints; p++) {
            insertPoint.run(
                permitId, p, energy, `Main Breaker Panel - Drop ${p}`, 'Padlock', `LK-${Math.floor(Math.random()*9999)}`, `TG-${Math.floor(Math.random()*9999)}`,
                worker, issueDate.toISOString(),
                status === 'CLOSED' ? worker : null, status === 'CLOSED' ? closeDate.toISOString() : null,
                status === 'CLOSED' ? 'RELEASED' : 'LOCKED'
            );
        }
        
        // Signatures
        insertSig.run(permitId, 'ISSUER', worker, issueDate.toISOString(), 'Authorized Person');
        if (status === 'CLOSED') {
             insertSig.run(permitId, 'CLOSER', worker, closeDate.toISOString(), 'Authorized Person');
        }
        
        // Log
        insertLog.run(permitId, 'CREATED', worker, issueDate.toISOString(), `Permit ${permitString} issued`);
        if (status === 'CLOSED') {
             insertLog.run(permitId, 'CLOSED', worker, closeDate.toISOString(), `Permit ${permitString} closed`);
        } else if (status === 'VOIDED') {
             insertLog.run(permitId, 'VOIDED', worker, closeDate.toISOString(), `Permit ${permitString} voided`);
        }
        
        permitsInjected++;
    }
    
    db.exec('COMMIT;');
    console.log(`✅ LOTO data seeded: ${permitsInjected} historical permits generated.`);
} catch(e) {
    if (db.inTransaction) db.exec('ROLLBACK;');
    console.error('Error seeding LOTO data:', e);
} finally {
    db.close();
}
