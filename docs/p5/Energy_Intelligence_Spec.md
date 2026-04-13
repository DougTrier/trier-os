# Energy Sub-Metering & Intelligence — Spec
> Trier OS P5 · kWh normalization, demand optimization, hardware integration

---

## What's Already Running

`routes/energy.js` (mounted at `/api/energy`) provides:

- **Meter readings**: manual entry + generic SCADA push (`POST /reading`)
- **TOU rate engine**: peak/mid-peak/off-peak tiers with configurable schedules
- **Arbitrage engine**: identifies schedulable loads in peak windows and recommends shifting to off-peak
- **Asset load profiles**: `EnergyAssetLoad` table tags high-consumption assets
- **Annual reporting**: month-by-month summary by energy type

---

## Gap 1: kWh Per Unit of Output

**What's needed**: Normalize energy consumption against production volume to get `kWh/unit` (kWh per gallon, kWh per kg, etc.)

**How to implement**:
1. Link energy readings to production records by shift/date:
   - `EnergyReadings.PeriodStart` + `PeriodEnd` match to production shifts
   - Production volume from `plant_setup` (SKU outputs, batch records) or manual entry
2. Add a `ProductionVolume` and `ProductionUnit` column to `EnergyReadings` (additive migration)
3. New endpoint: `GET /api/energy/intensity` — returns kWh/unit for each meter by period

**Migration**: Single `ALTER TABLE EnergyReadings ADD COLUMN ProductionVolume REAL` + `ADD COLUMN ProductionUnit TEXT`.

---

## Gap 2: Shift-Level Demand Optimization

**What's needed**: Know which loads are running on which shift and optimize load scheduling to minimize peak demand charges.

**Current state**: TOU arbitrage engine (`GET /api/energy/arbitrage`) identifies peak-window loads but doesn't have shift granularity.

**Enhancement path**:
1. Tag `EnergyAssetLoad` records with a typical shift pattern (`ShiftPattern TEXT`)
2. Arbitrage engine filters by shift when evaluating shift-able loads
3. Integrate with shift schedule from `plant_setup` (shift calendar already exists)

**Risk**: Low. All additive changes to existing tables and logic.

---

## Gap 3: Hardware Integration (Sub-Meter / Modbus)

**Current state**: Readings are entered manually or via generic SCADA push. No native Modbus polling for energy meters.

**What's needed for real-time sub-metering**:

1. **Meter profile in device registry**: Add energy meter type to `routes/device-registry.js` — Modbus TCP register map for kWh, kW demand, power factor
2. **EdgeAgent energy worker**: Extend the existing EdgeAgent (Modbus polling) to poll energy meter registers on a 15-minute cycle and POST to `/api/energy/reading`
3. **Supported meter protocols**: 
   - Modbus RTU/TCP (most industrial kWh meters)
   - BACnet (HVAC/building meters)
   - DLMS/COSEM (utility-grade smart meters)
4. **Register map library**: Each meter model has different register offsets. A small library of common meter profiles (Schneider PM series, ABB B-series, Accuenergy AcuRev) would eliminate manual configuration.

**This is a hardware dependency** — cannot be fully tested without physical sub-meters wired to the plant's electrical distribution. Document here; implement when the first pilot plant installs sub-meters.

---

## Recommended Implementation Order

1. `ProductionVolume` column on `EnergyReadings` (1 migration, 1 endpoint) — no hardware required, immediate value
2. Shift-aware arbitrage enhancement — no hardware required, improves TOU savings calculation
3. Device registry meter type — groundwork for hardware integration
4. Modbus EdgeAgent energy worker — requires hardware at site
5. Meter profile library — ongoing, grows with customer installs
