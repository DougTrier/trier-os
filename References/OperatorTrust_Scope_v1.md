# Trier OS Operator Trust Layer: Scoping & Architecture

## 1. Recommendation Source Inventory
Trier OS currently emits three primary recommendation types:

| Recommendation Type | Route | Output Format | Current Confidence Signal |
| --- | --- | --- | --- |
| **Probabilistic Forecast** (Predictive Maintenance) | `GET /api/predictive-maintenance/forecast` | Predicted failure window, MTBF in days, standard deviation, historical failure count. | None. An asset with 2 failures is presented identically to one with 50. |
| **Composite Score** (Risk Scoring) | `GET /api/risk-score/:plantId` | 0–100 score + 5 penalty dimension breakdowns. | None. Missing or stale data in a dimension treats it as zero-penalty implicitly. |
| **Threshold Event** (Vibration Alerts) | `GET /api/vibration/alerts` | Binary alert payload specifying the exceeded limit. | None. Alert triggers identically for 10% or 300% threshold breach. |

## 2. Confidence Score Design
The Confidence Score (0.0 to 1.0) signals the reliability and data-backing of a recommendation.

- **Predictive Forecast:** Computed using: (a) Data Volume (capped curve for historical failures, 0-10), (b) Coefficient of Variation (lower stdDev/MTBF yields higher confidence), (c) Data Recency (failures within 18 months weighted higher than older data).
- **Composite Score:** Computed using: (a) Data Completeness (percentage of the 5 penalty dimensions populated), (b) Data Age (penalty for dimensions not refreshed within expected TTL).
- **Threshold Event:** Computed using: (a) Magnitude of Breach (distance beyond threshold), (b) Persistence (number of consecutive readings exceeding threshold vs a single anomalous spike).

**Confidence Bands:**
- `LOW` (0.00 – 0.39): Insufficient data or high volatility.
- `MEDIUM` (0.40 – 0.74): Moderate statistical backing.
- `HIGH` (0.75 – 1.00): Strong, tightly clustered data with high recency.

## 3. Operator Feedback Loop Design
Operators must be able to interact with recommendations to close the system's feedback loop.
- **Actions Supported:**
  - `ACCEPT`: Operator agrees and acts. Optionally links a new `WOID`.
  - `REJECT`: Operator disagrees. Requires a `ReasonCode` (`FALSE_POSITIVE`, `ALREADY_KNOWN`, `OUT_OF_SCOPE`, `DATA_ERROR`) and an optional text annotation.
  - `ANNOTATE`: Operator adds context without binary acceptance/rejection (e.g., "Monitoring until Q4 replacement").
- **Storage:** `OperatorFeedback` table in `trier_logistics.db`. Cross-plant visibility is essential for aggregating corporate reliability signals and trust metrics.
- **Schema:** `FeedbackID`, `RecommendationID`, `PlantID`, `AssetID`, `Operator` (UserID), `Action`, `ReasonCode`, `Annotation`, `LinkedWOID`, `FeedbackAt`.

## 4. Recommendation Log Design
Recommendations must be persisted identically to how they were emitted to track historical feedback.
- **Storage:** `RecommendationLog` table in `trier_logistics.db`.
- **Schema:** `RecommendationID`, `Type` (`PREDICTIVE_FORECAST`, `RISK_SCORE`, `VIBRATION_ALERT`), `PlantID`, `AssetID`, `RecommendedAction`, `ConfidenceScore`, `ConfidenceBand`, `EmittedAt`, `EmittedPayload` (JSON snapshot).
- **Mutability:** Append-only. A recommendation cannot be modified after emission. All updates are captured as separate `OperatorFeedback` entries.

## 5. Outcome Tracking Design
Outcome tracking answers whether the system's prediction matched reality.
- **Schema:** `RecommendationOutcome` with `OutcomeID`, `RecommendationID`, `OutcomeType` (`VALIDATED`, `REFUTED`, `EXPIRED`, `INCONCLUSIVE`), `MatchedWOID`, `EvidenceNote`, `RecordedAt`, `RecordedBy`.
- **Detection Method:** 
  - `PREDICTIVE_FORECAST`: Validated if a corrective WO closes on the target asset within the predicted window. Expired if the window closes without failure.
  - `RISK_SCORE`: Validated if the cited penalty dimensions incur a significant corrective incident within 30 days.
  - `VIBRATION_ALERT`: Validated if the asset requires corrective work within 7 days.
- **Automation Level:** For v1, outcome tracking will rely on explicit manual linkage via the feedback loop (`MatchedWOID`), rather than introducing background cron jobs for auto-detection. 

## 6. Aggregate Trust Metrics
The Validation Rate defines the core trust metric over a rolling 90-day window:
`Validation Rate = VALIDATED / (VALIDATED + REFUTED + EXPIRED)`
- **Trust Layer Dashboard:** Exposes the engine accuracy per recommendation type.
- **Confidence Dampening:** If the validation rate drops below 30%, the computed confidence scores are subjected to an aggregate multiplier (`* 0.5`) until accuracy improves.

## 7. Go / No-Go Decision
**1. Operator Feedback Loop:** **GO**. Adding tables and endpoints is non-destructive, isolated, and requires no write-intercept layers like the Gatekeeper.
**2. Recommendation Logging:** **GO**. Essential prerequisite for the feedback loop. Tradeoff: Increases compute overhead by adding disk I/O to previously read-only predictive routes.
**3. Confidence Score Calculation:** **GO**. The math can be deterministically calculated on-the-fly and appended to existing API responses.
**4. Outcome Tracking (Manual):** **GO**. Storing outcomes driven by operator action is trivial and immediately valuable.
**5. Outcome Tracking (Auto-Detection Cron):** **NO-GO**. Building a background job to scan and correlate work orders adds extreme architectural complexity for v1.
**6. Accuracy-Based Confidence Dampening:** **NO-GO**. A deterministic mathematical dampener requires months of historical outcome data to achieve statistical significance. Will be deferred to v2.
