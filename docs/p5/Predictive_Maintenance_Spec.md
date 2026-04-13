# Predictive Maintenance Engine — Full Spec
> Trier OS P5 · Weibull / degradation curve tier (future work)

---

## What's Already Running

The deterministic MTBF tier is fully implemented in `routes/predictive_maintenance.js`:

| Endpoint | What It Computes |
|---|---|
| `GET /api/predictive-maintenance/mtbf` | Mean Time Between Failures per asset from WO history |
| `GET /api/predictive-maintenance/risk-ranking` | Top 20 assets by risk score (failure freq × criticality × recency) |
| `GET /api/predictive-maintenance/forecast` | Assets where predicted next failure falls within 30/60/90 days |
| `GET /api/predictive-maintenance/asset/:id` | Full reliability profile: MTBF, MTTR, failure history, downtime cost |

This tier requires no ML and no sensor data — it runs entirely from closed unplanned WOs already in the plant DB. Accuracy improves as more failure history accumulates.

---

## The Full Tier: Weibull Failure Modeling

The deterministic tier uses the mean of inter-failure intervals. The Weibull tier fits a probability distribution to those intervals and produces:

- **Shape parameter β**: β < 1 = infant mortality; β ≈ 1 = random failure; β > 1 = wear-out (increasing failure rate)
- **Scale parameter η (characteristic life)**: the age at which 63.2% of units have failed
- **Failure probability at time t**: `F(t) = 1 - e^(-(t/η)^β)`

This gives a statistically-grounded probability of failure over the next N days rather than a point estimate.

### Build Prerequisites

1. **Sufficient failure history**: Weibull fitting requires ≥ 5 failures per asset for meaningful results. Most plants will need 12–18 months of WO data before this is useful for individual assets.
2. **Weibull parameter estimation**: Maximum likelihood estimation (MLE) or least-squares regression on the failure data. Can be implemented in Node.js without ML frameworks.
3. **Sensor time-series data** (optional, enhances accuracy): vibration readings, temperature trends, oil analysis — these enable condition-based Weibull (CBM) rather than purely time-based.

---

## Sensor-Based Degradation Curves

For assets with sensor feeds (Modbus, OPC-UA):

1. Establish a baseline operating signature (vibration RMS, bearing temperature, current draw)
2. Fit a degradation curve to the deviation from baseline over time
3. Project the curve forward to a failure threshold
4. Update the forecast dynamically as new readings arrive

This is distinct from Weibull (which uses failure event timestamps) and is more powerful but requires continuous sensor data.

**Data model needed:**
- `AssetSensorBaselines` — per-asset, per-sensor baseline values
- `SensorDegradationModel` — fitted curve parameters (slope, intercept, threshold)

---

## Integration with Mission Control

When the forecast engine predicts a failure within a configurable window (default: 14 days), it should:
1. Surface the asset on Mission Control with a `PREDICTED_FAILURE` flag
2. Optionally auto-create a PM work order for inspection/lubrication/replacement
3. Log the prediction with confidence interval to `PredictiveMaintLog` (for retrospective accuracy tracking)

This auto-WO integration follows the same pattern as Operator Care (`operator_care.js`).

---

## Accuracy Tracking

To validate and improve the engine, every prediction should be logged with:
- Asset ID, prediction timestamp, predicted failure date, confidence window
- Outcome: did a failure occur within the window? (matched against WO history)

This feedback loop is essential for tuning the model and demonstrating value to plant managers.
