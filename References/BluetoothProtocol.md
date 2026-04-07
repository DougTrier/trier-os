# Trier OS — BLE Protocol Reference

**Version:** 1.0  
**Date:** 2026-04-03  
**Status:** Implemented (Phase 1 & 2 complete)

---

## Service & Characteristic UUIDs

All Trier OS BLE devices advertise a primary **Asset Beacon Service** and an optional **Sensor Service**.

### Asset Beacon Service

| Role | UUID |
|------|------|
| Service | `6e4c0001-b5a3-f393-e0a9-e50e24dcca9e` |
| Asset ID Characteristic | `6e4c0002-b5a3-f393-e0a9-e50e24dcca9e` |

**Asset ID Characteristic:**
- Properties: `READ`
- Format: UTF-8 string, max 64 bytes
- Value: The Trier OS Asset ID (e.g. `PUMP-001`, `CONV-A3`)
- Encoding: Plain ASCII, no null terminator required

---

### Sensor Service

| Characteristic | UUID | Properties | Format |
|----------------|------|-----------|--------|
| Service | `6e4c0010-b5a3-f393-e0a9-e50e24dcca9e` | — | — |
| Temperature | `6e4c0011-b5a3-f393-e0a9-e50e24dcca9e` | NOTIFY | float32 LE, °C |
| Vibration RMS | `6e4c0012-b5a3-f393-e0a9-e50e24dcca9e` | NOTIFY | float32 LE, mm/s |
| Pressure | `6e4c0013-b5a3-f393-e0a9-e50e24dcca9e` | NOTIFY | float32 LE, bar |

**Byte layout for all sensor characteristics:**
```
Offset  Size   Type       Description
------  ----   ----       -----------
0       4      float32    Sensor value (little-endian IEEE 754)
```

**Notification rate:** 1 Hz (1 update per second)

---

## Advertising Payload

Trier OS asset beacons must include the following in their advertising packet:

```
Service UUID:       6e4c0001-b5a3-f393-e0a9-e50e24dcca9e
Local Name:         TRIER-<AssetID>   (e.g. "TRIER-PUMP-001")
TX Power Level:     -59 dBm @ 1 m
```

The TX Power value is used by the `useBluetooth` hook for RSSI-to-distance conversion.

---

## RSSI → Distance Conversion

Uses the log-distance path loss model:

```
d = 10 ^ ((TxPower − RSSI) / (10 × n))
```

| Parameter | Value |
|-----------|-------|
| TxPower | -59 dBm |
| n (path loss exponent) | 2.0 (open space) / 2.5–3.5 (indoors) |
| Proximity threshold (auto-populate) | < 0.5 m |

---

## Trilateration (Indoor Positioning — Phase 4)

Requires ≥ 3 fixed anchor beacons with known floor-plan coordinates (x, y in metres from floor-plan origin).

Anchor records are stored in `ble_anchors` (trier_logistics.db):

```
ID, PlantID, FloorID, Mac, Label, X, Y, TxPower, InstallDate
```

Position is computed by weighted centroid:

```
w_i  = 1 / d_i²
x_est = Σ(w_i × x_i) / Σ(w_i)
y_est = Σ(w_i × y_i) / Σ(w_i)
```

Typical accuracy: ±2–5 m depending on anchor density and RF environment.

---

## Hardware Reference

### Compatible Beacon Hardware

| Hardware | Interface | Notes |
|----------|-----------|-------|
| Nordic Semiconductor nRF52840 | Custom firmware | Full Trier OS UUID support |
| Espressif ESP32 | Arduino/ESP-IDF | Recommended for DIY beacons |
| Minew E7 iBeacon | Pre-configured | Read-only; use as proximity-only, no write |
| Blue Charm BCN10 | iBeacon/Eddystone | Use for anchor beacons only |
| Kontakt.io Smart Beacon | BLE 5.0 | Enterprise grade; supports GATT writes |

### Compatible Sensor Hardware

| Hardware | Sensors | Notes |
|----------|---------|-------|
| Blues Wireless Notecard | Temp, accel | Cellular + BLE; ideal for outdoor assets |
| Ruuvi Tag RuuviTag Pro | Temp, humidity, pressure, accel | Open-source firmware available |
| Nordic Thingy:53 | Temp, pressure, humidity, air quality | Dev kit; good for PoC |

---

## Implementation Files

| File | Purpose |
|------|---------|
| `src/hooks/useBluetooth.js` | Web Bluetooth API hook |
| `src/utils/bleTrilaterate.js` | Trilateration + floor-plan coordinate mapping |
| `src/components/BluetoothPanel.jsx` | Device scanner & pairing UI |
| `server/routes/ble_beacons.js` | Beacon registry + anchor + threshold APIs |
| `server/migrations/026_ble_beacon_mac.js` | Adds BleBeaconMac to Asset table |
