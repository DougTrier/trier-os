�# UWB Anchor Installation Guide
## Trier OS � Trier OS Platform

> **Status:** Reference document � created 2026-04-03  
> **Scope:** Anchor placement, cabling, and commissioning for UWB RTLS

---

## Overview

UWB anchors are fixed reference points whose positions are precisely surveyed. Tags compute their own position via time-difference-of-arrival (TDoA) or two-way ranging (TWR) against these anchors. Anchor placement quality is the single largest determinant of system accuracy.

---

## Geometry Principles

### Minimum Anchors

| Mode | Minimum Anchors | Recommended |
|---|---|---|
| 2D positioning (flat floor) | 3 | 4�6 |
| 3D positioning (multi-level or tall racks) | 4 | 6�8 |

### Placement Rules

1. **Form a convex hull** � anchors should surround the coverage area, not cluster in one corner.
2. **Even angular spacing** � for 4 anchors in a rectangular room, place one near each corner.
3. **Height** � mount at 2.5�3.5m above floor level (above forklift mast height, below HVAC obstructions).
4. **Line of sight** � UWB signals pass through drywall but are significantly attenuated by steel shelving, concrete columns, and machinery. Anchors must have clear sight lines to the majority of the coverage area.
5. **GDOP margin** � keep the geometric dilution of precision (GDOP) below 3.0 by avoiding collinear anchor arrangements.

### Coverage Area per Anchor Set

| Environment | Reliable Coverage |
|---|---|
| Open floor (warehouse, assembly) | 40m � 40m with 4 anchors |
| Dense racking or machinery | 20m � 20m with 4 anchors (add anchors for larger areas) |
| Multi-zone facility | Overlap zones by 3�5m for seamless handoff |

---

## Channel Assignment

UWB operates in multiple channels (IEEE 802.15.4z). Assign distinct channels to adjacent anchor zones to avoid interference:

| Zone | Recommended Channel |
|---|---|
| Zone A (primary) | Channel 5 (6.5 GHz center) |
| Zone B (adjacent) | Channel 9 (8.0 GHz center) |
| Zone C (adjacent to B) | Channel 5 (reuse with �0�3m buffer) |

Pozyx and Sewio anchors are configured via their respective web UIs. Zebra anchors are configured via MPact Studio.

---

## Power and Cabling

| Option | Cable | Notes |
|---|---|---|
| **PoE (recommended)** | CAT6 ethernet | Clean installation; single cable per anchor; requires PoE switch |
| **DC power** | 12V or 5V (vendor-dependent) | Use when ethernet runs are impractical |
| **Battery** | Internal (Pozyx mobile anchors) | Temporary deployment only; sync degrades over time |

**PoE switch recommendation:** Unmanaged 8-port PoE+ (802.3at, 30W per port). One switch can serve 6�7 anchors with headroom.

---

## Anchor Coordinate Survey

Anchors must be surveyed with millimeter accuracy. Use one of:

1. **Total station / laser tracker** � most accurate; use if facility has an existing survey grid
2. **Tape measure + laser distance** � adequate for PoC; measure from known reference corners
3. **GNSS RTK** � not practical indoors

Record anchor positions in the **Trier coordinate system** (metres from facility origin, X = east, Y = north, Z = elevation above finished floor):

| Anchor ID | X (m) | Y (m) | Z (m) | Location Description |
|---|---|---|---|---|
| A1 | 0.00 | 0.00 | 2.80 | SW corner, column C1 |
| A2 | 38.40 | 0.00 | 2.80 | SE corner, column C8 |
| A3 | 38.40 | 22.10 | 2.80 | NE corner, column C16 |
| A4 | 0.00 | 22.10 | 2.80 | NW corner, column C9 |

Enter these coordinates into the vendor configuration UI during commissioning.

---

## Per-Facility Planning Worksheet

Copy this worksheet for each Trier OS plant.

### Facility: _____________________________ Date: _______________

| Item | Value |
|---|---|
| Floor area (m²) | |
| Number of floors / zones | |
| Zones with dense racking (Y/N) | |
| Target accuracy (cm) | |
| Estimated anchor count | |
| Power method (PoE / DC / Battery) | |
| Ethernet switch location | |
| Vendor selected | |
| UWB channel plan | |

**Anchor positions (fill in after survey):**

| Anchor | X (m) | Y (m) | Z (m) | Status |
|---|---|---|---|---|
| A1 | | | | �ܐ Mounted �ܐ Cabled �ܐ Configured |
| A2 | | | | �ܐ Mounted �ܐ Cabled �ܐ Configured |
| A3 | | | | �ܐ Mounted �ܐ Cabled �ܐ Configured |
| A4 | | | | �ܐ Mounted �ܐ Cabled �ܐ Configured |
| A5 | | | | �ܐ Mounted �ܐ Cabled �ܐ Configured |
| A6 | | | | �ܐ Mounted �ܐ Cabled �ܐ Configured |

---

## Commissioning Steps

1. Mount anchors per the geometry plan above.
2. Run ethernet / power cabling.
3. Power on and verify each anchor appears in vendor UI.
4. Enter surveyed anchor coordinates in vendor configuration.
5. Enter the vendor host IP and port in Trier OS `uwb_config` table (see `References/UWB_Hardware.md`).
6. Set `vendorType` and restart the Trier OS server � broker will connect automatically.
7. Open `FloorPlanView` �  Edit Mode �  UWB Calibration panel. Set:
   - **Origin X/Y** � floor plan coordinates (in metres) of the UWB coordinate system origin (usually Anchor A1)
   - **Scale X/Y** � percentage of floor plan width/height per metre of UWB space
8. Click **Save Calibration** � live dots should appear on the floor plan immediately.
9. Walk a tag through the space and verify dot tracks the expected path.
10. Adjust Scale X/Y if dots are offset by a consistent factor.

---

## Troubleshooting

| Symptom | Likely Cause | Fix |
|---|---|---|
| Dots frozen / not updating | Broker not connected to vendor | Check `uwb_config` host/port; verify vendor service running |
| Dots jump erratically | Anchor line-of-sight blocked | Add anchor to cover obstruction |
| Dots consistently offset | Wrong scale or origin calibration | Adjust Scale X/Y in FloorPlanView edit mode |
| High GDOP error in vendor UI | Anchors too close together or collinear | Reposition anchors per geometry rules |
| Tag not appearing | Tag not registered in Trier tag registry | `POST /api/uwb/tags` to register |
| Lone worker alerts not firing | Tag update rate too low | Increase tag beacon rate to �0�1 Hz in vendor UI |
