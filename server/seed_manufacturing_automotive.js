// Copyright © 2026 Trier OS. All Rights Reserved.

/*
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * StoreDB Seed — Manufacturing & Automotive Catalog
 */
const Database = require('better-sqlite3');
const path = require('path');
const dataDir = require('./resolve_data_dir');
const db = new Database(path.join(dataDir, 'mfg_master.db'));

const insEquip = db.prepare(`INSERT OR REPLACE INTO MasterEquipment VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
const insPart = db.prepare(`INSERT OR REPLACE INTO MasterParts (MasterPartID, Description, StandardizedName, Manufacturer, Category, SubCategory, UOM, TypicalPriceMin, TypicalPriceMax, LeadTimeDays, Specifications, AlternatePartNumbers, EquipmentTypes, Tags) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);

const equipment = [
    ['MFG-ROBOT-6AXIS', 'Articulated robotic arm (6-axis)', 'PRODUCTION', '["FANUC","KUKA","ABB","YASKAWA"]', 90, '["wrist_joint_wear","encoder_fault","servo_amplifier_overheat","cable_harness_break","harmonic_drive_backlash"]', 6000, 4.0, 15, 24, '{"note":"High-payload articulated robot for welding, assembly, and heavy material handling."}'],
    ['MFG-ROBOT-SCARA', 'SCARA robot', 'PRODUCTION', '["Epson","Omron","Yamaha","FANUC"]', 180, '["z_axis_ball_screw_wear","belt_tension_loss","gripper_pneumatic_leak","motor_encoder_error"]', 8000, 3.0, 10, 12, '{"note":"Selective Compliance Assembly Robot Arm. High-speed horizontal assembly operations."}'],
    ['MFG-ROBOT-DELTA', 'Delta/pick-and-place robot', 'PACKAGING', '["ABB","FANUC","Omron"]', 90, '["carbon_fiber_arm_delamination","universal_joint_wear","vacuum_system_clog","vision_system_sync_fault"]', 5000, 2.5, 10, 12, '{"note":"High-speed pick-and-place robot for lightweight items."}'],
    ['MFG-PRESS-SERVO', 'Servo press / stamping press', 'PRODUCTION', '["AIDA","Schuler","Komatsu"]', 30, '["die_wear","servo_motor_fault","lubrication_system_failure","clutch_brake_slip","slide_gib_clearance"]', 4000, 6.0, 25, 24, '{"note":"Precision servo-driven stamping press for sheet metal forming."}'],
    ['MFG-CNC-VMC', 'CNC machining center (vertical and horizontal)', 'PRODUCTION', '["Haas","Mazak","DMG MORI","Okuma"]', 90, '["spindle_bearing_failure","tool_changer_jam","coolant_pump_clog","way_cover_damage","ball_screw_backlash"]', 5000, 5.0, 15, 12, '{"note":"Multi-axis CNC milling operations."}'],
    ['MFG-CNC-LATHE', 'CNC lathe / turning center', 'PRODUCTION', '["Mazak","Haas","Okuma","Doosan"]', 90, '["chuck_jaw_wear","turret_index_fault","tailstock_alignment","coolant_leak","spindle_runout"]', 5000, 4.5, 15, 12, '{"note":"Automated CNC turning operations."}'],
    ['MFG-CMM', 'CMM (Coordinate Measuring Machine)', 'QUALITY', '["Zeiss","Hexagon","Mitutoyo"]', 180, '["air_bearing_contamination","probe_head_crash","scale_reader_fault","calibration_drift"]', 10000, 3.0, 15, 12, '{"note":"Precision metrology equipment. Requires clean air and temperature control."}'],
    ['MFG-INJ-MOLD', 'Injection molding machine', 'PRODUCTION', '["Engel","KraussMaffei","Husky","Arburg"]', 30, '["screw_wear","heater_band_failure","hydraulic_pump_leak","tie_bar_stretch","ejector_pin_break"]', 4000, 5.0, 20, 24, '{"note":"Plastic injection molding operations."}'],
    ['MFG-DIE-CAST', 'Die casting machine', 'PRODUCTION', '["Buhler","Frech","Idra"]', 30, '["shot_sleeve_wear","plunger_tip_failure","toggle_mechanism_wear","hydraulic_valve_sticking","die_cooling_blockage"]', 3000, 6.0, 20, 24, '{"note":"High-pressure metal die casting."}'],
    ['MFG-CONV-OH', 'Assembly line conveyor (overhead / power-and-free)', 'LOGISTICS', '["Jervis B. Webb","Daifuku","Dematic"]', 60, '["chain_stretch","trolley_bearing_failure","drive_dog_wear","take_up_tension_loss","track_wear"]', 8000, 4.0, 20, 12, '{"note":"Continuous overhead or power-and-free chain conveyor for automotive assembly lines."}'],
    ['MFG-AGV', 'Automatic guided vehicle (AGV)', 'LOGISTICS', '["Daifuku","JBT","Seegrid","Mobile Industrial Robots"]', 30, '["battery_degradation","drive_wheel_wear","laser_scanner_fault","navigation_lost","charging_contact_wear"]', 4000, 2.0, 7, 12, '{"note":"Autonomous material transport vehicle."}'],
    ['MFG-ROBOT-COBOT', 'Collaborative robot (cobot)', 'PRODUCTION', '["Universal Robots","Doosan","Techman"]', 180, '["joint_torque_sensor_fault","teach_pendant_cable_break","gripper_failure","safety_stop_trigger_error"]', 8000, 1.5, 8, 12, '{"note":"Human-safe collaborative robot for light assembly."}']
];

const parts = [
    // Robotic wrist bearings and joint seals
    ['MFG-BRG-WRIST-100', 'Robotic Wrist Bearing 50mm High-Precision', 'BEARING, ROBOT WRIST, 50MM', 'SKF', 'BEARINGS', 'Precision Bearings', 'EA', 150, 400, 14, '{"bore_mm":50,"type":"cross_roller"}', '["SKF-6210-2RS"]', '["MFG-ROBOT-6AXIS","MFG-ROBOT-SCARA"]', 'bearing,robot,wrist,precision'],
    ['MFG-SEAL-JOINT-01', 'Robotic Joint Rotary Seal 50mm Viton', 'SEAL, ROTARY, 50MM, VITON', 'Freudenberg', 'SEALS', 'Rotary Seals', 'EA', 20, 60, 5, '{"bore_mm":50,"material":"Viton"}', '["GARLOCK-21158-2687"]', '["MFG-ROBOT-6AXIS","MFG-ROBOT-COBOT"]', 'seal,joint,robot,rotary,viton'],
    
    // Servo motor and drive components
    ['MFG-SERVO-ENCODER-100', 'Absolute Rotary Encoder 24-bit', 'ENCODER, ABSOLUTE, 24-BIT', 'Heidenhain', 'ELECTRICAL', 'Sensors', 'EA', 300, 800, 10, '{"resolution":"24-bit","protocol":"EnDat"}', '[]', '["MFG-ROBOT-6AXIS","MFG-PRESS-SERVO","MFG-CNC-VMC"]', 'encoder,servo,absolute,sensor'],
    ['MFG-SERVO-BRAKE-01', 'Electromagnetic Holding Brake 24VDC', 'BRAKE, HOLDING, 24VDC', 'Mayr', 'MECHANICAL', 'Brakes', 'EA', 150, 350, 7, '{"voltage":"24VDC","holding_torque_nm":50}', '[]', '["MFG-ROBOT-6AXIS","MFG-CNC-VMC"]', 'brake,electromagnetic,servo'],
    ['MFG-SERVO-DRIVE-5KW', 'Servo Drive Amplifier 5kW 400V', 'DRIVE, SERVO, 5KW, 400V', 'Yaskawa', 'ELECTRICAL', 'Drives', 'EA', 800, 1500, 14, '{"power_kw":5,"voltage":400}', '[]', '["MFG-ROBOT-6AXIS","MFG-PRESS-SERVO"]', 'drive,servo,amplifier'],

    // End-effector components
    ['MFG-VAC-CUP-30', 'Vacuum Suction Cup Bellows 30mm NBR', 'CUP, VACUUM, 30MM, BELLOWS, NBR', 'Schmalz', 'PNEUMATICS', 'Vacuum Components', 'EA', 5, 15, 2, '{"diameter_mm":30,"material":"NBR","type":"bellows"}', '[]', '["MFG-ROBOT-DELTA","MFG-ROBOT-SCARA"]', 'vacuum,cup,suction,bellows'],
    ['MFG-GRIPPER-PAR-01', 'Parallel Pneumatic Gripper 2-Finger', 'GRIPPER, PNEUMATIC, PARALLEL', 'Schunk', 'PNEUMATICS', 'Grippers', 'EA', 200, 600, 14, '{"type":"parallel","actuation":"pneumatic"}', '[]', '["MFG-ROBOT-6AXIS","MFG-ROBOT-COBOT"]', 'gripper,pneumatic,parallel,robot'],
    ['MFG-TOOL-CHGR-01', 'Robotic Automatic Tool Changer Master Side', 'TOOL CHANGER, ROBOT, MASTER', 'ATI', 'MECHANICAL', 'Robot Accessories', 'EA', 1000, 2500, 21, '{"payload_kg":50}', '[]', '["MFG-ROBOT-6AXIS"]', 'tool,changer,robot,master'],

    // CNC tooling
    ['MFG-CNC-EM-050', 'Carbide End Mill 4-Flute 1/2in TiAlN', 'END MILL, CARBIDE, 1/2in, 4-FLUTE', 'Kennametal', 'TOOLING', 'Milling Cutters', 'EA', 40, 100, 2, '{"diameter_in":0.5,"flutes":4,"coating":"TiAlN"}', '[]', '["MFG-CNC-VMC"]', 'endmill,carbide,cnc,milling'],
    ['MFG-CNC-INS-CNMG', 'Turning Insert CNMG 432 Carbide CVD', 'INSERT, TURNING, CNMG 432', 'Sandvik', 'TOOLING', 'Turning Inserts', 'BOX', 80, 150, 2, '{"style":"CNMG","size":"432","material":"Carbide"}', '[]', '["MFG-CNC-LATHE"]', 'insert,turning,cnmg,cnc'],
    ['MFG-CNC-DRILL-10M', 'Solid Carbide Drill Bit 10mm Coolant-Thru', 'DRILL BIT, CARBIDE, 10MM, COOLANT', 'Guhring', 'TOOLING', 'Drill Bits', 'EA', 60, 120, 2, '{"diameter_mm":10,"coolant":"through"}', '[]', '["MFG-CNC-VMC","MFG-CNC-LATHE"]', 'drill,carbide,coolant,10mm'],

    // Mold and die components
    ['MFG-MOLD-EP-05', 'Ejector Pin H-13 Nitrided 5mm x 150mm', 'PIN, EJECTOR, 5X150MM', 'PCS Company', 'TOOLING', 'Mold Components', 'EA', 5, 12, 2, '{"diameter_mm":5,"length_mm":150,"material":"H-13"}', '[]', '["MFG-INJ-MOLD","MFG-DIE-CAST"]', 'ejector,pin,mold,die'],
    ['MFG-MOLD-BUSH-01', 'Sprue Bushing Standard O-Series', 'BUSHING, SPRUE, O-SERIES', 'DME', 'TOOLING', 'Mold Components', 'EA', 40, 90, 5, '{"series":"O"}', '[]', '["MFG-INJ-MOLD"]', 'sprue,bushing,mold'],
    ['MFG-MOLD-FIT-01', 'Cooling Water Fitting Brass Quick-Disconnect 1/4 NPT', 'FITTING, COOLING, 1/4 NPT, BRASS', 'Parker', 'PNEUMATICS', 'Fittings', 'EA', 8, 20, 1, '{"thread":"1/4 NPT","material":"Brass"}', '[]', '["MFG-INJ-MOLD","MFG-DIE-CAST"]', 'fitting,cooling,water,brass,mold'],
    ['MFG-MOLD-WEAR-01', 'Parting Line Wear Strip Bronze-Graphite', 'WEAR STRIP, BRONZE-GRAPHITE', 'Oiles', 'MECHANICAL', 'Wear Plates', 'EA', 30, 80, 5, '{"material":"Bronze with solid lubricant"}', '[]', '["MFG-INJ-MOLD","MFG-DIE-CAST","MFG-PRESS-SERVO"]', 'wear,strip,plate,bronze,mold'],

    // Assembly line components
    ['MFG-CONV-RLR-BRG', 'Roller Conveyor Hex Shaft Bearing', 'BEARING, CONVEYOR ROLLER, HEX', 'SKF', 'BEARINGS', 'Conveyor Bearings', 'EA', 8, 25, 2, '{"bore":"7/16 Hex"}', '["SKF-6205-2RS"]', '["MFG-CONV-OH"]', 'bearing,conveyor,roller,hex'],
    ['MFG-CONV-CHAIN-40', 'Chain and Sprocket Set #40 Conveyor Drive', 'CHAIN SET, #40, DRIVE', 'Rexnord', 'MECHANICAL', 'Power Transmission', 'SET', 150, 300, 5, '{"chain":"#40"}', '["REXNORD-40-1R-10", "MARTIN-40B18"]', '["MFG-CONV-OH"]', 'chain,sprocket,conveyor,set'],
    ['MFG-CONV-PAD-01', 'Accumulation Conveyor Friction Pad UHMW', 'PAD, FRICTION, UHMW, CONVEYOR', 'Custom', 'MECHANICAL', 'Wear Parts', 'EA', 12, 35, 7, '{"material":"UHMW PE"}', '[]', '["MFG-CONV-OH"]', 'pad,friction,uhmw,conveyor'],

    // Actuators
    ['MFG-ACT-CYL-50', 'Pneumatic Cylinder ISO 15552 50mm Bore 100mm Stroke', 'CYLINDER, PNEUMATIC, 50X100', 'Festo', 'PNEUMATICS', 'Cylinders', 'EA', 80, 200, 5, '{"bore_mm":50,"stroke_mm":100}', '[]', '["MFG-CONV-OH","MFG-ROBOT-DELTA"]', 'cylinder,pneumatic,actuator'],
    ['MFG-ACT-VLV-52', 'Solenoid Valve 5/2 Way 24VDC', 'VALVE, SOLENOID, 5/2, 24VDC', 'SMC', 'PNEUMATICS', 'Valves', 'EA', 60, 150, 2, '{"voltage":"24VDC","type":"5/2 way"}', '[]', '["MFG-CONV-OH","MFG-PRESS-SERVO","MFG-INJ-MOLD"]', 'valve,solenoid,pneumatic,5/2'],
    ['MFG-ACT-GUIDE-20', 'Linear Guide Rail and Carriage Size 20', 'GUIDE, LINEAR, SIZE 20', 'THK', 'MECHANICAL', 'Linear Motion', 'SET', 200, 500, 14, '{"size":20,"type":"ball_bearing"}', '[]', '["MFG-CNC-VMC","MFG-CNC-LATHE","MFG-ROBOT-SCARA"]', 'guide,linear,rail,carriage']
];

const tx = db.transaction(() => { 
    for (const e of equipment) insEquip.run(...e); 
    for (const p of parts) insPart.run(...p); 
});
tx();

const totalE = db.prepare(`SELECT COUNT(*) as c FROM MasterEquipment WHERE EquipmentTypeID LIKE 'MFG-%'`).get().c;
const totalP = db.prepare(`SELECT COUNT(*) as c FROM MasterParts WHERE MasterPartID LIKE 'MFG-%'`).get().c;

console.log(`✅ Seed Manufacturing & Automotive Complete`);
console.log(`   📦 MFG Equipment Types: ${totalE}`);
console.log(`   📦 MFG Master Parts: ${totalP}`);
db.close();
