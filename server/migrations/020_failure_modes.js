// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS - Migration 020 — Failure Mode Library
 * ========================================================
 * Creates failure_modes reference table seeded with common industrial
 * failure modes by equipment category. Adds FailureMode column to
 * the work order table for tracking root cause classification.
 */

module.exports = {
    up: (db) => {
        // 1. Create the failure modes reference table
        db.exec(`CREATE TABLE IF NOT EXISTS failure_modes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code TEXT NOT NULL UNIQUE,
            description TEXT NOT NULL,
            category TEXT NOT NULL,
            equipment_type TEXT DEFAULT 'General',
            severity TEXT DEFAULT 'Medium'
        )`);
        console.log('   -> Created failure_modes table');

        // 2. Add FailureMode column to work orders (safe ALTER — ignores if exists)
        try {
            db.exec(`ALTER TABLE Work ADD COLUMN FailureMode TEXT DEFAULT ''`);
            console.log('   -> Added FailureMode column to Work table');
        } catch (e) {
            if (!e.message.includes('duplicate column')) {
                console.warn('   -> FailureMode column:', e.message);
            }
        }

        // 3. Seed with comprehensive industrial failure modes
        const insert = db.prepare(`INSERT OR IGNORE INTO failure_modes (code, description, category, equipment_type, severity) VALUES (?, ?, ?, ?, ?)`);

        const modes = [
            // Mechanical
            ['MECH-BRG', 'Bearing Failure', 'Mechanical', 'Motor,Pump,Conveyor,Fan', 'High'],
            ['MECH-SEAL', 'Seal/Gasket Leak', 'Mechanical', 'Pump,Valve,Heat Exchanger', 'Medium'],
            ['MECH-ALIGN', 'Misalignment', 'Mechanical', 'Motor,Pump,Conveyor', 'Medium'],
            ['MECH-BELT', 'Belt Wear/Break', 'Mechanical', 'Conveyor,Fan,Compressor', 'Medium'],
            ['MECH-CHAIN', 'Chain/Sprocket Wear', 'Mechanical', 'Conveyor,Mixer', 'Medium'],
            ['MECH-GEAR', 'Gearbox Failure', 'Mechanical', 'Conveyor,Mixer,Agitator', 'High'],
            ['MECH-COUP', 'Coupling Failure', 'Mechanical', 'Motor,Pump', 'High'],
            ['MECH-SHAFT', 'Shaft Wear/Break', 'Mechanical', 'Pump,Mixer,Agitator', 'Critical'],
            ['MECH-VIB', 'Excessive Vibration', 'Mechanical', 'Motor,Pump,Fan,Conveyor', 'Medium'],
            ['MECH-WEAR', 'General Wear', 'Mechanical', 'General', 'Low'],

            // Electrical
            ['ELEC-MTR', 'Motor Burnout', 'Electrical', 'Motor', 'Critical'],
            ['ELEC-VFD', 'VFD/Drive Fault', 'Electrical', 'Motor,Pump,Fan,Conveyor', 'High'],
            ['ELEC-WIRE', 'Wiring/Connection Fault', 'Electrical', 'General', 'Medium'],
            ['ELEC-SENS', 'Sensor Malfunction', 'Electrical', 'General', 'Medium'],
            ['ELEC-CTRL', 'Control System Fault', 'Electrical', 'PLC,SCADA', 'High'],
            ['ELEC-FUSE', 'Fuse/Breaker Trip', 'Electrical', 'General', 'Low'],
            ['ELEC-GND', 'Ground Fault', 'Electrical', 'General', 'High'],
            ['ELEC-PS', 'Power Supply Failure', 'Electrical', 'General', 'Medium'],

            // Hydraulic / Pneumatic
            ['HYD-LEAK', 'Hydraulic Leak', 'Hydraulic', 'Press,Lift,Cylinder', 'Medium'],
            ['HYD-PUMP', 'Hydraulic Pump Failure', 'Hydraulic', 'Press,Lift', 'High'],
            ['HYD-VALVE', 'Hydraulic Valve Stuck', 'Hydraulic', 'Press,Lift,Cylinder', 'Medium'],
            ['PNEU-LEAK', 'Pneumatic Air Leak', 'Pneumatic', 'Valve,Actuator,Cylinder', 'Low'],
            ['PNEU-CYL', 'Pneumatic Cylinder Failure', 'Pneumatic', 'Valve,Actuator', 'Medium'],

            // Process / Instrumentation
            ['PROC-TEMP', 'Temperature Out of Range', 'Process', 'Heat Exchanger,Pasteurizer,Boiler', 'High'],
            ['PROC-PRES', 'Pressure Anomaly', 'Process', 'Boiler,Compressor,Vessel', 'High'],
            ['PROC-FLOW', 'Flow Rate Deviation', 'Process', 'Pump,Valve,Pipeline', 'Medium'],
            ['PROC-LEVEL', 'Level Sensor/Control Fault', 'Process', 'Tank,Vessel,Silo', 'Medium'],
            ['PROC-PH', 'pH/Chemical Out of Spec', 'Process', 'CIP,Water Treatment', 'High'],
            ['INST-CAL', 'Instrument Calibration Drift', 'Instrumentation', 'General', 'Medium'],

            // Structural / Containment
            ['STRUC-CORR', 'Corrosion/Erosion', 'Structural', 'Tank,Vessel,Pipeline,Heat Exchanger', 'High'],
            ['STRUC-CRACK', 'Crack/Fracture', 'Structural', 'Frame,Support,Vessel', 'Critical'],
            ['STRUC-WELD', 'Weld Failure', 'Structural', 'Tank,Vessel,Frame', 'Critical'],

            // Lubrication
            ['LUB-LOW', 'Low/No Lubrication', 'Lubrication', 'Motor,Pump,Conveyor,Gearbox', 'Medium'],
            ['LUB-CONTAM', 'Lubricant Contamination', 'Lubrication', 'Motor,Pump,Gearbox', 'High'],

            // Safety / Compliance
            ['SAFE-GUARD', 'Safety Guard Missing/Damaged', 'Safety', 'Conveyor,Press,Mixer', 'Critical'],
            ['SAFE-ESTOP', 'E-Stop Malfunction', 'Safety', 'General', 'Critical'],
            ['SAFE-LOCK', 'LOTO Device Failure', 'Safety', 'General', 'Critical'],

            // General / Other
            ['GEN-NOISE', 'Abnormal Noise', 'General', 'General', 'Low'],
            ['GEN-ODOR', 'Unusual Odor/Smoke', 'General', 'General', 'High'],
            ['GEN-LEAK', 'Unspecified Leak', 'General', 'General', 'Medium'],
            ['GEN-OTHER', 'Other / Not Listed', 'General', 'General', 'Low'],
        ];

        for (const m of modes) {
            insert.run(m[0], m[1], m[2], m[3], m[4]);
        }
        console.log(`   -> Seeded ${modes.length} failure modes`);
    }
};
