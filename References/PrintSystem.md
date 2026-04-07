# Trier OS — Print System Reference

## How Printing Works

All printing in Trier OS goes through a **single centralized system**. Do NOT use `printRecord()` from `src/utils/printRecord.js` — that is a legacy utility. All modules should use the global PrintEngine.

### The Flow

1. **Trigger** — Any component calls:
   ```js
   window.triggerTrierPrint(type, data);
   ```
   This dispatches a `trier-print` CustomEvent.

2. **App.jsx catches it** — Sets `printRequest` state via the event listener (lines ~162-169).

3. **PrintEngine renders** — Inside a `<div className="print-only-wrapper">` at the bottom of App.jsx, the `<PrintEngine>` component renders the document based on `type` and `data`.

4. **Browser print dialog** — After a 1-second delay (to let React render), `window.print()` fires. The `@media print` CSS hides `.container` and shows only `.print-only-wrapper`.

5. **Cleanup** — The `afterprint` event clears `printRequest` state.

### Key Files

| File | Purpose |
|------|---------|
| `src/App.jsx` (lines ~158-199) | Global print listener, PrintEngine mounting, `window.triggerTrierPrint` definition |
| `src/components/PrintEngine.jsx` | All print document layouts (switch on `type`) |
| `src/index.css` (`@media print`) | Hides app UI, shows only print wrapper |

### Supported Print Types

| Type | Data Shape | Used By |
|------|-----------|---------|
| `'asset'` | Single asset object `{ ID, Description, ... }` | AssetsView (detail) |
| `'work-order'` | Single WO `{ WorkOrderNumber, ... }` | WorkOrdersView |
| `'sop'` / `'procedure'` | SOP object `{ ID, _tasks, _parts }` | ProceduresDashboard, JobsView |
| `'task-detail'` | Task master record `{ ID, Description, TaskTypID, Tasks }` | ProceduresDashboard Task tab |
| `'pm-task'` | PM schedule `{ ID, Freq, FreqUnit, ... }` | JobsView |
| `'part'` | Part object `{ ID, Description, Stock, ... }` | PartsView |
| `'po'` | Purchase order `{ PartID, VendorID, ... }` | PurchaseOrdersListView |
| `'report'` | Report `{ meta, data, columns }` | ReportCenter |
| `'reliability-report'` | Narrative analytics `{ insights, workloadDistribution, enterpriseFinancials }` | HistoryDashboard Reliability tab |
| `'audit-log-report'` | `{ logs: [...] }` | HistoryDashboard Audit Log tab |
| `'audit-entry-detail'` | Single audit entry `{ id, timestamp, action, detail, user }` | HistoryDashboard Audit detail |
| `'manual'` | Array of manual sections | AboutView |
| `'fleet-vehicle'` | `{ vehicle, serviceHistory, fuelLog }` | FleetView (detail modal) |
| `'fleet-dvir'` | `{ dvir, items }` | FleetView DVIR detail |
| `'fleet-fuel-detail'` | Single fuel log entry | FleetView Fuel detail |
| `'fleet-tire-detail'` | Single tire record | FleetView Tire detail |
| `'fleet-license-detail'` | Single license record | FleetView License detail |
| `'fleet-dot-detail'` | Single DOT inspection | FleetView DOT detail |
| `'safety-permit-detail'` | `{ permit, checklist, signatures, gasLog }` | SafetyView Permit detail |
| `'safety-incident-detail'` | `{ incident }` or flat incident | SafetyView Incident detail |
| `'safety-calibration-detail'` | `{ instrument, history }` | SafetyView Calibration detail |
| `'tool-detail'` | Single tool record | ToolsView detail |
| `'tool-checkout-slip'` | `{ tool, currentCheckout, history }` | ToolsView Checkout detail |
| `'tool-overdue-report'` | `{ items: [...overdueTools] }` | ToolsView Overdue tab |
| `'tool-stats-report'` | `{ total, available, checkedOut, ... }` | ToolsView Stats tab |
| `'contractor-detail'` | `{ contractor, certs, jobs }` | ContractorsView detail |
| `'contractor-expiry-report'` | `{ expiringInsurance, expiringCerts }` | ContractorsView Cert Expiry tab |
| `'contractor-job-detail'` | Single job record with CompanyName | ContractorsView Job detail |
| `'contractor-jobs-report'` | `{ jobs: [...] }` | ContractorsView Job History tab |
| `'contractor-stats-report'` | `{ total, approved, avgRating, ... }` | ContractorsView Stats tab |
| `'engineering-rca-detail'` | `{ rca, whySteps, fishbone }` | EngineeringView RCA detail |
| `'engineering-fmea-detail'` | `{ worksheet, modes }` | EngineeringView FMEA detail |
| `'engineering-repair-replace'` | Single repair/replace analysis | EngineeringView Repair vs Replace |
| `'engineering-ecn-detail'` | `{ ecn, approvals }` | EngineeringView ECN detail |
| `'engineering-project-detail'` | `{ project, milestones, budgetUsed }` | EngineeringView Capital Projects |
| `'engineering-lube-route'` | `{ route, points, recentRecords }` | EngineeringView Lubrication |
| `'engineering-oil-analysis'` | `{ sample, results }` | EngineeringView Oil Analysis |
| `'vendor-portal-access'` | `{ vendor, rfqs, messages }` | VendorPortalView Vendor detail |
| `'vendor-rfq-detail'` | `{ rfq, items, totalTarget, totalQuoted, savings }` | VendorPortalView RFQ detail |
| `'vendor-messages'` | `{ vendorId, messages }` | VendorPortalView Messages tab |
| `'catalog'` | `{ type: '<sub-type>', items: [...] }` | Multiple (list prints) |
| `'asset-qr-label'` | Asset + plantLabel | AssetsView (single QR) |
| `'asset-qr-batch'` | `{ items, plantLabel }` | AssetsView (batch QR) |
| `'site-access-pack'` | Onboarding data | SettingsView |

### Catalog Sub-Types

When using `type: 'catalog'`, set `data.type` to one of:

| `data.type` | Title | Used By |
|-------------|-------|---------|
| `'assets'` | Enterprise Asset Registry | AssetsView |
| `'work-orders'` | Maintenance Work Order Ledger | WorkOrdersView |
| `'parts'` | Inventory Component Master | PartsView |
| `'pm-schedules'` | Preventative Maintenance Registry | JobsView |
| `'tasks'` | Procedural Task Master Catalog | ProceduresDashboard |
| `'sops'` | Standard Operating Procedure Library | JobsView |
| `'vendors'` | Vendor Procurement Catalog | PartsView |
| `'logistics'` | Inter-Site Transfer Ledger | LogisticsView |
| `'fleet-vehicles'` | Fleet & Truck Shop — Vehicles | FleetView |

### Adding a New Print Type

1. Add a new `case` in `PrintEngine.jsx` switch statement
2. Use the existing helpers: `renderHeader()`, `renderSectionHeader()`, `renderProperties()`, `renderTable()`, `renderSignatures()`, `renderDescription()`
3. Call `window.triggerTrierPrint('your-type', yourData)` from the component

### Example: Printing a Fleet Vehicle List

```jsx
// In the component:
<button onClick={() => window.triggerTrierPrint('catalog', { 
    type: 'fleet-vehicles', 
    items: vehicles 
})}>
    Print
</button>
```

### Example: Printing a Single Record

```jsx
// In the component:
<button onClick={() => window.triggerTrierPrint('fleet-vehicle', { 
    ...detailData, 
    plantLabel: localStorage.getItem('selectedPlantId') 
})}>
    Print
</button>
```

### Branding

- PrintEngine receives `branding` prop from App.jsx
- Logo: `branding.documentLogo` or falls back to `/assets/TrierLogoPrint.png`
- Company name: "Trier OS" (set in `data/branding.json`)
- Plant label auto-populated from App.jsx plant selector

---

## View, Edit Anywhere with Print — Design Pattern

Every data table in Trier OS follows a consistent **"View / Edit Anywhere / Print"** interaction model. Users can view details, edit inline from any screen, and produce a professional printed document — all from the same UI.

### Architecture

```
┌────────────────────────────────────────────────────────────┐
│  DATA TABLE (list view)                                    │
│  ┌──────┬──────────┬────────┬──────┬─────┬────────────┐    │
│  │ ID   │ Title    │ Date   │ Stat │ Cat │  ACTIONS   │    │
│  │      │          │        │      │     │ 👁️  ✏️     │    │
│  └──────┴──────────┴────────┴──────┴─────┴────────────┘    │
│                                                            │
│  👁️ = Open detail modal (read-only)                       │
│  ✏️ = Open detail modal (edit mode)                        │
└────────────────────────────────────────────────────────────┘
            │
            ▼
┌────────────────────────────────────────────────────────────┐
│  DETAIL MODAL                                              │
│  ┌────────────────────────────────────────────────────────┐│
│  │ DetailHeader                                          ││
│  │   Title          [Print] [Edit] [X]   ← View mode     ││
│  │   Title          [Save] [Cancel] [X]  ← Edit mode     ││
│  └────────────────────────────────────────────────────────┘│
│  ┌────────────────────────────────────────────────────────┐│
│  │ View Mode: InfoRow grid (read-only display)           ││
│  │ Edit Mode: Form fields (input/select/textarea)        ││
│  └────────────────────────────────────────────────────────┘│
│  ┌────────────────────────────────────────────────────────┐│
│  │ Panel boxes: related data (history, sub-items, etc)   ││
│  └────────────────────────────────────────────────────────┘│
└────────────────────────────────────────────────────────────┘
```

### Step-by-Step Implementation

#### 1. Backend — Ensure Routes Exist

Every module needs these API routes:

| Method | Route | Purpose |
|---|---|---|
| `GET /` | List view with search/filter | Returns array |
| `GET /:id` | Detail view | Returns object with nested data |
| `PUT /:id` | Update fields | Body = `{ field: value }` |
| `POST /` | Create new record | Body = required fields |

The `PUT` route should define an `allowed` array for safe whitelisting:

```js
router.put('/:id', (req, res) => {
    const allowed = ['Title', 'Status', 'Description', 'AssignedTo'];
    const f = []; const v = [];
    for (const [k, val] of Object.entries(req.body)) {
        if (allowed.includes(k)) { f.push(`${k}=?`); v.push(val); }
    }
    if (f.length === 0) return res.json({ success: true });
    f.push("UpdatedAt=datetime('now')");
    v.push(req.params.id);
    db.prepare(`UPDATE my_table SET ${f.join(',')} WHERE ID=?`).run(...v);
    res.json({ success: true });
});
```

#### 2. Frontend — State Setup

```jsx
const [detail, setDetail] = useState(null);    // current record for modal
const [editing, setEditing] = useState(false);  // toggle view/edit mode
const [editForm, setEditForm] = useState({});   // editable field values
const ef = (k, v) => setEditForm(p => ({ ...p, [k]: v }));
```

#### 3. Frontend — Action Buttons in Table Row

```jsx
<td style={{ display: 'flex', gap: 2 }}>
    <ActionBtn icon={Eye} tip="View" color="#3b82f6"
        onClick={() => loadDetail(item.ID)} />
    <ActionBtn icon={Pencil} tip="Edit" color="#f59e0b"
        onClick={() => { loadDetail(item.ID).then(() => startEdit()); }} />
</td>
```

#### 4. Frontend — Detail Modal with DetailHeader

```jsx
{detail && (
    <div className="modal-overlay" onClick={() => { setDetail(null); setEditing(false); }}>
        <div className="glass-card modal-content-standard" onClick={e => e.stopPropagation()}>
            <DetailHeader
                title={<><Icon size={20} /> {detail.Title}</>}
                color="#3b82f6"
                onPrint={() => window.triggerTrierPrint('my-type', detail)}
                onEdit={() => startEdit()}
                editing={editing}
                onSave={handleSave}
                onCancel={() => setEditing(false)}
                onClose={() => { setDetail(null); setEditing(false); }}
            />
            <div style={{ padding: 20 }}>
                {!editing ? (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                        <InfoRow label="Field" value={detail.Field} />
                    </div>
                ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 15 }}>
                        <FF label="Field" value={editForm.Field} onChange={v => ef('Field', v)} />
                    </div>
                )}
            </div>
        </div>
    </div>
)}
```

#### 5. PrintEngine — Add a Case

```jsx
case 'my-type': {
    content = (
        <>
            {renderHeader('Document Title', data.ID)}
            {renderSectionHeader('Details')}
            {renderProperties([
                { label: 'Field', value: data.Field },
            ])}
            {renderSectionHeader('Authorization')}
            {renderSignatures(['Manager', 'Date'])}
        </>
    );
    break;
}
```

#### 6. Update This Reference

Add the new print type to the table in this file.

### Reusable Helper Components

| Component | Purpose | Example |
|---|---|---|
| `ActionBtn` | Icon button in table Actions column | `<ActionBtn icon={Eye} tip="View" color="#3b82f6" />` |
| `InfoRow` | Read-only label/value pair | `<InfoRow label="Status" value={detail.Status} />` |
| `DetailHeader` | Modal header with Print/Edit/Save/Cancel/Close | See example above |
| `Badge` | Color-coded status tag | `<Badge color="#10b981">Active</Badge>` |
| `FF` (FormField) | Labeled input/select for edit forms | `<FF label="Name" value={form.Name} onChange={v => ...} />` |

### Checklist for New Modules

- [ ] `GET /api/module` — list endpoint with search/filter
- [ ] `GET /api/module/:id` — detail endpoint with nested data
- [ ] `PUT /api/module/:id` — update endpoint with allowed fields
- [ ] Table rows have 👁️ View and ✏️ Edit `ActionBtn` columns
- [ ] Detail modal uses `DetailHeader` with Print, Edit, Save, Cancel, Close
- [ ] View mode renders `InfoRow` grid
- [ ] Edit mode renders `FF` form fields
- [ ] PrintEngine has a `case` for the print type
- [ ] PrintSystem.md updated with the new print type
- [ ] Data seeded with realistic records
