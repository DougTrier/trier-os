# Trier OS — Documentation Update Task List
**Generated:** April 26, 2026  
**Scope:** Manual gaps, i18n coverage, and content corrections driven by changes since April 23, 2026  
**Target:** `AboutView.jsx` (Operational Intelligence Manual) + all 11 i18n language files  

---

## 🔁 LIVE PROGRESS TRACKER
> **For resuming agents:** Execute tasks in Phase order. Check off each task immediately after completion. Run `npm run build` after each Phase. The last checked task is your resume point.

| Phase | Task | Description | Status |
|---|---|---|---|
| 0 | Task 14 | Reorder SCADA sections (Floor Plans moved after SCADA Guides) | ✅ DONE |
| 0 | Task 15 | Move Licensing & Support to end of manual | ✅ DONE |
| 1 | Task 1  | Add Audit & History section (s50) to manual | ✅ DONE |
| 1 | Task 2  | Update Mission Control tile list in s11 | ✅ DONE |
| 1 | Task 3  | Add Correctness Invariants section (s51) | ✅ DONE |
| 1 | Task 4  | Add Parallel Universe Engine content to s47 | ✅ DONE |
| 2 | Task 13 | Full renumber: Roman numerals → sequential Arabic (1–52) | ✅ DONE |
| 2 | Task 16 | Remove XVII-B/C/D sub-suffix (covered by Task 13) | ✅ DONE |
| 3 | Task 5  | Competitor table update (s0) | ✅ DONE |
| 3 | Task 7  | Security section update to reflect SOC2 controls doc (s27) | ✅ DONE |
| 3 | Task 8  | Offline replay ordered correction added to s34 | ✅ DONE |
| 4 | Task 11 | Add Audit & History row to feature comparison (s0) | ✅ DONE |
| 4 | Task 12 | Add Invariant System row to feature comparison (s0) | ✅ DONE |
| 5 | Task 9  | Fix duplicate energy.kgCoEst / energy.kgCOEst i18n key | ✅ DONE |
| 5 | Task 10 | Verify s44–s50 appear in manual rendering | ✅ DONE |
| 6 | —       | i18n injection for all new/changed keys | ✅ DONE |
| 7 | —       | npm run build + 11-language browser verification | ✅ BUILD PASS |

**Key files:** `G:\Trier OS\src\components\AboutView.jsx` · `G:\Trier OS\src\i18n\[lang].json` (11 files)  
**Build command:** `npm run build` (run from `G:\Trier OS`)  
**Last completed task:** All phases complete — Phase 7 build PASS (April 26, 2026)
**Resume point:** N/A — all tasks complete. Browser verification of all 11 languages is the final manual step.

---

## Audit Results Summary

| Check | Result |
|---|---|
| Total `manual.*` keys in `en.json` | **2,193** |
| Languages with full `manual.*` coverage | **11 / 11** ✅ |
| Missing keys per language | **0** ✅ |
| Orphaned keys (in lang but not en) | **0** ✅ |
| Duplicate key in i18n files | ⚠️ `energy.kgCoEst` / `energy.kgCOEst` (case collision in all files — see Task 9) |

**The manual i18n is fully synchronized.** All new sections (s44–s49: Digital Twin, SaaS Admin, Operator Trust, Time Machine, Gatekeeper, Edge Mesh) are translated in all 11 languages. The tasks below address *content* gaps — things the manual doesn't yet document that exist in the application.

---

## 🔴 Critical — Content Missing From Manual

### Task 1 — Add Manual Section: Audit & History (Report Center)
**What it is:** The `HistoryDashboard` + `ReportCenter` module — the most recently added Mission Control tile.  
**Gap:** No manual section covers this module. Users have no documentation on how to use it.  
**Action required:**
- Add a new section `manual.s50.*` in `AboutView.jsx`
- Cover: Work Order History tab, Completed PMs tab, Asset Utilization tab, Audit Log tab, Dynamic Reports tab
- Add navigation entry to the manual sidebar/nav
- Inject all `manual.s50.*` keys into all 11 language files via a new inject script
- **i18n keys needed:** `manual.s50.title`, `manual.s50.content`, ~10 `manual.item.17xx` entries

**Files to edit:**
- `src/components/AboutView.jsx`
- `src/i18n/en.json` (source) + all 10 other language files

---

### Task 2 — Update Mission Control Section (s11) — Add Audit & History Tile
**Gap:** Part X "Complete Screen & Button Reference" (s11) lists Mission Control tiles but does not include the new `Audit & History` tile added April 26, 2026.  
**Action required:**
- Find the Mission Control tile reference in `manual.s11.*` content
- Add a row/entry: **Audit & History** — *Work order history, PM history, scan audit log, and dynamic report builder.*
- Update the navigation access path: `Mission Control → Audit & History tile → HistoryDashboard`
- Propagate to all 11 language files

---

### Task 3 — Update Correctness Invariants Section
**Gap:** The manual has no section covering the **13 Architectural Correctness Invariants** or the `/api/invariants/report` endpoint — one of the platform's strongest differentiators.  
**What changed (April 23–26):** 13 invariants were implemented, hardened, and fully documented in `docs/ARCHITECTURE_INVARIANTS.md`. The runtime proof endpoint now returns `overallStatus: PASS`.  
**Action required:**
- Add section `manual.s51.*`: "Architectural Correctness & Invariant System"
- Cover: what invariants are, the 13 guarantees (I-01 through I-13), the `GET /api/invariants/report` endpoint, what `overallStatus: PASS` means
- Position this section near Part XXVI (Testing & Validation, s26)
- Inject all keys into all 11 language files

---

### Task 4 — Add Parallel Universe Engine / Time Machine Section Update
**Gap:** Section s47 covers the Time Machine (rollback/branching) but does not explain the **Parallel Universe Engine** — the pre-deployment simulation that verifies code changes don't alter historical outcomes.  
**Action required:**
- Extend `manual.s47.*` or add `manual.s47b.*` with:
  - What the Parallel Universe Engine does
  - How it differs from the Time Machine (Time Machine = investigation; Parallel Universe = pre-deploy verification)
  - How it connects to the Live Studio IDE deployment workflow
- Inject into all 11 languages

---

## 🟡 Important — Content Corrections

### Task 5 — Fix Comparison Table: Remove Fiix/UpKeep/Limble/eMaint, Add MaintainX/IBM Maximo/SAP
**Gap:** Section s0 (Feature Comparison) compares Trier OS against **Fiix, UpKeep, Limble, MaintainX, eMaint**. The `Comparison.md` executive document (written April 26, 2026) uses **SAP S/4HANA EAM, IBM Maximo, MaintainX** as the primary benchmark set.  
**Action required:**
- Review `manual.s0.*` content and `manual.item.0` through `manual.item.52` for outdated competitor references
- The internal manual can keep Fiix/UpKeep/Limble (they are CMMS-level comparators for floor-level buyers)
- Add a note that SAP EAM and IBM Maximo are the enterprise-tier comparators and link to `Comparison.md`
- No i18n injection needed if only English content is changed — but if new keys are added, inject all 11

---

### Task 6 — Correct Part Numbers in Roman Numerals (Section Numbering Inconsistency)
**Gap:** Section numbering jumps from Part XXVIII (s31) to Part LXIX (s44) — a gap of ~36 part numbers. This confuses users navigating by number.  
**Affected sections:** s35 is "Part LIX", s36 is "Part LX", s37 "Part LXI" — but the preceding section is s34 "Part XXXIII". Numbers LIX–LXXIII do not follow sequentially from XXXIII.  
**Action required:**
- Audit all section title strings from s32 onward
- Renumber to sequential Roman numerals OR switch to plain Arabic numbers (Part 29, Part 30…)
- This is a cosmetic fix in `AboutView.jsx` title strings + all 11 i18n `manual.s*.title` keys
- **Note:** This is a large i18n change — all 11 files need the title keys updated

---

### Task 7 — Update Security Section (s27) — Reflect Current SOC2-Aligned Controls
**Gap:** Part XXIV "Security Testing & Results" (s27) was written before the formal `SECURITY_CONTROLS.md` document was published (April 24, 2026). The controls document is more complete.  
**Action required:**
- Cross-reference `docs/SECURITY_CONTROLS.md` against `manual.s27.*` content
- Add any controls not yet documented: SSRF prevention, AES-256-GCM at-rest encryption, `AsyncLocalStorage` plant scoping
- Add: *"Runtime invariant verification available at `GET /api/invariants/report`"*
- Inject new items into all 11 language files

---

### Task 8 — Update Offline Resilience Section (s34) — Reflect Ordered Replay Fix
**What changed (April 23):** Invariant I-03 was fixed — offline events now sort by `deviceTimestamp` before replay. This was a correctness gap; it is now resolved.  
**Gap:** Section s34 "Offline Resilience & Plant LAN Sync" (Part XXXIII) may describe offline sync without mentioning that events are guaranteed to replay in device-timestamp order.  
**Action required:**
- Add to `manual.s34.*`: *"Offline events queued on the LAN Hub are sorted by device timestamp before replay to the central server. This guarantees work order state transitions are applied in the correct sequence regardless of connectivity restoration order."*
- Inject into all 11 languages

---

## 🟢 Maintenance — Quality & Consistency

### Task 9 — Fix Duplicate i18n Key: `energy.kgCoEst` / `energy.kgCOEst`
**Issue:** All i18n JSON files contain both `energy.kgCoEst` and `energy.kgCOEst` (case difference). The JSON spec allows this but PowerShell's `ConvertFrom-Json` rejects files with these keys, blocking future automated validation.  
**Action required:**
- Determine which key is actually used in the codebase (`grep -r "kgCoEst\|kgCOEst" src/`)
- Remove the unused variant from all 11 JSON files
- Fix the case to be consistent (likely `energy.kgCo2Est` or `energy.kgCOEst`)
- This does not affect the app (JSON.parse picks the last value) but blocks tooling

---

### Task 10 — Verify All `manual.s44`–`manual.s49` Sections Have Nav Entries
**Gap:** The manual sidebar navigation (`AboutView.jsx`) may not list sections s44–s49 if they were added without updating the nav array.  
**Action required:**
- Search `AboutView.jsx` for the navigation array/list that drives the manual sidebar
- Confirm these sections appear: Digital Twin (s44), SaaS Admin (s45), Operator Trust (s46), Time Machine (s47), Gatekeeper (s48), Edge Mesh (s49), Audit & History (s50 — new)
- Add any missing nav entries

---

### Task 11 — Add Manual Entry: Audit & History in Feature Comparison Table (s0)
**Gap:** The comparison table in s0 lists features but does not include `Audit & History / Report Center` as a distinct line item. This is a competitive differentiator (built-in report builder, scan audit log).  
**Action required:**
- Add a new `manual.item.17xx` entry for: *"Built-In Report Center & Audit Log — Trier [YES][UNIQUE] | Fiix [PARTIAL] | UpKeep [NO] | Limble [PARTIAL] | MaintainX [NO] | eMaint [PARTIAL] | SAP PM [YES] | IBM Maximo [YES]"*
- Inject into all 11 language files

---

### Task 12 — Add Manual Entry: Correctness Invariant System in Feature Comparison (s0)
**Gap:** The comparison table has no row for formal correctness guarantees / invariant system.  
**Action required:**
- Add: *"Formal Correctness Invariants (Runtime-Verified) — Trier [YES][UNIQUE] | Fiix [NO] | UpKeep [NO] | Limble [NO] | MaintainX [NO] | eMaint [NO] | SAP PM [NO] | IBM Maximo [NO]"*
- Inject into all 11 language files

---

## Execution Order (Recommended)

```
Phase 1 — Content additions  (Tasks 1, 2, 3, 4)
Phase 2 — Content corrections (Tasks 5, 6, 7, 8)
Phase 3 — Maintenance        (Tasks 9, 10, 11, 12)
Phase 4 — i18n injection for all new/changed keys
Phase 5 — npm run build + verify in browser (all 11 languages)
```

---

## Files Affected

| File | Tasks |
|---|---|
| `src/components/AboutView.jsx` | 1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12 |
| `src/i18n/en.json` | 1, 2, 3, 4, 6, 7, 8, 9, 11, 12 |
| All 10 other language JSON files | All i18n tasks |

---

---

## 📐 Manual Structure & Order Audit

**Total sections found:** 50 (s0–s49)  
**Rendering:** The manual is a flat scrollable array — no separate sidebar nav. Sections render in the order they appear in the `enterpriseManual` array in `AboutView.jsx`. Search filters dynamically.

### Complete Section Map (as-built)

| Index | Part Label | Title | Line # | Issue |
|---|---|---|---|---|
| s0 | *(none)* | Trier OS vs. The Industry — Feature Comparison | 81 | ✅ |
| s1 | Part I | Logging In & First Look | 396 | ✅ |
| s2 | Part II | Starting Your Shift | 458 | ✅ |
| s3 | Part III | Working a Job | 536 | ✅ |
| s4 | Part IV | Closing a Job — The Close-Out Wizard | 694 | ✅ |
| s5 | Part V | Finding What You Need | 839 | ✅ |
| s6 | Part VI | Preventive Maintenance & Scheduling | 930 | ✅ |
| s7 | Part VII | Communicating Across the Enterprise | 1032 | ✅ |
| s8 | Part VIII | Training Scenarios — Real-World Walkthroughs | 1109 | ⚠️ See Issue A |
| s9 | Part VIII-B | Fleet & Truck Shop | 1192 | ⚠️ See Issue A |
| s10 | Part IX | Troubleshooting & Field FAQs | 1344 | ✅ |
| s11 | Part X | Complete Screen & Button Reference | 1429 | ✅ |
| s12 | Part XI | Administration & User Management | 1509 | ✅ |
| s13 | Part XII | Data Bridge & Legacy Import | 1596 | ✅ |
| s14 | Part XIII | Reports & Predictive Analytics | 1664 | ⚠️ See Issue B |
| s15 | Part XIV | SCADA/OPC-UA & Equipment Integration | 1777 | ⚠️ See Issue C |
| s16 | Part XV | Floor Plans & Facility Mapping | 1845 | ⚠️ See Issue C |
| s17 | Part XVI | SCADA Connection Guides — Working Examples | 2233 | ⚠️ See Issue C |
| s18 | Part XVII | Safety & Compliance | 2313 | ⚠️ See Issue D |
| s19 | Part XVII-B | Engineering Excellence | 2471 | ⚠️ See Issue D |
| s20 | Part XVII-C | Contractors & Vendor Portal | 2549 | ⚠️ See Issue D |
| s21 | Part XVII-D | OEE, Workforce & Advanced Analytics | 2607 | ⚠️ See Issue D |
| s22 | Part XVIII | Onboarding, Enrollment & Platform Features | 2688 | ✅ |
| s23 | Part XIX | Email Notifications & SMTP Relay | 2889 | ✅ |
| s24 | Part XX | Mobile Offline Mode (PWA) | 2940 | ⚠️ See Issue E |
| s25 | Part **XXII** | High Availability & Server Replication | 3008 | 🔴 Part XXI MISSING |
| s26 | Part XXIII | Testing Process & Data Validation | 3090 | ✅ |
| s27 | Part XXIV | Security Testing & Results | 3151 | ✅ |
| s28 | Part XXV | Licensing, Support & Renewals | 3255 | ⚠️ See Issue F |
| s29 | Part XXVI | IT Department — Asset & License Management | 3322 | ✅ |
| s30 | Part XXVII | LOTO — Lockout/Tagout Permit System | 3475 | ✅ |
| s31 | Part XXVIII | Compliance & Inspection Management | 3525 | ✅ |
| s32 | Part XXIX | Multi-Language Support | 3567 | ⚠️ See Issue G |
| s33 | Part **XXXII** | Integration & Enterprise Automation | 3836 | 🔴 Parts XXX & XXXI MISSING |
| s34 | Part XXXIII | Offline Resilience & Plant LAN Sync | 3888 | ✅ |
| s35 | Part **LIX** | Emissions & Carbon Intensity Tracking | 3954 | 🔴 Parts XXXIV–LVIII MISSING (25 parts) |
| s36 | Part LX | Vendor / Supplier Performance Scorecard | 3981 | ✅ (continues from LIX) |
| s37 | Part LXI | Asset Lifecycle & Capital Replacement Planning | 4008 | ✅ |
| s38 | Part LXII | Spare Parts Inventory Optimization | 4035 | ✅ |
| s39 | Part LXIII | Scan-to-Segment Work Order (Digital Twin Pin Entry) | 4061 | ✅ |
| s40 | Part LXIV | Shift Handover / Digital Turnover Log | 4088 | ✅ |
| s41 | Part LXV | SOP Re-Acknowledgment on MOC Change | 4114 | ✅ |
| s42 | Part LXVI | Industry Vertical Catalog Packs | 4133 | ✅ |
| s43 | Part LXVII | REST API Public Specification (OpenAPI 3.1) | 4162 | ✅ |
| s44 | Part LXVIII | Digital Twin Platform Integration | 4181 | ✅ |
| s45 | Part LXIX | SaaS & Ecosystem Administration | 4201 | ✅ |
| s46 | Part LXX | Operator Trust Layer | 4227 | ✅ |
| s47 | Part LXXI | Deterministic Time Machine | 4254 | ✅ |
| s48 | Part LXXII | Safe Action Certification Layer | 4288 | ✅ |
| s49 | Part LXXIII | Distributed Edge Execution Mesh | 4307 | ✅ |

---

### Issues Found

#### 🔴 Issue A — "Part VIII-B" breaks the roman numeral sequence (s8/s9)
- `s8` = Part VIII: Training Scenarios
- `s9` = Part VIII-B: Fleet & Truck Shop ← inserted between VIII and IX as an afterthought
- `s10` = Part IX correctly follows, but the B-suffix naming is inconsistent with the rest of the manual
- **Same problem** occurs with s18–s21: `Part XVII`, `Part XVII-B`, `Part XVII-C`, `Part XVII-D` — four sub-parts all labeled XVII
- **Fix:** Promote VIII-B to Part IX, shift subsequent parts by 1. Do the same for XVII-B/C/D. This is a large renumber but the correct fix. Alternatively: keep the sub-lettering but document it as intentional grouping (less disruptive).

#### 🔴 Issue E — Part XXI is completely missing
- `s24` = Part XX: Mobile Offline Mode
- `s25` = Part **XXII**: High Availability ← skips directly to XXII
- Part XXI does not exist anywhere in the manual
- **Fix:** Either renumber s25 to Part XXI (and shift all subsequent numbers), or insert a new "Part XXI" section for content that logically belongs between offline mode and HA replication (e.g., the LAN Hub offline sync behavior).

#### 🔴 Issue G — Parts XXX and XXXI are missing
- `s32` = Part XXIX: Multi-Language Support
- `s33` = Part **XXXII**: Integration & Enterprise Automation ← skips XXX and XXXI
- **Fix:** Renumber s33 to Part XXX (and shift onward), or add two new sections for Parts XXX and XXXI covering content that belongs between multi-language and integration topics (e.g., Notification Center, Platform Health Dashboard).

#### 🔴 Issue — 25-Part Jump (XXXIII → LIX)
This is the most severe numbering problem in the manual:
- `s34` = Part XXXIII: Offline Resilience (last in the sequential block)
- `s35` = Part **LIX**: Emissions ← jumps 25 part numbers
- Parts XXXIV through LVIII (25 parts) are completely absent
- This happened because the s35–s49 batch was added later using numbers that were pre-planned but never filled in
- **Fix:** Two options:
  1. **Renumber the entire manual** to sequential Arabic numbers (1–50) — simplest and cleanest, avoids future gaps
  2. **Renumber s35 onward** to continue from XXXIV, renaming LIX→XXXIV, LX→XXXV … LXXIII→XLVIII — requires updating all 11 i18n files for s35.title through s49.title

#### 🟡 Issue B — Reports & Predictive Analytics is out of logical order (s14, Part XIII)
- Reports (s14, Part XIII) is positioned between Data Bridge (s12) and SCADA (s15)
- More logical position: after Administration (s12) and before or after IT Department (s29)
- **Fix:** Reorder in the `enterpriseManual` array — does not require i18n changes to content, only the position in the array. Part numbering fix (Issue above) handles the label.

#### 🟡 Issue C — SCADA sections are split by Floor Plans (s15, s16, s17)
- `s15` = Part XIV: SCADA/OPC-UA & Equipment Integration
- `s16` = Part XV: Floor Plans & Facility Mapping ← interrupts SCADA topic
- `s17` = Part XVI: SCADA Connection Guides — Working Examples
- SCADA XIV and SCADA XVI should be adjacent. Floor Plans fits better near Facility & Mapping topics.
- **Fix:** Move s16 (Floor Plans) to after s17 (SCADA Connection Guides), or group all facility/physical topics together.

#### 🟡 Issue D — XVII-B/C/D sub-parts inflate Part XVII into 4 separate entries
- `s18` = Part XVII: Safety & Compliance
- `s19` = Part XVII-B: Engineering Excellence
- `s20` = Part XVII-C: Contractors & Vendor Portal
- `s21` = Part XVII-D: OEE, Workforce & Advanced Analytics
- These are four distinct, large topics masquerading as sub-parts of one. They should each be a full Part.
- **Fix:** Assign them Parts XVIII, XIX, XX, XXI (shift remaining parts accordingly). This is the cleanest approach but requires the full renumber.

#### 🟡 Issue F — Licensing & Support is buried in the technical middle (s28, Part XXV)
- Licensing (s28) sits between Security Testing (s27) and IT Department (s29)
- Logical position: near the end of the manual, after all technical sections
- **Fix:** Move s28 to the end of the array (after s49) — no part number changes needed if doing the full renumber.

---

### Task 13 — Full Manual Renumber (Roman Numerals → Sequential Arabic)
**Recommended approach:** Convert all part labels to sequential Arabic numbers (Part 1 through Part 52 after new sections are added). This permanently eliminates the gap problem and is immune to future insertions causing jumps.

**Steps:**
1. Create a mapping table: old label → new label (e.g., "Part VIII-B" → "Part 9", "Part XXII" → "Part 22")
2. Update all `manual.s*.title` strings in `AboutView.jsx`
3. Update all 11 `manual.s*.title` keys in all language JSON files
4. Update all `manual.sub.*` title strings that reference the roman numeral (e.g., "VIII.1 Mission Control" → "9.1 Mission Control")
5. Run build, verify rendering

**Scope:** ~55 title strings in `AboutView.jsx` + 55 × 11 = 605 i18n key updates
**Risk:** Low — purely cosmetic, no logic change

---

### Task 14 — Reorder SCADA Sections to be Adjacent (s15, s17 should be consecutive)
**Fix:** In the `enterpriseManual` array in `AboutView.jsx`, move the `s16` (Floor Plans) object to after `s17` (SCADA Connection Guides). Zero i18n changes needed — only array reordering.

---

### Task 15 — Move Licensing & Support to End of Manual
**Fix:** Move the `s28` (Licensing, Support & Renewals) object to after `s49` in the array. Zero i18n changes needed.

---

### Task 16 — Promote XVII-B/C/D to Full Parts
**Fix:** Remove the `Part XVII-B/C/D` sub-suffix convention. After the full renumber (Task 13), these become Part 19, 20, 21 automatically. In the interim, at minimum remove the confusing "-B/-C/-D" from the displayed titles.

---

## Updated Execution Order (All Tasks)

```
Phase 0 — Structural fixes (no i18n impact)
  Task 14: Reorder SCADA sections (array reorder only)
  Task 15: Move Licensing to end (array reorder only)

Phase 1 — Content additions
  Task 1:  Add Audit & History section (s50)
  Task 2:  Update Mission Control tile list (s11)
  Task 3:  Add Invariants section (s51)
  Task 4:  Add Parallel Universe Engine content (s47 extension)

Phase 2 — Numbering & naming corrections
  Task 13: Full renumber I–LXXIII → 1–52 (largest i18n impact)
  Task 16: Remove XVII-B/C/D sub-suffix (part of Task 13)
  Task 6:  (superseded by Task 13 — same work)

Phase 3 — Content corrections
  Task 5:  Competitor table update (s0)
  Task 7:  Security section update (s27)
  Task 8:  Offline replay correction (s34)

Phase 4 — Feature comparison additions
  Task 11: Add Audit & History row to comparison table (s0)
  Task 12: Add Invariant System row to comparison table (s0)

Phase 5 — Maintenance
  Task 9:  Fix duplicate energy.kgCoEst key
  Task 10: Verify s44–s50 nav entries

Phase 6 — i18n injection for all new/changed keys
Phase 7 — npm run build + full 11-language browser verification
```

---

## Updated Files Affected

| File | Tasks |
|---|---|
| `src/components/AboutView.jsx` | 1–5, 7, 8, 10–16 |
| `src/i18n/en.json` | 1–4, 7, 8, 9, 11–13 |
| All 10 other language JSON files | All i18n tasks |

---

*Trier OS v3.6.1 — Documentation Update Audit — April 26, 2026*
*Structure audit added: April 26, 2026*
