# Gemini Prompt — Manufacturing Vertical Full Injection (mfg_inject.sql)

Copy everything below the divider into Gemini 2.5 Pro (Deep Research mode preferred).

---

You are generating a production SQL injection file for an enterprise Industrial Operating System called **Trier OS**. The target database is `mfg_master.db` (SQLite). Every value you provide MUST be real, verifiable, and accurate. No made-up phone numbers, no made-up websites, no boilerplate filler text. I will run an automated validator against your output before touching the database, and it will reject any boilerplate or fabricated contact information.

---

## CONTEXT

The Manufacturing & Automotive vertical in Trier OS is partially populated. You must expand it to full coverage by generating INSERT statements for four tables:

1. **MasterVendors** — 20 new vendor records
2. **MasterEquipment** — 40 new equipment type records
3. **MasterParts** — 79 new part records
4. **MasterWarrantyTemplates** — 52 warranty templates (all MFG equipment types: 12 existing + 40 new)

All INSERT statements must use `INSERT OR IGNORE INTO` (idempotent). Output a single file `mfg_inject.sql` with all four sections in the order: vendors → equipment → parts → warranties.

---

## TABLE SCHEMAS

### MasterVendors
```sql
INSERT OR IGNORE INTO MasterVendors
  (VendorID, CompanyName, Website, Phone, Address, Region, Categories, WarrantyPolicy, ServiceSLA, SalesRepName, SalesRepPhone, SalesRepEmail)
VALUES (...);
```
- `VendorID`: SCREAMING_SNAKE_CASE, max 20 chars, unique
- `Categories`: JSON array string e.g. `'["CNC Machines","Turning Centers"]'`
- `WarrantyPolicy`: 1–2 sentences describing their actual warranty terms
- `ServiceSLA`: realistic response commitment (e.g. "24-hour emergency phone; 48–72-hour on-site response")
- `SalesRepName`, `SalesRepPhone`, `SalesRepEmail`: use the manufacturer's **national sales / customer service contact** — real published numbers only (use `sales@domain.com` style if a direct rep email is not publicly available)

### MasterEquipment
```sql
INSERT OR IGNORE INTO MasterEquipment
  (EquipmentTypeID, Description, Category, TypicalMakers, PMIntervalDays, CommonFailureModes,
   ExpectedMTBF_Hours, ExpectedMTTR_Hours, UsefulLifeYears, TypicalWarrantyMonths, Specifications)
VALUES (...);
```
- `EquipmentTypeID`: exactly as specified in the target list below — do not alter
- `Category`: one of `PRODUCTION`, `ASSEMBLY`, `FINISHING`, `QUALITY`, `LOGISTICS`, `UTILITIES`
- `TypicalMakers`: JSON array of 3–5 real OEM brand names
- `CommonFailureModes`: JSON array of 4–6 snake_case failure mode strings (specific to that machine type)
- `ExpectedMTBF_Hours`: integer, industry-typical value
- `ExpectedMTTR_Hours`: integer, typical repair time
- `UsefulLifeYears`: integer
- `TypicalWarrantyMonths`: integer
- `Specifications`: JSON object with relevant technical parameters (power, tonnage, travel, accuracy, etc.)

### MasterParts
```sql
INSERT OR IGNORE INTO MasterParts
  (MasterPartID, Description, StandardizedName, Manufacturer, Category, SubCategory,
   UOM, TypicalPriceMin, TypicalPriceMax, LeadTimeDays, Specifications,
   AlternatePartNumbers, EquipmentTypes, Tags)
VALUES (...);
```
- `MasterPartID`: `MFG-` prefix, then category abbreviation, then descriptor — e.g. `MFG-TOOL-EM-050`
- `Description`: full part name with key specs (size, material, spec standard)
- `StandardizedName`: short generic name (e.g. "Carbide End Mill 4-Flute 1/2in")
- `Manufacturer`: real OEM brand name
- `Category`: one of `BEARINGS`, `ELECTRICAL`, `MECHANICAL`, `PNEUMATICS`, `TOOLING`, `SEALS`, `FLUIDS`, `FILTRATION`, `SAFETY`, `HYDRAULICS`
- `UOM`: `EA`, `BOX`, `SET`, `L`, `KG`, `M`, `PAIR`
- `TypicalPriceMin`, `TypicalPriceMax`: realistic USD prices (integers)
- `LeadTimeDays`: typical order-to-receipt days
- `Specifications`: JSON with relevant specs
- `AlternatePartNumbers`: comma-separated OEM cross-references (or empty string)
- `EquipmentTypes`: JSON array of which MFG equipment types use this part
- `Tags`: comma-separated search tags

### MasterWarrantyTemplates
```sql
INSERT OR IGNORE INTO MasterWarrantyTemplates
  (EquipmentType, VendorID, TypicalMonths, CoverageDescription, Exclusions, ClaimProcess, ExtendedOptions)
VALUES (...);
```
- `EquipmentType`: exact EquipmentTypeID string
- `VendorID`: must exactly match a VendorID that exists in MasterVendors (see allowed list below)
- `TypicalMonths`: integer, typically 12–36
- `CoverageDescription`: 2–3 sentences. Must be SPECIFIC to that equipment type. Describe what mechanical, electrical, and control subsystems are covered. Name the actual machine type.
- `Exclusions`: 2–3 sentences. SPECIFIC to that equipment type. Name actual wear components, chemical attack scenarios, or misuse conditions relevant to that machine.
- `ClaimProcess`: 2–3 sentences. Include REAL vendor name, REAL phone number, and REAL claim procedure (e.g. RMA process, field dispatch, portal URL). No made-up numbers.
- `ExtendedOptions`: 1 sentence describing what extended agreements are available.

---

## QUALITY RULES — ENFORCED BY AUTOMATED VALIDATOR

**CRITICAL failures (will reject the entire file):**
1. Any `CoverageDescription`, `Exclusions`, or `ClaimProcess` containing these boilerplate phrases:
   - "standard parts and labor"
   - "wear parts such as seals, gaskets"
   - "mechanical components, motors, and controls against manufacturing defects"
   - "contact the vendor"
   - "submit claim via vendor portal"
   - "30 days of failure"
   - "within 30 days of failure"
2. Any VendorID in a warranty row that does not exist in the allowed vendor list
3. Duplicate `CoverageDescription` text across any two warranty rows
4. Any non-legacy equipment with `TypicalMonths = 0`
5. `ClaimProcess` shorter than 40 characters
6. `CoverageDescription` shorter than 60 characters

**WARNINGS (fix before submitting):**
- Any vendor pairing that makes no domain sense (e.g. Lincoln Electric warranting a CMM)
- Any ClaimProcess that does not include a real phone number

---

## EXISTING VENDORS (already in database — do NOT re-insert, but you MAY reference their VendorID in warranty rows)

```
ABB_ROBOT, ALFA_LAVAL, ALFA_LAVAL_V, ALLEN_BRADLEY, AMPCO, ATLAS_COPCO, BALDOR,
CENTRAL_STATES, CLEAVER_BROOKS, CROWN, DIVERSEY, DODGE, DORNER, ECOLAB, ELOPAK,
EMERSON, ENDRESS, EVERGREEN, FANUC, FOSS, FRICK, FRISTAM, GATES, GEA_GROUP,
HACH, HYTROL, INGERSOLL, INTRALOX, MARKEM, MARTIN, METTLER_TOLEDO, NELSON_JAMESON,
NORD, NSK, REXNORD, RITE_HITE, SANI_MATIC, SEW_EURODRIVE, SIEMENS, SKF,
SPX_FLOW, TETRA_PAK, TIMKEN, TOPLLINE, TOYOTA_FL, VIDEOJET, VILTER, WAUKESHA, WEG, WEXXAR
```

---

## SECTION 1 — NEW VENDORS TO ADD (20 records)

Add these vendors. All phone numbers and websites must be real and verified:

| VendorID | Company | Why needed |
|---|---|---|
| HAAS_AUTO | Haas Automation | CNC mills, lathes, turning centers |
| MAZAK | Yamazaki Mazak | CNC turning/machining centers |
| DMG_MORI | DMG Mori | High-end CNC machine tools |
| OKUMA | Okuma America | CNC lathes, machining centers |
| LINCOLN_ELEC | Lincoln Electric | MIG/TIG/stick welding equipment |
| MILLER_WELD | Miller Electric | MIG/TIG/plasma welding equipment |
| HYPERTHERM | Hypertherm (Kennametal) | Plasma and waterjet cutting systems |
| TRUMPF | TRUMPF Inc. | Fiber laser cutting, press brakes, bending |
| AMADA | Amada America | Press brakes, laser systems, punch presses |
| KUKA_ROB | KUKA Robotics | Welding robots, heavy payload arms |
| YASKAWA | Yaskawa America / Motoman | Welding/assembly robots |
| UNIVERSAL_ROB | Universal Robots | Cobots (UR3, UR5, UR10, UR16) |
| ZEISS_IND | Carl Zeiss Industrial Metrology | CMM, optical measurement |
| HEXAGON_MI | Hexagon Manufacturing Intelligence | CMM, laser trackers, SPC software |
| KEYENCE | Keyence Corporation of America | Machine vision, laser sensors, confocal |
| COGNEX | Cognex Corporation | Machine vision, barcode readers |
| BOSCH_REX | Bosch Rexroth | Hydraulics, servo drives, linear motion |
| PARKER_HAN | Parker Hannifin | Hydraulic cylinders, pneumatics, filtration |
| SULLAIR | Sullair (Hitachi) | Rotary screw air compressors |
| DÜRR_SYS | Dürr Systems AG | Paint booths, cleaning systems, ovens |

For each vendor provide: real website, real national service phone (not a local branch), real address (HQ or US HQ), Region: "North America", real WarrantyPolicy and ServiceSLA, and a real generic sales/service contact (published national line).

---

## SECTION 2 — NEW EQUIPMENT TYPES TO ADD (40 records)

Add exactly these 40 EquipmentTypeIDs. Do not rename them:

### PRODUCTION (18)
| EquipmentTypeID | Description |
|---|---|
| MFG-LASER-FIBER | Fiber laser cutting system |
| MFG-LASER-CO2 | CO₂ laser cutter |
| MFG-WATERJET | Waterjet cutting system (abrasive/pure) |
| MFG-PRESS-HYDRO | Hydraulic press |
| MFG-PRESS-BRAKE | CNC press brake |
| MFG-PRESS-MECH | Mechanical punch press / turret press |
| MFG-WELD-MIG | MIG/GMAW welding cell (manual or semi-auto) |
| MFG-WELD-SPOT | Resistance spot welder |
| MFG-WELD-ROBOT | Robotic MIG/TIG welding cell |
| MFG-WELD-LASER | Laser welding system |
| MFG-GRINDER-SURF | Surface grinder (reciprocating or rotary) |
| MFG-GRINDER-CYL | Cylindrical grinder (OD/ID) |
| MFG-EDM-WIRE | Wire EDM |
| MFG-EDM-SINK | Sinker / ram EDM |
| MFG-DEBURR | Vibratory / abrasive-belt deburring machine |
| MFG-INJ-MOLD-LG | Large-tonnage injection molding machine (>500T) |
| MFG-BLOW-MOLD | Blow molding machine |
| MFG-EXTRUDER | Plastic / rubber extruder |

### FINISHING (4)
| EquipmentTypeID | Description |
|---|---|
| MFG-PAINT-BOOTH | Liquid spray paint booth with exhaust |
| MFG-POWDER-COAT | Powder coat booth and cure oven |
| MFG-HEAT-TREAT | Industrial batch heat treatment furnace |
| MFG-PARTS-WASH | Aqueous / solvent parts washer |

### ASSEMBLY (4)
| EquipmentTypeID | Description |
|---|---|
| MFG-CONV-BELT-IND | Industrial flat belt conveyor (assembly line) |
| MFG-CONV-ROLLER-IND | Gravity / powered roller conveyor line |
| MFG-ASSEMBLY-ROBOT | Robotic precision assembly cell |
| MFG-TURNTABLE | Rotary indexing table / dial table |

### QUALITY (5)
| EquipmentTypeID | Description |
|---|---|
| MFG-VISION-SYS | Machine vision / AOI inspection system |
| MFG-LEAK-TEST | Pressure / leak tester |
| MFG-HARDNESS-TEST | Hardness tester (Rockwell / Brinell / Vickers) |
| MFG-SPC-STATION | SPC measurement / gauging station |
| MFG-PROFILOMETER | Surface roughness / contour profilometer |

### LOGISTICS (4)
| EquipmentTypeID | Description |
|---|---|
| MFG-CRANE-BRIDGE | Bridge / overhead traveling crane |
| MFG-CRANE-JIB | Jib crane (wall or column mount) |
| MFG-FORKLIFT-ELEC | Electric counterbalance forklift |
| MFG-TUGGER-EV | EV tugger / tow tractor |

### UTILITIES (5)
| EquipmentTypeID | Description |
|---|---|
| MFG-COMPRESS-AIR | Industrial rotary screw air compressor |
| MFG-COOLANT-CENT | Central coolant / chip filtration system |
| MFG-CHILLER-IND | Industrial process chiller |
| MFG-HYD-POWER | Hydraulic power unit (HPU) |
| MFG-DUST-COLLECT | Dust collector / fume extractor |

For each equipment row, provide:
- Realistic `TypicalMakers` (3–5 actual OEM brands that make exactly this machine)
- Realistic `CommonFailureModes` (4–6 failures specific to that machine type, snake_case)
- Realistic `ExpectedMTBF_Hours`, `ExpectedMTTR_Hours`, `UsefulLifeYears`, `TypicalWarrantyMonths`
- `Specifications` as a JSON object with the 3–5 most operationally relevant specs (power kW, max force kN, cutting area, accuracy, etc.)

---

## SECTION 3 — NEW PARTS TO ADD (79 records)

Use prefix `MFG-` then a short category code. Cover these categories and approximate counts:

| Category | SubCategory focus | Target count |
|---|---|---|
| TOOLING | Carbide end mills, drills, inserts, boring bars, reamers, tap sets, saw blades, grinding wheels | 20 |
| HYDRAULICS | Hydraulic seals, filters, pump repair kits, cylinders, directional valves, pressure gauges, hoses | 10 |
| ELECTRICAL | Servo drives (various kW), servo motors, PLC I/O modules, encoder cables, contactors, fuses, VFD filters | 10 |
| BEARINGS | Angular contact, tapered roller, linear guide trucks, ball screw nuts, crossed roller rings | 8 |
| SEALS | Wiper seals, hydraulic piston seals, O-ring kits, lip seals, labyrinth seals | 6 |
| PNEUMATICS | FRL units, solenoid valves (5/3 way), pneumatic cylinders (various bores), air guns, blow-off nozzles | 6 |
| FLUIDS | Cutting oil (water-soluble), hydraulic fluid ISO 46, gear oil ISO 220, slideway oil, rust inhibitor | 5 |
| FILTRATION | Coolant filter elements, hydraulic filter cartridges, compressed air coalescing filters, mist collector media | 5 |
| MECHANICAL | Tool holders (HSK-A63, BT40, CAT40), collet chucks, vise jaws, workholding clamps, cam followers | 5 |
| SAFETY | Laser safety curtain, light curtain replacement elements, safety relay modules, e-stop assemblies | 4 |

Rules for parts:
- `MasterPartID` format: `MFG-{CAT}-{DESCRIPTOR}` where CAT = TOOL, HYD, ELEC, BRG, SEAL, PNEU, FLUID, FILT, MECH, SAFE
- Every part must have a real `Manufacturer` (actual brand — Sandvik, Kennametal, Parker, Bosch Rexroth, NSK, etc.)
- `EquipmentTypes` must list which MFG equipment types actually use this part (JSON array)
- `AlternatePartNumbers` must be left as empty string `''` if no real cross-reference is known — do NOT invent part numbers
- `TypicalPriceMin` and `TypicalPriceMax` must be realistic USD (integer) market prices

---

## SECTION 4 — WARRANTY TEMPLATES (52 records)

One warranty template per MFG equipment type. Cover ALL 52 types: the 12 that already exist plus the 40 new ones.

**Existing 12 types that need warranty rows:**
`MFG-AGV`, `MFG-CONV-OH`, `MFG-ROBOT-DELTA`, `MFG-CNC-LATHE`, `MFG-CNC-VMC`, `MFG-DIE-CAST`, `MFG-INJ-MOLD`, `MFG-PRESS-SERVO`, `MFG-ROBOT-6AXIS`, `MFG-ROBOT-COBOT`, `MFG-ROBOT-SCARA`, `MFG-CMM`

**New 40 types** (from Section 2 above).

### Vendor assignment guidance for warranties

Use the most appropriate vendor from the combined list (existing + new). Suggested primary assignments:

| Equipment Class | Use vendor |
|---|---|
| CNC machines (lathe, VMC) | HAAS_AUTO or MAZAK |
| Fiber laser cutting | TRUMPF |
| CO₂ laser cutting | TRUMPF or MAZAK |
| Waterjet | HYPERTHERM |
| Press brake | AMADA |
| Hydraulic / mechanical press | AMADA or BOSCH_REX |
| MIG/TIG welding cells | LINCOLN_ELEC or MILLER_WELD |
| Robotic welding | KUKA_ROB or YASKAWA |
| Laser welding | TRUMPF |
| Spot welder | MILLER_WELD |
| 6-axis robots (non-welding) | FANUC or ABB_ROBOT |
| SCARA robots | FANUC |
| Delta / pick-place | ABB_ROBOT |
| Cobots | UNIVERSAL_ROB |
| AGV | ABB_ROBOT or FANUC |
| CMM | ZEISS_IND or HEXAGON_MI |
| Machine vision | KEYENCE or COGNEX |
| Hardness tester | HEXAGON_MI |
| Profilometer / SPC | HEXAGON_MI or KEYENCE |
| Injection molding | DMG_MORI (controls), or use general SIEMENS if no molder vendor added |
| Die casting | use SIEMENS or BOSCH_REX |
| Extruder / blow mold | use SIEMENS |
| Surface / cylindrical grinder | DMG_MORI or MAZAK |
| EDM (wire/sinker) | DMG_MORI |
| Deburring | DÜRR_SYS |
| Paint booth / powder coat | DÜRR_SYS |
| Heat treat furnace | use SIEMENS |
| Parts washer | DÜRR_SYS |
| Belt/roller conveyor | HYTROL or DORNER |
| Overhead conveyor | HYTROL |
| Assembly robot | FANUC or YASKAWA |
| Rotary indexing table | BOSCH_REX |
| Bridge / jib crane | use ALLEN_BRADLEY (controls) or SIEMENS — note: for crane structure, crane OEMs like R&M exist but aren't in DB; use SIEMENS for the control package |
| Electric forklift | TOYOTA_FL or CROWN |
| EV tugger | TOYOTA_FL |
| Air compressor | SULLAIR or ATLAS_COPCO |
| Coolant system | DÜRR_SYS |
| Process chiller | use SIEMENS or ATLAS_COPCO |
| HPU | BOSCH_REX or PARKER_HAN |
| Dust collector | use SIEMENS or DÜRR_SYS |

### Warranty row requirements (machine-specific examples to guide your style)

**FIBER LASER CUTTING (MFG-LASER-FIBER):**
- CoverageDescription: Cover the laser source (IPG, nLIGHT, or Coherent module), beam delivery optics, CNC motion axes, servo drives, and cutting head mechanics against manufacturing defects for the full warranty term. Excludes fiber connector contamination and crash-damaged nozzles.
- Exclusions: Protective windows, nozzles, and lens assemblies are consumables and not covered. Damage resulting from incorrect assist gas purity (nitrogen <99.99% or oxygen <99.5%) voids coverage on optics. Collision damage to cutting head and slat wear are excluded.
- ClaimProcess: Call TRUMPF Service at 1-888-878-6786 to open a case number. A TRUMPF field application engineer will diagnose remotely via TruConnect; on-site service dispatched within 2–3 business days for laser source issues.

**COBOT (MFG-ROBOT-COBOT):**
- CoverageDescription: Universal Robots covers the UR arm joints, controller cabinet, teach pendant, and embedded safety system software against defects in materials and workmanship for 24 months from shipment date.
- Exclusions: End-of-arm tooling (grippers, sensors) supplied by third parties is excluded. Damage from exceeding payload rating, collision without force-limiting parameters set correctly, or customer-modified software is not covered.
- ClaimProcess: Contact Universal Robots technical support at 1-844-462-6268 or submit a case at myUR.universal-robots.com. For joint or controller failures, UR will ship a replacement module within 2 business days and provide a prepaid return label for the defective unit.

Write all 52 rows following this level of specificity. Every row must have a different CoverageDescription. Do not copy-paste and change only the equipment name — each machine class has distinctly different covered components, failure modes, and claim procedures.

---

## OUTPUT FORMAT

Single file, exactly this structure:

```sql
-- mfg_inject.sql  Manufacturing & Automotive vertical — full injection
-- Generated for Trier OS mfg_master.db
-- Tables: MasterVendors, MasterEquipment, MasterParts, MasterWarrantyTemplates

-- ══════════════════════════════════════════════════════
-- SECTION 1: VENDORS (20 new records)
-- ══════════════════════════════════════════════════════

INSERT OR IGNORE INTO MasterVendors (...) VALUES (...);
-- ... 19 more

-- ══════════════════════════════════════════════════════
-- SECTION 2: EQUIPMENT (40 new records)
-- ══════════════════════════════════════════════════════

INSERT OR IGNORE INTO MasterEquipment (...) VALUES (...);
-- ... 39 more

-- ══════════════════════════════════════════════════════
-- SECTION 3: PARTS (79 new records)
-- ══════════════════════════════════════════════════════

INSERT OR IGNORE INTO MasterParts (...) VALUES (...);
-- ... 78 more

-- ══════════════════════════════════════════════════════
-- SECTION 4: WARRANTY TEMPLATES (52 records)
-- ══════════════════════════════════════════════════════

INSERT OR IGNORE INTO MasterWarrantyTemplates (...) VALUES (...);
-- ... 51 more
```

Single-quoted strings. Escape internal single quotes as `''`. No semicolons inside values. No multi-row INSERT syntax — one INSERT per row for easy diffing and partial rollback.

Save the output as: `G:\Trier OS\scripts\mfg_inject.sql`

---

## VERIFICATION CHECKLIST BEFORE SUBMITTING

Before outputting the SQL, verify:
- [ ] All 20 VendorIDs in Section 1 are unique and ≤20 chars
- [ ] All 40 new EquipmentTypeIDs exactly match the target list (no renames)
- [ ] All 79 MasterPartIDs start with `MFG-` and are unique
- [ ] All 52 warranty rows reference a VendorID from the allowed list (existing + new)
- [ ] No two warranty rows have the same CoverageDescription text
- [ ] No CoverageDescription contains "standard parts and labor", "wear parts such as", "contact the vendor", "30 days of failure", "submit claim via"
- [ ] Every ClaimProcess includes a real phone number
- [ ] Phone numbers in ClaimProcess match the actual vendor (cross-check against Section 1)
- [ ] Every non-legacy equipment type has TypicalMonths > 0
