# Operator Trust Layer — Architecture Spec
> Trier OS P7 · Confidence + explainability + outcome feedback loop

---

## Concept

Every system-generated recommendation or alert shown to an operator must answer three questions before the operator acts:

1. **How confident is the system?** (not a black box)
2. **Why is it suggesting this?** (plain-language, not codes)
3. **Has this worked before?** (outcome history from this facility)

The operator's approve/reject/override decision feeds back into the system, improving future recommendation quality without retraining models.

---

## Trust Signal Anatomy

Every recommendation object emitted by P7 engines carries a `trust` block:

```json
{
  "recommendationId": "rec_8f2a1b",
  "type": "PREVENTIVE_MAINTENANCE",
  "assetId": "PUMP-101",
  "action": "Schedule lubrication — bearing temperature trending +8°C over 14 days",
  "trust": {
    "confidence": 0.82,
    "confidenceLabel": "High",
    "basis": [
      "Vibration reading 6.1 mm/s — above ALERT threshold (ISO 10816)",
      "Last lubrication: 47 days ago (PM schedule: every 30 days)",
      "2 prior RCAs on this asset cite lubrication as root cause"
    ],
    "outcomeHistory": {
      "timesActedOn": 14,
      "timesIgnored": 3,
      "outcomeWhenActed": "No failure within 90 days: 12/14 (86%)",
      "outcomeWhenIgnored": "Failure within 30 days: 2/3 (67%)"
    },
    "dataAge": "Real-time",
    "generatedBy": "predictive_maintenance + vibration + rca_history"
  }
}
```

---

## Operator Decision Capture

When a recommendation is shown in Mission Control, the operator sees:

- The recommended action
- The confidence label + basis list
- Outcome history (concise: "Acted on 14 times — 86% no failure within 90 days")
- Three response buttons: **Accept** | **Reject** | **Override with note**

All decisions are persisted to `OperatorDecisions` table with timestamp, decision, and optional note.

---

## Feedback Loop

```
Recommendation generated
        ↓
Operator decides (Accept / Reject / Override)
        ↓
Decision stored in OperatorDecisions
        ↓
Outcome measured at T+30, T+60, T+90 (did failure occur? was WO completed?)
        ↓
Outcome written to OperatorDecisions.outcome
        ↓
outcomeHistory recomputed at next recommendation for same asset+type
```

This is deterministic feedback — no ML weight updates, no retraining. The history is a count of outcomes from the `OperatorDecisions` table, queryable at any time.

---

## Database Schema

```sql
CREATE TABLE OperatorDecisions (
    ID              INTEGER PRIMARY KEY AUTOINCREMENT,
    PlantID         TEXT    NOT NULL,
    RecommendationID TEXT   NOT NULL,
    AssetID         TEXT,
    RecommendationType TEXT,
    Decision        TEXT    NOT NULL, -- ACCEPTED | REJECTED | OVERRIDDEN
    OperatorID      TEXT,
    Note            TEXT,
    DecidedAt       TEXT    DEFAULT (datetime('now')),
    OutcomeCheckedAt TEXT,
    Outcome         TEXT,             -- NO_FAILURE_30 | NO_FAILURE_60 | FAILURE_30 | FAILURE_60 | PENDING
    OutcomeWOID     TEXT              -- WO that confirmed outcome if applicable
);
CREATE INDEX idx_decisions_asset ON OperatorDecisions(AssetID, RecommendationType);
CREATE INDEX idx_decisions_plant ON OperatorDecisions(PlantID);
```

---

## Confidence Scoring

Confidence is a weighted composite of:

| Signal | Weight | Source |
|---|---|---|
| Vibration severity (ISO 10816 tier) | 30% | `/api/vibration` |
| Days since last PM overdue | 25% | `Work` + `SchID` |
| Prior RCA root cause match | 20% | `rca_investigations` |
| MTBF proximity (% of mean MTBF elapsed) | 15% | `/api/baseline` |
| Operator override history for this type | 10% | `OperatorDecisions` |

All inputs are observable, auditable facts — no hidden weights.

---

## Planned API

```
GET  /api/trust/recommendations?plantId=&assetId=     Active recommendations with trust blocks
POST /api/trust/decide                                 Record operator decision
     Body: { recommendationId, decision, operatorId, note }
POST /api/trust/outcome                                Record measured outcome (cron or WO close hook)
     Body: { recommendationId, outcome, woId }
GET  /api/trust/history?assetId=&type=                 Outcome history for an asset+type pair
GET  /api/trust/leaderboard?plantId=                   Recommendation accuracy by type (for calibration)
```

---

## Prerequisites

| Requirement | Status |
|---|---|
| Predictive Maintenance Engine | ✅ `/api/predictive-maintenance` — live |
| Vibration Alerts | ✅ `/api/vibration` — live |
| Baseline Engine (MTBF) | ✅ `/api/baseline` — live |
| RCA history | ✅ `rca_investigations` in logistics DB |
| Operator auth (who decided) | ✅ JWT middleware — `req.user` available |
| OperatorDecisions table + routes | 🔵 New — schema above |
| Mission Control UI: recommendation cards | 🔵 New — React component |
| Outcome measurement cron | 🔵 New — 30/60/90-day cron against OperatorDecisions |

---

## UI: Mission Control Integration

A "Recommendations" panel in Mission Control lists active recommendations ranked by confidence. Each card shows the trust block inline. The operator response buttons are one-tap. The outcome history bar (✅ 12 acted / ❌ 2 ignored) provides social proof without requiring the operator to read a report.

---

*The data infrastructure (vibration, predictive maintenance, baselines, RCAs) is already live. The Operator Trust Layer wires them together with a decision-capture loop. Implementation scope: OperatorDecisions table, trust-block aggregation route, and Mission Control recommendation cards.*
