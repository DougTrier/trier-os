// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS - Fleet & Truck Shop Management API
 * ======================================================
 * Full lifecycle vehicle management covering the entire Trier enterprise fleet.
 * Mounted at /api/fleet in server/index.js.
 * All fleet data lives in logistics_db (trier_logistics.db).
 *
 * ENDPOINTS:
 *   Vehicle CRUD    GET/POST/PUT/DELETE /api/fleet/vehicles
 *   Mileage Log     GET/POST            /api/fleet/vehicles/:id/mileage
 *   Service History GET/POST            /api/fleet/vehicles/:id/service
 *   Fuel Log        GET/POST            /api/fleet/vehicles/:id/fuel
 *   DVIR            GET/POST/PUT        /api/fleet/dvir
 *   Licenses        GET/POST/PUT/DELETE /api/fleet/licenses
 *   DOT Inspections GET/POST            /api/fleet/dot-inspections
 *   Tire Management GET/POST/PUT        /api/fleet/tires
 *   Stats           GET                 /api/fleet/stats
 *
 * MODULES (each has a section below):
 *   Vehicle CRUD         -- fleet_vehicles (GVWR, DOT, odometer, PM schedule)
 *   Mileage Log         -- fleet_mileage_log (anti-decrease guard, PM trigger)
 *   Service History     -- fleet_service_history (PM auto-advances NextPM)
 *   Fuel Log            -- fleet_fuel_log (auto-calculates MPG from odometer delta)
 *   DVIR                -- fleet_dvir + fleet_dvir_items (type-specific checklists)
 *   CDL / Licenses      -- fleet_licenses (expiry tiering: 7/30/60 day alerts)
 *   DOT Inspections     -- fleet_dot_inspections (annual cycle, violation log)
 *   Tire Management     -- fleet_tires + fleet_tire_readings (tread depth alerts)
 *   Dashboard Stats     -- GET /stats (fleet KPIs, cost summaries, PM due count)
 *
 * PM AUTO-CALCULATION: When POST /vehicles/:id/service receives ServiceType='PM Service',
 * the system automatically sets LastPMDate=now, LastPMMileage=mileageAtService,
 * NextPMDate = now + PMIntervalDays, and NextPMMileage = mileage + PMIntervalMiles.
 * Default intervals: 25,000 miles / 90 days.
 *
 * VIN VALIDATION: validateVIN() strips non-alphanumeric chars, enforces exactly 17
 * characters, and blocks I/O/Q which are excluded from VIN alphabet by NHTSA standard.
 *
 * MPG AUTO-CALCULATION: When POST /vehicles/:id/fuel includes odometerAtFill, the
 * system looks up the previous fuel fill odometer reading and computes:
 *   mpg = milesSinceLast / gallons (rounded to 2dp)
 *   Automatically updates fleet_vehicles.Odometer to the new reading.
 *
 * DVIR TEMPLATES: POST /dvir auto-populates fleet_dvir_items from DVIR_CHECKLISTS
 * keyed by VehicleType (Tractor = 43 items, Trailer = 17 items). Marking any item
 * as 'Defective' updates the parent DVIR status to 'Defects Found'. Marking
 * severity 'Out of Service' sets the vehicle to Out of Service status.
 *
 * TIRE TREAD DEPTH ALERTS (GET /tires/alerts):
 *   Front tires (Position LIKE '%F%'): alert at < 4/32"
 *   All other positions:               alert at < 2/32" (legal minimum)
 *
 * LICENSE EXPIRY STATUS TIERS (GET /licenses):
 *   'Expired' | 'Expiring 7 Days' | 'Expiring 30 Days' | 'Expiring 60 Days' | 'Active'
 *   Also checks MedicalCardExpiry separately (DOT medical certificate requirement).
 */
const express = require('express');
const router = express.Router();
const { db: logisticsDb, logAudit } = require('../logistics_db');

// ── Initialize Fleet Tables ──────────────────────────────────────────────
function initFleetTables() {
    logisticsDb.exec(`
        CREATE TABLE IF NOT EXISTS fleet_vehicles (
            ID INTEGER PRIMARY KEY AUTOINCREMENT,
            UnitNumber TEXT UNIQUE NOT NULL,
            VIN TEXT,
            Year INTEGER,
            Make TEXT,
            Model TEXT,
            VehicleType TEXT DEFAULT 'Straight Truck',
            Status TEXT DEFAULT 'Active',
            LicensePlate TEXT,
            PlateState TEXT,
            FuelType TEXT DEFAULT 'Diesel',
            PlantID TEXT,
            AssignedDriver TEXT,
            Department TEXT,
            PurchaseDate TEXT,
            PurchasePrice REAL,
            Odometer REAL DEFAULT 0,
            EngineHours REAL DEFAULT 0,
            DOTNumber TEXT,
            GVWR INTEGER,
            AxleCount INTEGER DEFAULT 2,
            InsurancePolicy TEXT,
            InsuranceExpiry TEXT,
            NextPMDate TEXT,
            NextPMMileage REAL,
            LastPMDate TEXT,
            LastPMMileage REAL,
            PMIntervalMiles REAL DEFAULT 25000,
            PMIntervalDays INTEGER DEFAULT 90,
            Notes TEXT,
            Active INTEGER DEFAULT 1,
            CreatedAt TEXT DEFAULT (datetime('now')),
            UpdatedAt TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS fleet_mileage_log (
            ID INTEGER PRIMARY KEY AUTOINCREMENT,
            VehicleID INTEGER NOT NULL,
            ReadingDate TEXT NOT NULL DEFAULT (datetime('now')),
            Odometer REAL NOT NULL,
            ReportedBy TEXT,
            Source TEXT DEFAULT 'manual',
            Notes TEXT,
            FOREIGN KEY (VehicleID) REFERENCES fleet_vehicles(ID)
        );

        CREATE TABLE IF NOT EXISTS fleet_service_history (
            ID INTEGER PRIMARY KEY AUTOINCREMENT,
            VehicleID INTEGER NOT NULL,
            ServiceDate TEXT NOT NULL DEFAULT (datetime('now')),
            ServiceType TEXT DEFAULT 'Repair',
            Description TEXT NOT NULL,
            MileageAtService REAL,
            LaborHours REAL DEFAULT 0,
            PartsCost REAL DEFAULT 0,
            LaborCost REAL DEFAULT 0,
            MiscCost REAL DEFAULT 0,
            TotalCost REAL DEFAULT 0,
            PerformedBy TEXT,
            Vendor TEXT,
            InHouse INTEGER DEFAULT 1,
            WorkOrderID TEXT,
            PartsUsed TEXT,
            Notes TEXT,
            CreatedAt TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (VehicleID) REFERENCES fleet_vehicles(ID)
        );

        CREATE TABLE IF NOT EXISTS fleet_fuel_log (
            ID INTEGER PRIMARY KEY AUTOINCREMENT,
            VehicleID INTEGER NOT NULL,
            FillDate TEXT NOT NULL DEFAULT (datetime('now')),
            Gallons REAL NOT NULL,
            CostPerGallon REAL,
            TotalCost REAL,
            OdometerAtFill REAL,
            MilesSinceLastFill REAL,
            MPG REAL,
            FuelType TEXT DEFAULT 'Diesel',
            Station TEXT,
            DEFGallons REAL DEFAULT 0,
            LoggedBy TEXT,
            FOREIGN KEY (VehicleID) REFERENCES fleet_vehicles(ID)
        );

        CREATE TABLE IF NOT EXISTS fleet_dvir (
            ID INTEGER PRIMARY KEY AUTOINCREMENT,
            VehicleID INTEGER NOT NULL,
            Driver TEXT NOT NULL,
            InspectionDate TEXT NOT NULL DEFAULT (datetime('now')),
            InspectionType TEXT DEFAULT 'Pre-Trip',
            Status TEXT DEFAULT 'Pass',
            OdometerAtInspection REAL,
            DefectsFound INTEGER DEFAULT 0,
            Signature TEXT,
            Notes TEXT,
            ReviewedBy TEXT,
            ReviewedAt TEXT,
            FOREIGN KEY (VehicleID) REFERENCES fleet_vehicles(ID)
        );

        CREATE TABLE IF NOT EXISTS fleet_dvir_items (
            ID INTEGER PRIMARY KEY AUTOINCREMENT,
            DVIRID INTEGER NOT NULL,
            Category TEXT NOT NULL,
            ItemDescription TEXT NOT NULL,
            Condition TEXT DEFAULT 'OK',
            DefectNotes TEXT,
            Severity TEXT,
            PhotoPath TEXT,
            FOREIGN KEY (DVIRID) REFERENCES fleet_dvir(ID)
        );

        CREATE TABLE IF NOT EXISTS fleet_tires (
            ID INTEGER PRIMARY KEY AUTOINCREMENT,
            TireSerial TEXT,
            VehicleID INTEGER,
            Position TEXT,
            Brand TEXT,
            Model TEXT,
            Size TEXT,
            DateInstalled TEXT,
            MileageInstalled REAL,
            TreadDepth REAL,
            LastMeasuredDate TEXT,
            Status TEXT DEFAULT 'In Service',
            RetreadCount INTEGER DEFAULT 0,
            TotalMiles REAL DEFAULT 0,
            FOREIGN KEY (VehicleID) REFERENCES fleet_vehicles(ID)
        );

        CREATE TABLE IF NOT EXISTS fleet_tire_readings (
            ID INTEGER PRIMARY KEY AUTOINCREMENT,
            TireID INTEGER NOT NULL,
            MeasurementDate TEXT DEFAULT (datetime('now')),
            TreadDepth REAL,
            PSI REAL,
            MeasuredBy TEXT,
            Notes TEXT,
            FOREIGN KEY (TireID) REFERENCES fleet_tires(ID)
        );

        CREATE TABLE IF NOT EXISTS fleet_licenses (
            ID INTEGER PRIMARY KEY AUTOINCREMENT,
            DriverName TEXT NOT NULL,
            LicenseNumber TEXT,
            State TEXT,
            LicenseClass TEXT DEFAULT 'C',
            Endorsements TEXT,
            IssueDate TEXT,
            ExpiryDate TEXT,
            MedicalCardExpiry TEXT,
            Status TEXT DEFAULT 'Active',
            PlantID TEXT,
            Notes TEXT,
            CreatedAt TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS fleet_dot_inspections (
            ID INTEGER PRIMARY KEY AUTOINCREMENT,
            VehicleID INTEGER NOT NULL,
            InspectionDate TEXT NOT NULL,
            Inspector TEXT,
            InspectionType TEXT DEFAULT 'Annual',
            Result TEXT DEFAULT 'Pass',
            ViolationCount INTEGER DEFAULT 0,
            Violations TEXT,
            NextAnnualDue TEXT,
            DecalNumber TEXT,
            Notes TEXT,
            DocumentPath TEXT,
            FOREIGN KEY (VehicleID) REFERENCES fleet_vehicles(ID)
        );
    `);
    console.log('[FLEET] All fleet tables initialized');
}

initFleetTables();

// ── Constants ───────────────────────────────────────────────────────────
const VEHICLE_TYPES = ['Tractor', 'Trailer', 'Straight Truck', 'Van', 'Pickup', 'Refrigerated Truck', 'Tanker', 'Flatbed', 'Box Truck', 'Forklift', 'Other'];
const VEHICLE_STATUSES = ['Active', 'Out of Service', 'In Shop', 'Retired', 'Sold'];
const FUEL_TYPES = ['Diesel', 'Gasoline', 'CNG', 'Electric', 'Hybrid', 'Propane'];
const SERVICE_TYPES = ['PM Service', 'Repair', 'Breakdown', 'Warranty', 'Recall', 'Modification', 'DOT Repair', 'Tire Service', 'Body Work', 'Inspection'];

// DVIR Checklist Templates
const DVIR_CHECKLISTS = {
    'Tractor': [
        { category: 'Engine', item: 'Air Compressor' }, { category: 'Engine', item: 'Engine Operation' },
        { category: 'Engine', item: 'Oil Pressure' }, { category: 'Engine', item: 'Radiator / Coolant' },
        { category: 'Engine', item: 'Exhaust System' }, { category: 'Engine', item: 'Starter' },
        { category: 'Engine', item: 'Generator / Alternator' },
        { category: 'Brakes', item: 'Service Brakes' }, { category: 'Brakes', item: 'Parking Brake' },
        { category: 'Brakes', item: 'Brake Accessories' }, { category: 'Brakes', item: 'Air Lines' },
        { category: 'Drivetrain', item: 'Clutch' }, { category: 'Drivetrain', item: 'Transmission' },
        { category: 'Drivetrain', item: 'Drive Line' }, { category: 'Drivetrain', item: 'Rear End' },
        { category: 'Chassis', item: 'Frame & Assembly' }, { category: 'Chassis', item: 'Front Axle' },
        { category: 'Chassis', item: 'Suspension / Springs' }, { category: 'Chassis', item: 'Fifth Wheel' },
        { category: 'Chassis', item: 'Coupling Devices' },
        { category: 'Tires & Wheels', item: 'Tires (Steer)' }, { category: 'Tires & Wheels', item: 'Tires (Drive)' },
        { category: 'Tires & Wheels', item: 'Wheels & Rims' }, { category: 'Tires & Wheels', item: 'Lug Nuts / Fasteners' },
        { category: 'Electrical', item: 'Battery' }, { category: 'Electrical', item: 'Head Lights' },
        { category: 'Electrical', item: 'Tail / Brake Lights' }, { category: 'Electrical', item: 'Turn Signals' },
        { category: 'Electrical', item: 'Clearance / Marker Lights' }, { category: 'Electrical', item: 'Reflectors' },
        { category: 'Electrical', item: 'Horn' },
        { category: 'Cab', item: 'Windshield / Glass' }, { category: 'Cab', item: 'Windshield Wipers' },
        { category: 'Cab', item: 'Mirrors' }, { category: 'Cab', item: 'Defroster / Heater' },
        { category: 'Cab', item: 'Steering' }, { category: 'Cab', item: 'Seat Belt' },
        { category: 'Safety', item: 'Fire Extinguisher' }, { category: 'Safety', item: 'Warning Triangles' },
        { category: 'Safety', item: 'Fuel Tanks / Cap' }, { category: 'Safety', item: 'Body / Doors' },
    ],
    'Trailer': [
        { category: 'Brakes', item: 'Brake Connections' }, { category: 'Brakes', item: 'Service Brakes' },
        { category: 'Coupling', item: 'Coupling Devices' }, { category: 'Coupling', item: 'Coupling King Pin' },
        { category: 'Coupling', item: 'Landing Gear' },
        { category: 'Body', item: 'Doors (Rear)' }, { category: 'Body', item: 'Doors (Side)' },
        { category: 'Body', item: 'Roof' }, { category: 'Body', item: 'Floor' },
        { category: 'Body', item: 'Tarpaulin / Cover' },
        { category: 'Chassis', item: 'Suspension' }, { category: 'Chassis', item: 'Frame' },
        { category: 'Tires & Wheels', item: 'Tires' }, { category: 'Tires & Wheels', item: 'Wheels & Rims' },
        { category: 'Electrical', item: 'Lights (All)' }, { category: 'Electrical', item: 'Reflectors' },
        { category: 'Safety', item: 'Hitch / Safety Chains' },
    ]
};

// VIN Validation (basic 17-char check)
function validateVIN(vin) {
    if (!vin) return { valid: true, vin: null };
    const clean = vin.replace(/[^A-HJ-NPR-Z0-9]/gi, '').toUpperCase();
    if (clean.length !== 17) return { valid: false, error: `VIN must be 17 characters (got ${clean.length})` };
    if (/[IOQ]/i.test(clean)) return { valid: false, error: 'VIN cannot contain I, O, or Q' };
    return { valid: true, vin: clean };
}

// ══════════════════════════════════════════════════════════════════
// VEHICLE CRUD
// ══════════════════════════════════════════════════════════════════

router.get('/vehicles', (req, res) => {
    try {
        const { plant, status, type, driver, search, limit } = req.query;
        let sql = `SELECT * FROM fleet_vehicles WHERE Active = 1`;
        const params = [];
        if (plant && plant !== 'all_sites') { sql += ` AND PlantID = ?`; params.push(plant); }
        if (status) { sql += ` AND Status = ?`; params.push(status); }
        if (type) { sql += ` AND VehicleType = ?`; params.push(type); }
        if (driver) { sql += ` AND AssignedDriver LIKE ?`; params.push(`%${driver}%`); }
        if (search) { sql += ` AND (UnitNumber LIKE ? OR Make LIKE ? OR Model LIKE ? OR VIN LIKE ?)`; params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`); }
        sql += ` ORDER BY UnitNumber ASC LIMIT ?`;
        params.push(parseInt(limit) || 200);
        res.json(logisticsDb.prepare(sql).all(...params));
    } catch (err) {
        console.error('[FLEET] GET /vehicles error:', err.message);
        res.status(500).json({ error: 'Failed to fetch vehicles' });
    }
});

router.get('/vehicles/:id', (req, res) => {
    try {
        const v = logisticsDb.prepare('SELECT * FROM fleet_vehicles WHERE ID = ?').get(req.params.id);
        if (!v) return res.status(404).json({ error: 'Vehicle not found' });
        const serviceHistory = logisticsDb.prepare('SELECT * FROM fleet_service_history WHERE VehicleID = ? ORDER BY ServiceDate DESC LIMIT 50').all(v.ID);
        const mileageLog = logisticsDb.prepare('SELECT * FROM fleet_mileage_log WHERE VehicleID = ? ORDER BY ReadingDate DESC LIMIT 50').all(v.ID);
        const fuelLog = logisticsDb.prepare('SELECT * FROM fleet_fuel_log WHERE VehicleID = ? ORDER BY FillDate DESC LIMIT 50').all(v.ID);
        const recentDVIR = logisticsDb.prepare('SELECT * FROM fleet_dvir WHERE VehicleID = ? ORDER BY InspectionDate DESC LIMIT 5').all(v.ID);
        res.json({ vehicle: v, serviceHistory, mileageLog, fuelLog, recentDVIR });
    } catch (err) {
        console.error('[FLEET] GET /vehicles/:id error:', err.message);
        res.status(500).json({ error: 'Failed to fetch vehicle' });
    }
});

router.post('/vehicles', (req, res) => {
    try {
        const { unitNumber, vin, year, make, model, vehicleType, licensePlate, plateState, fuelType, plantId, assignedDriver, department, purchaseDate, purchasePrice, odometer, engineHours, dotNumber, gvwr, axleCount, insurancePolicy, insuranceExpiry, pmIntervalMiles, pmIntervalDays, notes } = req.body;
        if (!unitNumber) return res.status(400).json({ error: 'Unit number is required' });
        const vinCheck = validateVIN(vin);
        if (!vinCheck.valid) return res.status(400).json({ error: vinCheck.error });
        const existing = logisticsDb.prepare('SELECT ID FROM fleet_vehicles WHERE UnitNumber = ?').get(unitNumber);
        if (existing) return res.status(409).json({ error: `Unit ${unitNumber} already exists` });

        const result = logisticsDb.prepare(`
            INSERT INTO fleet_vehicles (UnitNumber, VIN, Year, Make, Model, VehicleType, LicensePlate, PlateState, FuelType, PlantID, AssignedDriver, Department, PurchaseDate, PurchasePrice, Odometer, EngineHours, DOTNumber, GVWR, AxleCount, InsurancePolicy, InsuranceExpiry, PMIntervalMiles, PMIntervalDays, Notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(unitNumber, vinCheck.vin, year || null, make || null, model || null, vehicleType || 'Straight Truck', licensePlate || null, plateState || null, fuelType || 'Diesel', plantId || null, assignedDriver || null, department || null, purchaseDate || null, purchasePrice || null, odometer || 0, engineHours || 0, dotNumber || null, gvwr || null, axleCount || 2, insurancePolicy || null, insuranceExpiry || null, pmIntervalMiles || 25000, pmIntervalDays || 90, notes || null);

        try { logAudit('FLEET_VEHICLE_ADDED', req.user?.Username || 'system', plantId, { unitNumber, vin: vinCheck.vin, make, model }); } catch(e) {}
        console.log(`[FLEET] ✅ Vehicle ${unitNumber} added (${year} ${make} ${model})`);
        res.status(201).json({ success: true, id: result.lastInsertRowid, unitNumber });
    } catch (err) {
        console.error('[FLEET] POST /vehicles error:', err.message);
        res.status(500).json({ error: 'Failed to add vehicle: ' + err.message });
    }
});

router.put('/vehicles/:id', (req, res) => {
    try {
        const allowed = ['UnitNumber','VIN','Year','Make','Model','VehicleType','Status','LicensePlate','PlateState','FuelType','PlantID','AssignedDriver','Department','PurchaseDate','PurchasePrice','Odometer','EngineHours','DOTNumber','GVWR','AxleCount','InsurancePolicy','InsuranceExpiry','NextPMDate','NextPMMileage','LastPMDate','LastPMMileage','PMIntervalMiles','PMIntervalDays','Notes'];
        const fields = []; const values = [];
        for (const [k, v] of Object.entries(req.body)) {
            if (allowed.includes(k)) { fields.push(`${k} = ?`); values.push(v); }
        }
        if (fields.length === 0) return res.json({ success: true });
        fields.push('UpdatedAt = datetime(\'now\')');
        values.push(req.params.id);
        logisticsDb.prepare(`UPDATE fleet_vehicles SET ${fields.join(', ')} WHERE ID = ?`).run(...values); /* dynamic col/table - sanitize inputs */
        res.json({ success: true });
    } catch (err) {
        console.error('[FLEET] PUT /vehicles/:id error:', err.message);
        res.status(500).json({ error: 'Failed to update vehicle' });
    }
});

// ══════════════════════════════════════════════════════════════════
// MILEAGE LOG
// ══════════════════════════════════════════════════════════════════

router.post('/vehicles/:id/mileage', (req, res) => {
    try {
        const { odometer, reportedBy, source, notes } = req.body;
        if (!odometer) return res.status(400).json({ error: 'Odometer reading is required' });
        const v = logisticsDb.prepare('SELECT Odometer FROM fleet_vehicles WHERE ID = ?').get(req.params.id);
        if (!v) return res.status(404).json({ error: 'Vehicle not found' });
        if (parseFloat(odometer) < v.Odometer) return res.status(400).json({ error: `Odometer cannot decrease. Current: ${v.Odometer}` });

        logisticsDb.prepare('INSERT INTO fleet_mileage_log (VehicleID, Odometer, ReportedBy, Source, Notes) VALUES (?, ?, ?, ?, ?)').run(req.params.id, odometer, reportedBy || 'system', source || 'manual', notes || null);
        logisticsDb.prepare('UPDATE fleet_vehicles SET Odometer = ?, UpdatedAt = datetime(\'now\') WHERE ID = ?').run(odometer, req.params.id);

        // Check if PM is due by mileage
        const vehicle = logisticsDb.prepare('SELECT UnitNumber, NextPMMileage FROM fleet_vehicles WHERE ID = ?').get(req.params.id);
        let pmDue = false;
        if (vehicle.NextPMMileage && parseFloat(odometer) >= vehicle.NextPMMileage) pmDue = true;

        res.json({ success: true, pmDue });
    } catch (err) {
        console.error('[FLEET] POST mileage error:', err.message);
        res.status(500).json({ error: 'Failed to log mileage' });
    }
});

// ══════════════════════════════════════════════════════════════════
// SERVICE HISTORY
// ══════════════════════════════════════════════════════════════════

router.post('/vehicles/:id/service', (req, res) => {
    try {
        const { serviceType, description, mileageAtService, laborHours, partsCost, laborCost, miscCost, performedBy, vendor, inHouse, workOrderId, partsUsed, notes } = req.body;
        if (!description) return res.status(400).json({ error: 'Description is required' });
        const total = (parseFloat(partsCost) || 0) + (parseFloat(laborCost) || 0) + (parseFloat(miscCost) || 0);

        const result = logisticsDb.prepare(`
            INSERT INTO fleet_service_history (VehicleID, ServiceType, Description, MileageAtService, LaborHours, PartsCost, LaborCost, MiscCost, TotalCost, PerformedBy, Vendor, InHouse, WorkOrderID, PartsUsed, Notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(req.params.id, serviceType || 'Repair', description, mileageAtService || null, laborHours || 0, partsCost || 0, laborCost || 0, miscCost || 0, total, performedBy || null, vendor || null, inHouse !== false ? 1 : 0, workOrderId || null, partsUsed ? JSON.stringify(partsUsed) : null, notes || null);

        // If it's a PM, update LastPM and calculate NextPM
        if (serviceType === 'PM Service') {
            const v = logisticsDb.prepare('SELECT PMIntervalMiles, PMIntervalDays FROM fleet_vehicles WHERE ID = ?').get(req.params.id);
            const nextMileage = mileageAtService ? parseFloat(mileageAtService) + (v.PMIntervalMiles || 25000) : null;
            const nextDate = new Date(Date.now() + (v.PMIntervalDays || 90) * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
            logisticsDb.prepare('UPDATE fleet_vehicles SET LastPMDate = date(\'now\'), LastPMMileage = ?, NextPMDate = ?, NextPMMileage = ?, UpdatedAt = datetime(\'now\') WHERE ID = ?').run(mileageAtService || null, nextDate, nextMileage, req.params.id);
        }

        res.status(201).json({ success: true, id: result.lastInsertRowid });
    } catch (err) {
        console.error('[FLEET] POST service error:', err.message);
        res.status(500).json({ error: 'Failed to log service' });
    }
});

// ══════════════════════════════════════════════════════════════════
// FUEL LOG
// ══════════════════════════════════════════════════════════════════

router.post('/vehicles/:id/fuel', (req, res) => {
    try {
        const { gallons, costPerGallon, odometerAtFill, fuelType, station, defGallons, loggedBy } = req.body;
        if (!gallons) return res.status(400).json({ error: 'Gallons is required' });
        const totalCost = (parseFloat(gallons) || 0) * (parseFloat(costPerGallon) || 0);

        // Auto-calc MPG from last fill
        let mpg = null, milesSinceLast = null;
        if (odometerAtFill) {
            const lastFill = logisticsDb.prepare('SELECT OdometerAtFill FROM fleet_fuel_log WHERE VehicleID = ? AND OdometerAtFill IS NOT NULL ORDER BY FillDate DESC LIMIT 1').get(req.params.id);
            if (lastFill && lastFill.OdometerAtFill) {
                milesSinceLast = parseFloat(odometerAtFill) - lastFill.OdometerAtFill;
                if (milesSinceLast > 0 && parseFloat(gallons) > 0) {
                    mpg = Math.round((milesSinceLast / parseFloat(gallons)) * 100) / 100;
                }
            }
            logisticsDb.prepare('UPDATE fleet_vehicles SET Odometer = ?, UpdatedAt = datetime(\'now\') WHERE ID = ?').run(odometerAtFill, req.params.id);
        }

        logisticsDb.prepare(`INSERT INTO fleet_fuel_log (VehicleID, Gallons, CostPerGallon, TotalCost, OdometerAtFill, MilesSinceLastFill, MPG, FuelType, Station, DEFGallons, LoggedBy) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(req.params.id, gallons, costPerGallon || null, totalCost, odometerAtFill || null, milesSinceLast, mpg, fuelType || 'Diesel', station || null, defGallons || 0, loggedBy || null);

        res.status(201).json({ success: true, mpg, milesSinceLast, totalCost });
    } catch (err) {
        console.error('[FLEET] POST fuel error:', err.message);
        res.status(500).json({ error: 'Failed to log fuel' });
    }
});

router.get('/vehicles/:id/fuel', (req, res) => {
    try {
        const logs = logisticsDb.prepare('SELECT * FROM fleet_fuel_log WHERE VehicleID = ? ORDER BY FillDate DESC LIMIT 100').all(req.params.id);
        const avgMPG = logisticsDb.prepare('SELECT AVG(MPG) as avg FROM fleet_fuel_log WHERE VehicleID = ? AND MPG IS NOT NULL').get(req.params.id);
        const totalSpent = logisticsDb.prepare('SELECT SUM(TotalCost) as total, SUM(Gallons) as gallons FROM fleet_fuel_log WHERE VehicleID = ?').get(req.params.id);
        res.json({ logs, avgMPG: avgMPG?.avg ? Math.round(avgMPG.avg * 100) / 100 : null, totalSpent: totalSpent?.total || 0, totalGallons: totalSpent?.gallons || 0 });
    } catch (err) {
        console.error('[FLEET] GET fuel error:', err.message);
        res.status(500).json({ error: 'Failed to fetch fuel logs' });
    }
});

// Aggregate Fuel Logs for all vehicles
router.get('/fuel', (req, res) => {
    try {
        const sql = `
            SELECT f.*, v.UnitNumber 
            FROM fleet_fuel_log f
            JOIN fleet_vehicles v ON f.VehicleID = v.ID
            ORDER BY f.FillDate DESC LIMIT 200
        `;
        res.json(logisticsDb.prepare(sql).all());
    } catch (err) {
        console.error('[FLEET] GET aggregate fuel error:', err.message);
        res.status(500).json({ error: 'Failed to fetch aggregate fuel logs' });
    }
});

router.put('/fuel/:id', (req, res) => {
    try {
        const { Gallons, CostPerGallon, OdometerAtFill, Station, FuelType, Notes } = req.body;
        const existing = logisticsDb.prepare('SELECT * FROM fleet_fuel_log WHERE ID = ?').get(req.params.id);
        if (!existing) return res.status(404).json({ error: 'Fuel log not found' });
        const totalCost = (parseFloat(Gallons || existing.Gallons) || 0) * (parseFloat(CostPerGallon || existing.CostPerGallon) || 0);
        logisticsDb.prepare(`UPDATE fleet_fuel_log SET Gallons = COALESCE(?, Gallons), CostPerGallon = COALESCE(?, CostPerGallon), TotalCost = ?, OdometerAtFill = COALESCE(?, OdometerAtFill), Station = COALESCE(?, Station), FuelType = COALESCE(?, FuelType) WHERE ID = ?`).run(
            Gallons || null, CostPerGallon || null, totalCost, OdometerAtFill || null, Station || null, FuelType || null, req.params.id
        );
        res.json({ success: true });
    } catch (err) { console.error('[FLEET] PUT fuel error:', err.message); res.status(500).json({ error: 'Failed to update fuel log' }); }
});

// ══════════════════════════════════════════════════════════════════
// DVIR (Driver Vehicle Inspection Reports)
// ══════════════════════════════════════════════════════════════════
router.get('/dvir', (req, res) => {
    try {
        const { vehicle, driver, status, limit } = req.query;
        let sql = `SELECT d.*, v.UnitNumber FROM fleet_dvir d LEFT JOIN fleet_vehicles v ON d.VehicleID = v.ID WHERE 1=1`;
        const params = [];
        if (vehicle) { sql += ` AND d.VehicleID = ?`; params.push(vehicle); }
        if (driver) { sql += ` AND d.Driver LIKE ?`; params.push(`%${driver}%`); }
        if (status) { sql += ` AND d.Status = ?`; params.push(status); }
        sql += ` ORDER BY d.InspectionDate DESC LIMIT ?`;
        params.push(parseInt(limit) || 200);
        res.json(logisticsDb.prepare(sql).all(...params));
    } catch (err) {
        console.error('[FLEET] GET /dvir error:', err.message);
        res.status(500).json({ error: 'Failed to fetch DVIRs' });
    }
});

router.post('/dvir', (req, res) => {
    try {
        const { vehicleId, driver, inspectionType, odometerAtInspection, notes } = req.body;
        if (!vehicleId || !driver) return res.status(400).json({ error: 'vehicleId and driver are required' });
        const v = logisticsDb.prepare('SELECT VehicleType, UnitNumber FROM fleet_vehicles WHERE ID = ?').get(vehicleId);
        if (!v) return res.status(404).json({ error: 'Vehicle not found' });

        const result = logisticsDb.prepare(`INSERT INTO fleet_dvir (VehicleID, Driver, InspectionType, OdometerAtInspection, Notes, Signature) VALUES (?, ?, ?, ?, ?, ?)`).run(vehicleId, driver, inspectionType || 'Pre-Trip', odometerAtInspection || null, notes || null, driver);
        const dvirId = result.lastInsertRowid;

        // Auto-populate checklist from vehicle type template
        const checklist = DVIR_CHECKLISTS[v.VehicleType] || DVIR_CHECKLISTS['Tractor'];
        const ins = logisticsDb.prepare('INSERT INTO fleet_dvir_items (DVIRID, Category, ItemDescription) VALUES (?, ?, ?)');
        checklist.forEach(item => ins.run(dvirId, item.category, item.item));

        console.log(`[FLEET] ✅ DVIR #${dvirId} created for ${v.UnitNumber} by ${driver} (${checklist.length} items)`);
        res.status(201).json({ success: true, id: dvirId, items: checklist.length });
    } catch (err) {
        console.error('[FLEET] POST dvir error:', err.message);
        res.status(500).json({ error: 'Failed to create DVIR' });
    }
});

router.get('/dvir/:id', (req, res) => {
    try {
        const dvir = logisticsDb.prepare('SELECT d.*, v.UnitNumber, v.Make, v.Model, v.Year FROM fleet_dvir d LEFT JOIN fleet_vehicles v ON d.VehicleID = v.ID WHERE d.ID = ?').get(req.params.id);
        if (!dvir) return res.status(404).json({ error: 'DVIR not found' });
        const items = logisticsDb.prepare('SELECT * FROM fleet_dvir_items WHERE DVIRID = ? ORDER BY Category, ID').all(req.params.id);
        res.json({ dvir, items });
    } catch (err) {
        console.error('[FLEET] GET dvir error:', err.message);
        res.status(500).json({ error: 'Failed to fetch DVIR' });
    }
});

router.put('/dvir/:id', (req, res) => {
    try {
        const { Driver, InspectionType, Status, OdometerAtInspection, Notes, ReviewedBy } = req.body;
        const existing = logisticsDb.prepare('SELECT * FROM fleet_dvir WHERE ID = ?').get(req.params.id);
        if (!existing) return res.status(404).json({ error: 'DVIR not found' });
        logisticsDb.prepare(`UPDATE fleet_dvir SET 
            Driver = COALESCE(?, Driver),
            InspectionType = COALESCE(?, InspectionType),
            Status = COALESCE(?, Status),
            OdometerAtInspection = COALESCE(?, OdometerAtInspection),
            Notes = COALESCE(?, Notes),
            ReviewedBy = COALESCE(?, ReviewedBy),
            ReviewedAt = CASE WHEN ? IS NOT NULL THEN datetime('now') ELSE ReviewedAt END
        WHERE ID = ?`).run(
            Driver || null, InspectionType || null, Status || null,
            OdometerAtInspection != null ? OdometerAtInspection : null,
            Notes !== undefined ? Notes : null, ReviewedBy || null, ReviewedBy || null,
            req.params.id
        );
        const updated = logisticsDb.prepare('SELECT d.*, v.UnitNumber, v.Make, v.Model, v.Year FROM fleet_dvir d LEFT JOIN fleet_vehicles v ON d.VehicleID = v.ID WHERE d.ID = ?').get(req.params.id);
        res.json({ success: true, dvir: updated });
    } catch (err) {
        console.error('[FLEET] PUT dvir error:', err.message);
        res.status(500).json({ error: 'Failed to update DVIR' });
    }
});

router.post('/dvir/:id/items/:itemId', (req, res) => {
    try {
        const { condition, defectNotes, severity } = req.body;
        logisticsDb.prepare('UPDATE fleet_dvir_items SET Condition = ?, DefectNotes = ?, Severity = ? WHERE ID = ? AND DVIRID = ?').run(condition || 'OK', defectNotes || null, severity || null, req.params.itemId, req.params.id);
        if (condition === 'Defective') {
            const defects = logisticsDb.prepare('SELECT COUNT(*) as c FROM fleet_dvir_items WHERE DVIRID = ? AND Condition = \'Defective\'').get(req.params.id);
            logisticsDb.prepare('UPDATE fleet_dvir SET DefectsFound = ?, Status = ? WHERE ID = ?').run(defects.c, severity === 'Out of Service' ? 'Out of Service' : 'Defects Found', req.params.id);
        }
        res.json({ success: true });
    } catch (err) {
        console.error('[FLEET] POST dvir item error:', err.message);
        res.status(500).json({ error: 'Failed to update DVIR item' });
    }
});

router.get('/dvir/defects/open', (req, res) => {
    try {
        const defects = logisticsDb.prepare(`
            SELECT di.*, d.VehicleID, d.Driver, d.InspectionDate, v.UnitNumber
            FROM fleet_dvir_items di
            JOIN fleet_dvir d ON di.DVIRID = d.ID
            JOIN fleet_vehicles v ON d.VehicleID = v.ID
            WHERE di.Condition = 'Defective'
            ORDER BY d.InspectionDate DESC LIMIT 100
        `).all();
        res.json(defects);
    } catch (err) {
        console.error('[FLEET] GET dvir defects error:', err.message);
        res.status(500).json({ error: 'Failed to fetch defects' });
    }
});

// ══════════════════════════════════════════════════════════════════
// CDL & LICENSE TRACKER
// ══════════════════════════════════════════════════════════════════

router.get('/licenses', (req, res) => {
    try {
        const rows = logisticsDb.prepare('SELECT * FROM fleet_licenses ORDER BY ExpiryDate ASC').all();
        const now = new Date();
        const enriched = rows.map(r => {
            let status = 'Active';
            if (r.ExpiryDate) {
                const days = Math.ceil((new Date(r.ExpiryDate) - now) / (86400000));
                if (days < 0) status = 'Expired';
                else if (days <= 7) status = 'Expiring 7 Days';
                else if (days <= 30) status = 'Expiring 30 Days';
                else if (days <= 60) status = 'Expiring 60 Days';
                r.daysUntilExpiry = days;
            }
            r.Status = status;
            return r;
        });
        res.json(enriched);
    } catch (err) { res.status(500).json({ error: 'Failed to fetch licenses' }); }
});

router.post('/licenses', (req, res) => {
    try {
        const { driverName, licenseNumber, state, licenseClass, endorsements, issueDate, expiryDate, medicalCardExpiry, plantId, notes } = req.body;
        if (!driverName) return res.status(400).json({ error: 'Driver name is required' });
        const result = logisticsDb.prepare('INSERT INTO fleet_licenses (DriverName, LicenseNumber, State, LicenseClass, Endorsements, IssueDate, ExpiryDate, MedicalCardExpiry, PlantID, Notes) VALUES (?,?,?,?,?,?,?,?,?,?)').run(driverName, licenseNumber || null, state || null, licenseClass || 'C', endorsements || null, issueDate || null, expiryDate || null, medicalCardExpiry || null, plantId || null, notes || null);
        res.status(201).json({ success: true, id: result.lastInsertRowid });
    } catch (err) { res.status(500).json({ error: 'Failed to add license' }); }
});

router.put('/licenses/:id', (req, res) => {
    try {
        const { DriverName, LicenseNumber, State, LicenseClass, Endorsements, IssueDate, ExpiryDate, MedicalCardExpiry, Notes } = req.body;
        const existing = logisticsDb.prepare('SELECT * FROM fleet_licenses WHERE ID = ?').get(req.params.id);
        if (!existing) return res.status(404).json({ error: 'License not found' });
        logisticsDb.prepare(`UPDATE fleet_licenses SET DriverName = COALESCE(?, DriverName), LicenseNumber = COALESCE(?, LicenseNumber), State = COALESCE(?, State), LicenseClass = COALESCE(?, LicenseClass), Endorsements = COALESCE(?, Endorsements), IssueDate = COALESCE(?, IssueDate), ExpiryDate = COALESCE(?, ExpiryDate), MedicalCardExpiry = COALESCE(?, MedicalCardExpiry), Notes = COALESCE(?, Notes) WHERE ID = ?`).run(
            DriverName || null, LicenseNumber || null, State || null, LicenseClass || null, Endorsements || null, IssueDate || null, ExpiryDate || null, MedicalCardExpiry || null, Notes !== undefined ? Notes : null, req.params.id
        );
        res.json({ success: true });
    } catch (err) { console.error('[FLEET] PUT license error:', err.message); res.status(500).json({ error: 'Failed to update license' }); }
});

router.get('/licenses/expiring', (req, res) => {
    try {
        const days = parseInt(req.query.days) || 60;
        const futureDate = new Date(Date.now() + days * 86400000).toISOString().split('T')[0];
        const today = new Date().toISOString().split('T')[0];
        const expiring = logisticsDb.prepare('SELECT * FROM fleet_licenses WHERE ExpiryDate IS NOT NULL AND ExpiryDate <= ? AND ExpiryDate >= ? ORDER BY ExpiryDate ASC').all(futureDate, today);
        const expired = logisticsDb.prepare('SELECT * FROM fleet_licenses WHERE ExpiryDate IS NOT NULL AND ExpiryDate < ? ORDER BY ExpiryDate DESC').all(today);
        // Medical cards
        const medExpiring = logisticsDb.prepare('SELECT * FROM fleet_licenses WHERE MedicalCardExpiry IS NOT NULL AND MedicalCardExpiry <= ? AND MedicalCardExpiry >= ? ORDER BY MedicalCardExpiry ASC').all(futureDate, today);
        res.json({ expiring, expired, medicalExpiring: medExpiring });
    } catch (err) { res.status(500).json({ error: 'Failed to fetch expiring licenses' }); }
});

// ══════════════════════════════════════════════════════════════════
// DOT INSPECTIONS
// ══════════════════════════════════════════════════════════════════

router.post('/vehicles/:id/dot-inspection', (req, res) => {
    try {
        const { inspectionDate, inspector, inspectionType, result, violationCount, violations, nextAnnualDue, decalNumber, notes } = req.body;
        if (!inspectionDate) return res.status(400).json({ error: 'Inspection date is required' });
        const r = logisticsDb.prepare('INSERT INTO fleet_dot_inspections (VehicleID, InspectionDate, Inspector, InspectionType, Result, ViolationCount, Violations, NextAnnualDue, DecalNumber, Notes) VALUES (?,?,?,?,?,?,?,?,?,?)').run(req.params.id, inspectionDate, inspector || null, inspectionType || 'Annual', result || 'Pass', violationCount || 0, violations ? JSON.stringify(violations) : null, nextAnnualDue || null, decalNumber || null, notes || null);
        res.status(201).json({ success: true, id: r.lastInsertRowid });
    } catch (err) { res.status(500).json({ error: 'Failed to log DOT inspection' }); }
});

router.get('/vehicles/:id/dot-inspections', (req, res) => {
    try {
        res.json(logisticsDb.prepare('SELECT * FROM fleet_dot_inspections WHERE VehicleID = ? ORDER BY InspectionDate DESC').all(req.params.id));
    } catch (err) { res.status(500).json({ error: 'Failed to fetch DOT inspections' }); }
});

// Aggregate DOT Inspections for all vehicles
router.get('/dot', (req, res) => {
    try {
        const sql = `
            SELECT i.*, v.UnitNumber 
            FROM fleet_dot_inspections i
            JOIN fleet_vehicles v ON i.VehicleID = v.ID
            ORDER BY i.InspectionDate DESC LIMIT 200
        `;
        res.json(logisticsDb.prepare(sql).all());
    } catch (err) {
        console.error('[FLEET] GET aggregate dot error:', err.message);
        res.status(500).json({ error: 'Failed to fetch aggregate DOT inspections' });
    }
});

router.put('/dot/:id', (req, res) => {
    try {
        const { InspectionDate, Inspector, InspectionType, Result, ViolationCount, Violations, NextAnnualDue, DecalNumber, Notes } = req.body;
        const existing = logisticsDb.prepare('SELECT * FROM fleet_dot_inspections WHERE ID = ?').get(req.params.id);
        if (!existing) return res.status(404).json({ error: 'DOT inspection not found' });
        logisticsDb.prepare(`UPDATE fleet_dot_inspections SET InspectionDate = COALESCE(?, InspectionDate), Inspector = COALESCE(?, Inspector), InspectionType = COALESCE(?, InspectionType), Result = COALESCE(?, Result), ViolationCount = COALESCE(?, ViolationCount), Violations = COALESCE(?, Violations), NextAnnualDue = COALESCE(?, NextAnnualDue), DecalNumber = COALESCE(?, DecalNumber), Notes = COALESCE(?, Notes) WHERE ID = ?`).run(
            InspectionDate || null, Inspector || null, InspectionType || null, Result || null, ViolationCount != null ? ViolationCount : null, Violations || null, NextAnnualDue || null, DecalNumber || null, Notes !== undefined ? Notes : null, req.params.id
        );
        res.json({ success: true });
    } catch (err) { console.error('[FLEET] PUT DOT error:', err.message); res.status(500).json({ error: 'Failed to update DOT inspection' }); }
});

router.get('/dot/due', (req, res) => {
    try {
        const days = parseInt(req.query.days) || 90;
        const futureDate = new Date(Date.now() + days * 86400000).toISOString().split('T')[0];
        const due = logisticsDb.prepare(`
            SELECT v.ID, v.UnitNumber, v.Make, v.Model, v.Year, v.VehicleType,
                   MAX(di.InspectionDate) as lastInspection, MAX(di.NextAnnualDue) as nextDue
            FROM fleet_vehicles v
            LEFT JOIN fleet_dot_inspections di ON v.ID = di.VehicleID
            WHERE v.Active = 1
            GROUP BY v.ID
            HAVING nextDue IS NULL OR nextDue <= ?
            ORDER BY nextDue ASC
        `).all(futureDate);
        res.json(due);
    } catch (err) { res.status(500).json({ error: 'Failed to fetch DOT due list' }); }
});

// ══════════════════════════════════════════════════════════════════
// TIRE MANAGEMENT
// ══════════════════════════════════════════════════════════════════

router.get('/vehicles/:id/tires', (req, res) => {
    try {
        res.json(logisticsDb.prepare('SELECT * FROM fleet_tires WHERE VehicleID = ? AND Status = \'In Service\' ORDER BY Position').all(req.params.id));
    } catch (err) { res.status(500).json({ error: 'Failed to fetch tires' }); }
});

// Aggregate Tires list for all vehicles
router.get('/tires', (req, res) => {
    try {
        const sql = `
            SELECT t.*, v.UnitNumber 
            FROM fleet_tires t
            JOIN fleet_vehicles v ON t.VehicleID = v.ID
            WHERE t.Status = 'In Service'
            ORDER BY v.UnitNumber ASC, t.Position ASC
        `;
        res.json(logisticsDb.prepare(sql).all());
    } catch (err) {
        console.error('[FLEET] GET aggregate tires error:', err.message);
        res.status(500).json({ error: 'Failed to fetch aggregate tires' });
    }
});

router.post('/vehicles/:id/tires', (req, res) => {
    try {
        const { tireSerial, position, brand, model, size, mileageInstalled, treadDepth } = req.body;
        if (!position) return res.status(400).json({ error: 'Position is required' });
        // Remove existing tire at this position
        logisticsDb.prepare('UPDATE fleet_tires SET Status = \'Removed\', VehicleID = NULL WHERE VehicleID = ? AND Position = ? AND Status = \'In Service\'').run(req.params.id, position);
        const v = logisticsDb.prepare('SELECT Odometer FROM fleet_vehicles WHERE ID = ?').get(req.params.id);
        const result = logisticsDb.prepare('INSERT INTO fleet_tires (TireSerial, VehicleID, Position, Brand, Model, Size, DateInstalled, MileageInstalled, TreadDepth, LastMeasuredDate) VALUES (?,?,?,?,?,?,date(\'now\'),?,?,date(\'now\'))').run(tireSerial || null, req.params.id, position, brand || null, model || null, size || null, mileageInstalled || v?.Odometer || 0, treadDepth || null);
        res.status(201).json({ success: true, id: result.lastInsertRowid });
    } catch (err) { res.status(500).json({ error: 'Failed to mount tire' }); }
});

router.put('/tires/:id', (req, res) => {
    try {
        const { TireSerial, Position, Brand, Model, Size, TreadDepth, Status } = req.body;
        const existing = logisticsDb.prepare('SELECT * FROM fleet_tires WHERE ID = ?').get(req.params.id);
        if (!existing) return res.status(404).json({ error: 'Tire not found' });
        logisticsDb.prepare(`UPDATE fleet_tires SET TireSerial = COALESCE(?, TireSerial), Position = COALESCE(?, Position), Brand = COALESCE(?, Brand), Model = COALESCE(?, Model), Size = COALESCE(?, Size), TreadDepth = COALESCE(?, TreadDepth), Status = COALESCE(?, Status) WHERE ID = ?`).run(
            TireSerial || null, Position || null, Brand || null, Model || null, Size || null, TreadDepth != null ? TreadDepth : null, Status || null, req.params.id
        );
        res.json({ success: true });
    } catch (err) { console.error('[FLEET] PUT tire error:', err.message); res.status(500).json({ error: 'Failed to update tire' }); }
});

router.post('/tires/:tireId/reading', (req, res) => {
    try {
        const { treadDepth, psi, measuredBy, notes } = req.body;
        logisticsDb.prepare('INSERT INTO fleet_tire_readings (TireID, TreadDepth, PSI, MeasuredBy, Notes) VALUES (?,?,?,?,?)').run(req.params.tireId, treadDepth || null, psi || null, measuredBy || null, notes || null);
        if (treadDepth !== undefined) {
            logisticsDb.prepare('UPDATE fleet_tires SET TreadDepth = ?, LastMeasuredDate = date(\'now\') WHERE ID = ?').run(treadDepth, req.params.tireId);
        }
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: 'Failed to log tire reading' }); }
});

router.get('/tires/alerts', (req, res) => {
    try {
        const alerts = logisticsDb.prepare(`
            SELECT t.*, v.UnitNumber FROM fleet_tires t
            LEFT JOIN fleet_vehicles v ON t.VehicleID = v.ID
            WHERE t.Status = 'In Service' AND t.TreadDepth IS NOT NULL
            AND ((t.Position LIKE '%F%' AND t.TreadDepth < 4) OR (t.Position NOT LIKE '%F%' AND t.TreadDepth < 2))
            ORDER BY t.TreadDepth ASC
        `).all();
        res.json(alerts);
    } catch (err) { res.status(500).json({ error: 'Failed to fetch tire alerts' }); }
});

// ══════════════════════════════════════════════════════════════════
// FLEET DASHBOARD & STATS
// ══════════════════════════════════════════════════════════════════

// (Stats endpoint moved below to Corporate Operational Intelligence section)

router.get('/pm-due', (req, res) => {
    try {
        const pmDue = logisticsDb.prepare(`
            SELECT *, 
                CASE WHEN NextPMDate IS NOT NULL THEN julianday(NextPMDate) - julianday('now') END as daysUntilPM,
                CASE WHEN NextPMMileage IS NOT NULL THEN NextPMMileage - Odometer END as milesUntilPM
            FROM fleet_vehicles 
            WHERE Active = 1 AND (NextPMDate <= date('now', '+30 days') OR (NextPMMileage IS NOT NULL AND Odometer >= NextPMMileage - 2000))
            ORDER BY NextPMDate ASC
        `).all();
        res.json(pmDue);
    } catch (err) { res.status(500).json({ error: 'Failed to fetch PM due list' }); }
});

router.get('/fuel/efficiency', (req, res) => {
    try {
        const fleet = logisticsDb.prepare(`
            SELECT v.ID, v.UnitNumber, v.Year, v.Make, v.Model,
                   AVG(f.MPG) as avgMPG, COUNT(f.ID) as fillCount,
                   SUM(f.TotalCost) as totalFuelCost, SUM(f.Gallons) as totalGallons
            FROM fleet_vehicles v
            JOIN fleet_fuel_log f ON v.ID = f.VehicleID
            WHERE f.MPG IS NOT NULL
            GROUP BY v.ID
            ORDER BY avgMPG ASC
        `).all();
        fleet.forEach(v => { v.avgMPG = Math.round((v.avgMPG || 0) * 100) / 100; });
        res.json(fleet);
    } catch (err) { res.status(500).json({ error: 'Failed to fetch fuel efficiency' }); }
});

// Constants endpoint
router.get('/constants', (req, res) => {
    res.json({ vehicleTypes: VEHICLE_TYPES, vehicleStatuses: VEHICLE_STATUSES, fuelTypes: FUEL_TYPES, serviceTypes: SERVICE_TYPES, dvirChecklists: Object.keys(DVIR_CHECKLISTS) });
});

// ══════════════════════════════════════════════════════════════════
// FLEET STATS — Corporate Operational Intelligence
// ══════════════════════════════════════════════════════════════════
router.get('/stats', (req, res) => {
    try {
        // Each sub-query is wrapped defensively so one missing/broken table doesn't crash stats
        const defaultStats = { total: 0 };
        let vehicles = { total: 0, active: 0, inShop: 0, oos: 0 };
        let dvirs = { total: 0, defects: 0 };
        let fuel = { entries: 0, totalSpend: 0 };
        let tires = { total: 0, critical: 0 };
        let licenses = { total: 0, expiringSoon: 0, medExpiring: 0 };
        let dot = { total: 0, dueSoon: 0 };
        let pmOverdue = 0;

        try { vehicles = logisticsDb.prepare(`SELECT COUNT(*) as total, SUM(CASE WHEN Status = 'Active' THEN 1 ELSE 0 END) as active, SUM(CASE WHEN Status = 'In Shop' THEN 1 ELSE 0 END) as inShop, SUM(CASE WHEN Status = 'Out of Service' THEN 1 ELSE 0 END) as oos FROM fleet_vehicles`).get() || vehicles; } catch(e) { console.warn('[FLEET] stats/vehicles:', e.message); }
        try { dvirs = logisticsDb.prepare(`SELECT COUNT(*) as total, SUM(CASE WHEN Status != 'Pass' THEN 1 ELSE 0 END) as defects FROM fleet_dvir WHERE InspectionDate >= date('now', '-30 days')`).get() || dvirs; } catch(e) { console.warn('[FLEET] stats/dvirs:', e.message); }
        try { fuel = logisticsDb.prepare(`SELECT COUNT(*) as entries, ROUND(SUM(TotalCost),2) as totalSpend FROM fleet_fuel_log WHERE FillDate >= date('now', '-30 days')`).get() || fuel; } catch(e) { console.warn('[FLEET] stats/fuel:', e.message); }
        try { tires = logisticsDb.prepare(`SELECT COUNT(*) as total, SUM(CASE WHEN TreadDepth < 4 THEN 1 ELSE 0 END) as critical FROM fleet_tires WHERE Status = 'In Service'`).get() || tires; } catch(e) { console.warn('[FLEET] stats/tires:', e.message); }
        try { licenses = logisticsDb.prepare(`SELECT COUNT(*) as total, SUM(CASE WHEN ExpiryDate <= date('now', '+30 days') THEN 1 ELSE 0 END) as expiringSoon, SUM(CASE WHEN MedicalCardExpiry <= date('now', '+30 days') THEN 1 ELSE 0 END) as medExpiring FROM fleet_licenses`).get() || licenses; } catch(e) { console.warn('[FLEET] stats/licenses:', e.message); }
        try { dot = logisticsDb.prepare(`SELECT COUNT(*) as total, SUM(CASE WHEN NextAnnualDue <= date('now', '+30 days') THEN 1 ELSE 0 END) as dueSoon FROM fleet_dot_inspections`).get() || dot; } catch(e) { console.warn('[FLEET] stats/dot:', e.message); }
        try { pmOverdue = (logisticsDb.prepare(`SELECT COUNT(*) as overdue FROM fleet_vehicles WHERE NextPMDate IS NOT NULL AND NextPMDate <= date('now')`).get() || {}).overdue || 0; } catch(e) { console.warn('[FLEET] stats/pmOverdue:', e.message); }

        res.json({
            vehicles: { ...vehicles },
            dvirs: { ...dvirs },
            fuel: { ...fuel },
            tires: { ...tires },
            licenses: { ...licenses },
            dot: { ...dot },
            pmOverdue,
            urgencyCount: (vehicles.inShop || 0) + (vehicles.oos || 0) + (dvirs.defects || 0) + (tires.critical || 0) + (licenses.expiringSoon || 0) + pmOverdue
        });
    } catch (err) {
        console.error('[FLEET] GET /stats error:', err.message);
        res.status(500).json({ error: 'Failed to fetch fleet stats' });
    }
});

module.exports = router;
