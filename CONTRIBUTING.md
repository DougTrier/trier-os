# Contributing to Trier OS

153,000 lines of core logic in 33 days. Built fast. We pushed every button, broke things, fixed them faster, and didn't stop until it was right.

That's the standard this codebase was built to. Not perfection on the first try — persistence until it was right. If that sounds like how you build software, you'll fit in here.

---

## Before You Start

Trier OS runs on real factory floors. Maintenance crews depend on it to manage equipment, track safety, and keep production moving. A bug here isn't a UI glitch — it can mean a missed PM, a failed inspection, or a worker without the right procedure in hand.

That context shapes everything about how this project is maintained. We welcome contributions warmly and review them carefully. Quality over speed doesn't apply here — we do both. But we don't merge anything we haven't tested against a live instance.

If you have a question before diving in, open a **Discussion** rather than an Issue. That's what Discussions are for.

---

## 1. The Documentation Standard

Trier OS enforces a hard **10% minimum Contextual Density Ratio** — every file carries enough human-readable context that a maintenance engineer walking into the codebase cold can understand what it does and why.

**Every `.js`, `.jsx`, and `.css` file you modify or create must include the standard Trier OS architecture header.**

### What the header must contain

1. **Copyright line** — `// Copyright © 2026 Trier OS. All Rights Reserved.`
2. **Module title block** — Clear, human-readable module name
3. **Context paragraph** — 2–3 sentences explaining what the file does and how it fits the platform
4. **Endpoint or action blocks** — Explicit documentation of exposed API routes or key functions

### Correct header — React component

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
 *
 * -- KEY STATE -------------------------------------------------
 *   vehicles        — Paginated vehicle array from API
 *   selectedVehicle — Currently open detail record
 *   tab             — Active sub-tab (vehicles | dvir | fuel | tire | cdl | dot)
 */
import React, { useState, useEffect } from 'react';
```

### Correct header — Express route file

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
 *   GET    /api/fleet/vehicles       List vehicles with search/filter
 *   POST   /api/fleet/vehicles       Create new vehicle record
 *   PUT    /api/fleet/vehicles/:id   Update vehicle (whitelisted fields only)
 *   DELETE /api/fleet/vehicles/:id   Soft-delete vehicle
 */
const express = require('express');
const router = express.Router();
```

### What won't be accepted

```jsx
// Fleet component
import React from 'react';
export default function Fleet() { ... }
```

No copyright. No context. No endpoint documentation. This doesn't meet the standard.

---

## 2. Build and Test Requirements

Before submitting a PR:

1. Run `npm run build` — zero errors, zero warnings
2. Test your change against a running Trier OS instance (portable build or from source)
3. No new `console.error` calls that aren't already handled
4. If you changed any UI — test it, screenshot it, include it in the PR

---

## 3. Pull Request Process

1. Fork the repository and create a branch — `fix/your-fix` or `feature/your-feature`
2. Follow the documentation standard above
3. Fill out the PR template completely
4. Submit to `main`

Every PR is reviewed and tested locally before merge. That's not bureaucracy — that's how a codebase built for factory floors stays reliable. We'll give you honest, direct feedback and work with you to get it across the line.

---

## 4. What We're Looking For

- Bug fixes with clear reproduction steps
- Performance improvements with measurable impact
- New integrations that fit the existing architecture
- Better ideas — if you see a smarter way to do something, say so

If you've worked in manufacturing, maintenance, or industrial operations and something in this system doesn't match how the real world works — that feedback is gold. Open a Discussion.

---

*Trier OS is maintained by Doug Trier. All contributions are reviewed before merge.*
