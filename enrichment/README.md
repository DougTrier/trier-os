# Trier OS — Data Enrichment Tools

This directory contains optional tooling used to seed and enrich the multi-site demo databases with realistic operational data. These scripts are **not required** to run the application — they are utilities for generating demonstration datasets.

## Contents

| File | Purpose |
|---|---|
| `bridge.js` | Node.js bridge that connects the enrichment pipeline to the SQLite data layer |
| `engine.py` | Python-based data generation engine for producing realistic plant telemetry |
| `manufacturers.json` | Reference dataset of equipment manufacturers used during asset seeding |
| `populate.js` | Orchestrator script that drives the enrichment pipeline end-to-end |
| `seed_data.sql` | Raw SQL seed statements for base operational records |
| `setup_db.sql` | Schema initialization statements for a fresh database instance |

## Usage

These tools are intended for contributors who want to generate a fresh, realistic demo dataset:

```bash
# Install Python dependencies if needed
pip install faker

# Run the full enrichment pipeline
node populate.js
```

> Requires both Node.js and Python 3.x installed.
