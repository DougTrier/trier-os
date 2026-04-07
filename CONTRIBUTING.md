# Contributing to Trier OS

Thank you for your interest in contributing to Trier OS! Because this system operates as a "Living OS" for physical manufacturing facilities, the bar for submitting code is exceptionally high.

Please read and strictly abide by the following architectural mandates before submitting a Pull Request (PR).

---

## 1. The "Zero Obfuscation" Context Mandate

Trier OS maintains a world-class **~10.2% Contextual Density Ratio**. To bridge the gap between engineering scripts and Plant Floor Operations, **every single file** must contain complete, human-readable intelligence.

**Rule:** Any Pull Request dropping the overall system comment coverage below 100% will be instantly rejected.

---

## 2. The Trier OS Architecture Header Pattern

Every `.js`, `.jsx`, and `.css` file you modify or create **must** feature the standard Trier OS Architecture Header block starting at line 1.

Your header must contain:
1. **Copyright line** — `// Copyright © 2026 Trier OS. All Rights Reserved.`
2. **Module title block** — A clear, human-readable module name
3. **Context paragraph** — 2–3 sentences explaining what the file does and how it interacts with the rest of the platform
4. **Endpoint or Action blocks** — Bullet points explicitly documenting exposed API routes or key functions

### ✅ Correct Header Example (React Component)

```jsx
// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * FleetView.jsx — Fleet & Truck Shop Module
 * ==========================================
 * Displays the full vehicle registry for the selected plant, including
 * DOT inspection records, DVIR logs, fuel consumption tracking, and
 * CDL certification management. All data is plant-scoped via the
 * x-plant-id header on every API request.
 *
 * -- API DEPENDENCIES ------------------------------------------
 *   GET  /api/fleet/vehicles          — List all vehicles (paginated)
 *   GET  /api/fleet/vehicles/:id      — Single vehicle detail
 *   POST /api/fleet/vehicles          — Create new vehicle record
 *   PUT  /api/fleet/vehicles/:id      — Update vehicle fields
 *   GET  /api/fleet/dvir              — DVIR inspection list
 *   POST /api/fleet/dvir              — Submit new DVIR
 *
 * -- KEY STATE -------------------------------------------------
 *   vehicles      — Paginated vehicle array from API
 *   selectedVehicle — Currently open detail record
 *   tab           — Active sub-tab (vehicles | dvir | fuel | tire | cdl | dot)
 */
import React, { useState, useEffect } from 'react';
// ... rest of component
```

### ✅ Correct Header Example (Express Route File)

```js
// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * fleet.js — Fleet & Vehicle API Routes
 * ======================================
 * Express router handling all fleet, DVIR, fuel, tire, and DOT
 * compliance endpoints. All queries are plant-scoped automatically
 * via the AsyncLocalStorage db() helper — no manual plant ID needed.
 *
 * -- ROUTES ----------------------------------------------------
 *   GET    /api/fleet/vehicles          List vehicles with search/filter
 *   GET    /api/fleet/vehicles/:id      Vehicle detail with service history
 *   POST   /api/fleet/vehicles          Create new vehicle record
 *   PUT    /api/fleet/vehicles/:id      Update vehicle (whitelisted fields only)
 *   DELETE /api/fleet/vehicles/:id      Soft-delete vehicle
 *   GET    /api/fleet/dvir              DVIR inspection list
 *   POST   /api/fleet/dvir             Submit DVIR inspection
 */
const express = require('express');
const router = express.Router();
// ... rest of router
```

### ❌ What Gets Rejected

```jsx
// Fleet component
import React from 'react';
export default function Fleet() { ... }
```

No copyright. No context. No endpoint documentation. **Instant rejection.**

---

## 3. The Live Studio Test Requirement

Before submitting a PR:
1. Verify you have not broken the **Live Studio** sandbox parser.
2. Ensure your code compiles cleanly via `npm run build` with zero errors.
3. Ensure no static `console.error` calls exist that would trigger the **Frictional Cost Engine** analyzer.

---

## Pull Request Process

1. Fork the repository and create your branch (e.g., `feature/barcode-scanner-fix`)
2. Adhere strictly to the Context Mandates outlined above
3. Submit the Pull Request to the `main` branch
4. **Code Review:** Maintainers will analyze your code for logic, UI consistency, and exact documentation standards

*If you are unsure whether your header meets the standard, open a Discussion before submitting a PR.*
