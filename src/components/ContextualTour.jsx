// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — Contextual Tour System
 * ===================================
 * Per-view guided tours that walk users through every task a section can
 * perform. Purely on-demand (never auto-starts). Tab-aware: automatically
 * selects the correct tour steps based on which sub-tab is currently active.
 *
 * KEY FEATURES:
 *   - Tour definitions: step arrays keyed by "viewId" or "viewId-tabId"
 *   - Element highlighting: CSS spotlight overlay with pointer arrow
 *   - Step navigation: Prev / Next with step counter and progress bar
 *   - Tab-switching: tour auto-advances to the correct tab before showing a step
 *   - Keyboard support: → / ← to navigate, Esc to exit tour
 *   - Completion tracking: localStorage flag per tour — "Mark as done" button
 *   - TakeTourButton: floating trigger rendered in each view's header
 *   - Scheduled tours: calendar integration for training session scheduling
 *
 * TOUR ID RESOLUTION:
 *   Checks `tourId + "-" + nestedTab` first; falls back to `tourId` alone.
 *   Example: "assets-bom" → "assets" fallback if bom-specific tour not defined.
 *
 * @param {string}   tourId     — View/section identifier for tour lookup
 * @param {string}   nestedTab  — Active sub-tab (optional; narrows tour selection)
 * @param {Function} onClose    — Callback when tour is dismissed or completed
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Sparkles, ChevronRight, ChevronLeft, X, GraduationCap, Calendar } from 'lucide-react';
import { useTranslation } from '../i18n/index.jsx';

// ═══════════════════════════════════════════════════════════════════
// TOUR DEFINITIONS — Steps for each view / tab
// ═══════════════════════════════════════════════════════════════════
// Keys follow the pattern: "viewId" or "viewId-nestedTabId"
// The TakeTourButton resolves: tourId + "-" + nestedTab first,
// then falls back to the base tourId.
// ═══════════════════════════════════════════════════════════════════

const TOURS = {

    // ────────── DASHBOARD ──────────
    dashboard: {
        label: 'Dashboard',
        steps: [
            { target: null, title: '📊 Dashboard Overview', body: 'Your main command center. This tour will walk you through every feature on the dashboard.', position: 'center', icon: '📊' },
            { targetQuery: '.dashboard-kpi-row, [class*="kpi"]', title: '📈 KPI Summary Cards', body: 'These cards show your key metrics at a glance: open work orders, overdue PMs, asset health scores, and completion rates. The numbers update in real-time.', position: 'bottom', icon: '📈' },
            { targetQuery: 'button[title*="Smart Scan"]', title: '📸 Quick Scanner', body: 'Scan any barcode or QR code to instantly pull up a work order, part, or asset. Works with your device camera.', position: 'bottom', icon: '📸' },
            { targetQuery: '.search-bar, input[placeholder*="Search"]', title: '🔍 Dashboard Search', body: 'Type a keyword and press Enter to search across all work orders, assets, and parts. Results appear right here on the dashboard.', position: 'bottom', icon: '🔍' },
            { target: null, title: '✅ Dashboard Tour Complete', body: 'You now know the key features of your dashboard. Customize your view by changing your plant selector at the top.', position: 'center', icon: '🎯', isFinal: true },
        ]
    },

    // ────────── JOBS — Tab-specific tours ──────────
    'jobs-work-orders': {
        label: 'Active Work Orders',
        steps: [
            { target: null, title: '🔧 Active Work Orders', body: 'This is where all open and in-progress work orders live. Create, assign, track, and close-out jobs here.', position: 'center', icon: '🔧' },
            { targetQuery: 'input[placeholder*="FROM"], input[type="date"]', title: '📅 Date Range Filter', body: 'Use the FROM and TO date fields to narrow your view to work orders created or due within a specific window.', position: 'bottom', icon: '📅' },
            { targetQuery: 'select, button[title*="Status"]', title: '🔽 Status & Priority Filters', body: 'Filter by status (Open, In Progress, Closed), priority level, and assigned user to focus on what matters most.', position: 'bottom', icon: '🔽' },
            { targetQuery: 'button[title*="New WO"], button[title*="New Work Order"]', title: '➕ Create a Work Order', body: 'Click "+ New WO" to create a work order. Fill in the asset, priority, description, and assign a technician. The WO number is auto-generated.', position: 'bottom', icon: '➕' },
            { targetQuery: 'button[title*="Print"]', title: '🖨️ Print List', body: 'Print the full filtered list of work orders for your shift binder, clipboard, or control room wall board.', position: 'bottom', icon: '🖨️' },
            { targetQuery: '.data-table, table', title: '📋 Work Order Table', body: 'Click any row to open the full detail panel. From there you can edit fields, log labor hours, attach parts, add notes, or run the Close-Out Wizard.', position: 'top', icon: '📋' },
            { targetQuery: 'button[title*="View"]', title: '👁️ View Details', body: 'The View button opens the complete work order. You can edit, print, attach photos, log labor, add parts consumed, and close the job.', position: 'bottom', icon: '👁️' },
            { target: null, title: '✅ Work Orders Tour Complete', body: 'Key actions: Create WO → Assign tech → Log labor & parts → Close-Out Wizard. PM schedules auto-generate work orders when due.', position: 'center', icon: '🎯', isFinal: true },
        ]
    },
    'jobs-pm-schedules': {
        label: 'PM Schedules',
        steps: [
            { target: null, title: '📅 Preventive Maintenance Schedules', body: 'Configure recurring maintenance tasks. PM schedules automatically generate work orders when their due date or meter threshold is reached.', position: 'center', icon: '📅' },
            { targetQuery: 'button[title*="new"], button[title*="New"]', title: '➕ Create PM Schedule', body: 'Click "New PM" to define a new preventive maintenance schedule. Set the frequency (days, weeks, months), asset, and assigned technician.', position: 'bottom', icon: '➕' },
            { targetQuery: '.data-table, table', title: '📋 Schedule List', body: 'Each row shows a PM schedule with its frequency, next run date, and status. Click "View" to see full details and edit parameters.', position: 'top', icon: '📋' },
            { targetQuery: 'button[title*="View"]', title: '🔍 PM Detail Panel', body: 'Inside the detail panel you can edit frequency, change trigger mode (time-based, meter-based, or both), set the assigned tech, and write maintenance instructions.', position: 'bottom', icon: '🔍' },
            { targetQuery: 'button[title*="Print"]', title: '🖨️ Print Full List', body: 'Print your complete PM schedule list for posting in the maintenance office or shift binder.', position: 'bottom', icon: '🖨️' },
            { target: null, title: '✅ PM Schedules Tour Complete', body: 'Key actions: Create PMs → Set frequency/trigger → Assign technicians → System auto-generates WOs on due dates. Never miss a PM again!', position: 'center', icon: '🎯', isFinal: true },
        ]
    },
    'jobs-calendar': {
        label: 'Calendar View',
        steps: [
            { target: null, title: '📆 Maintenance Calendar', body: 'Visual calendar showing all scheduled work, PM cycles, and key dates. Drag and click to manage your maintenance timeline.', position: 'center', icon: '📆' },
            { targetQuery: 'button[title*="prev"], button[title*="Prev"]', title: '⬅️ Navigate Months', body: 'Use the arrow buttons to move between months and see upcoming or past scheduled work.', position: 'bottom', icon: '⬅️' },
            { targetQuery: '.calendar-grid, [class*="calendar"]', title: '📅 Calendar Grid', body: 'Each day cell shows scheduled work orders and PM events. Color coding matches priority levels. Click any event to view details.', position: 'top', icon: '📅' },
            { target: null, title: '✅ Calendar Tour Complete', body: 'The calendar gives you a bird\'s-eye view of your maintenance workload. Use it to spot overloaded weeks and balance technician assignments.', position: 'center', icon: '🎯', isFinal: true },
        ]
    },
    'jobs-workforce-analytics': {
        label: 'Workforce Analytics',
        steps: [
            { target: null, title: '📊 Workforce Analytics', body: 'Understand how your maintenance team performs. Track technician efficiency, plant benchmarks, SOP effectiveness, and workload distribution.', position: 'center', icon: '📊' },
            { targetQuery: '.data-table, table, [class*="chart"]', title: '📈 Performance Metrics', body: 'View charts and tables showing completion rates, average repair times, and technician utilization across your plant.', position: 'top', icon: '📈' },
            { target: null, title: '✅ Workforce Analytics Tour Complete', body: 'Use these insights to identify training needs, balance workloads, and recognize top performers on your team.', position: 'center', icon: '🎯', isFinal: true },
        ]
    },
    'jobs-tech-workload': {
        label: 'Tech Workload',
        steps: [
            { target: null, title: '👷 Technician Workload', body: 'See how work is distributed across your maintenance team. Identify overloaded or idle techs at a glance.', position: 'center', icon: '👷' },
            { targetQuery: '.data-table, table, [class*="workload"]', title: '📊 Workload Distribution', body: 'Each technician\'s active, pending, and completed work orders are shown. Color-coded bars indicate capacity utilization.', position: 'top', icon: '📊' },
            { target: null, title: '✅ Tech Workload Tour Complete', body: 'Balance your team by reassigning work from overloaded techs. Click any WO to change its assignment directly.', position: 'center', icon: '🎯', isFinal: true },
        ]
    },

    // Fallback for Jobs if no nested tab is passed
    jobs: {
        label: 'Jobs Dashboard',
        steps: [
            { target: null, title: '🔧 Jobs Dashboard', body: 'Your work management hub. Use the tabs above to switch between Work Orders, PM Schedules, Calendar, and Analytics.', position: 'center', icon: '🔧' },
            { targetQuery: '.nav-pills', title: '📑 Section Tabs', body: 'Each tab has its own Take Tour — switch to a tab and click Take Tour again for a detailed walkthrough of that section.', position: 'bottom', icon: '📑' },
            { target: null, title: '✅ Jobs Tour Complete', body: 'Switch to any tab (Work Orders, PM Schedules, Calendar, etc.) and click Take Tour for a detailed walkthrough of that section.', position: 'center', icon: '🎯', isFinal: true },
        ]
    },

    // ────────── PARTS — Tab-specific tours ──────────
    'parts-inventory': {
        label: 'Local Inventory',
        steps: [
            { target: null, title: '📦 Local Parts Inventory', body: 'Browse, search, and manage every part in your plant\'s storeroom. Track quantities, locations, costs, and reorder points.', position: 'center', icon: '📦' },
            { targetQuery: '.search-bar, input[placeholder*="Search"]', title: '🔍 Part Search', body: 'Search by part number, description, vendor, or alternate part numbers. Results filter in real-time.', position: 'bottom', icon: '🔍' },
            { targetQuery: 'button[title*="Add"], button[title*="Create"]', title: '➕ Add New Part', body: 'Add a new part to your storeroom. Enter the part number, description, location, reorder point, cost, and vendor.', position: 'bottom', icon: '➕' },
            { targetQuery: '.data-table, table', title: '📋 Inventory Table', body: 'Click any row to open the part detail panel. View stock levels, usage history, which work orders consumed this part, and print labels.', position: 'top', icon: '📋' },
            { target: null, title: '✅ Inventory Tour Complete', body: 'Key actions: Search parts → View details → Adjust stock → Set reorder points → Track vendor info and cost history.', position: 'center', icon: '🎯', isFinal: true },
        ]
    },
    'parts-adjustments': {
        label: 'Inventory Adjustments',
        steps: [
            { target: null, title: '📝 Inventory Adjustments', body: 'Record any manual stock changes — cycle counts, corrections, shrinkage, and receiving. Every adjustment is audited.', position: 'center', icon: '📝' },
            { targetQuery: 'button[title*="New"], button[title*="Create"]', title: '➕ New Adjustment', body: 'Create a new inventory adjustment record. Select the part, reason, and quantity change (positive or negative).', position: 'bottom', icon: '➕' },
            { targetQuery: '.data-table, table', title: '📋 Adjustment History', body: 'Every adjustment is timestamped with who made it and why. Click any row for the full audit trail.', position: 'top', icon: '📋' },
            { target: null, title: '✅ Adjustments Tour Complete', body: 'Use adjustments for cycle counts, receiving, write-offs, and corrections. Each one creates an auditable record.', position: 'center', icon: '🎯', isFinal: true },
        ]
    },
    'parts-vendors': {
        label: 'Vendors & POs',
        steps: [
            { target: null, title: '🚚 Vendors & Purchase Orders', body: 'Manage your supplier relationships and track all purchase orders from requisition to receipt.', position: 'center', icon: '🚚' },
            { targetQuery: 'button[title*="New"], button[title*="Create"]', title: '➕ Create Purchase Order', body: 'Start a new PO by selecting a vendor, adding line items, and submitting for approval.', position: 'bottom', icon: '➕' },
            { targetQuery: '.data-table, table', title: '📋 PO List', body: 'Track PO status from Draft → Submitted → Approved → Received. Click any PO for the full detail with line items and costs.', position: 'top', icon: '📋' },
            { target: null, title: '✅ Vendors Tour Complete', body: 'Key actions: Create POs, track approvals, log receipts, and manage vendor contact information.', position: 'center', icon: '🎯', isFinal: true },
        ]
    },
    'parts-logistics': {
        label: 'Global Logistics',
        steps: [
            { target: null, title: '🌐 Global Logistics', body: 'Search for parts across ALL company plants. Find critical spares at other locations and request transfers.', position: 'center', icon: '🌐' },
            { targetQuery: '.search-bar, input[placeholder*="Search"]', title: '🔍 Cross-Plant Search', body: 'Enter a part number to search every plant database simultaneously. Results show quantity on hand at each location.', position: 'bottom', icon: '🔍' },
            { targetQuery: '.data-table, table', title: '📋 Availability Results', body: 'See which plants have the part in stock, their quantities, and storeroom locations. Request an inter-plant transfer directly from here.', position: 'top', icon: '📋' },
            { target: null, title: '✅ Logistics Tour Complete', body: 'When you need a part urgently, search here first before ordering from a vendor. Inter-plant transfers are faster and cheaper.', position: 'center', icon: '🎯', isFinal: true },
        ]
    },
    parts: {
        label: 'Parts & Logistics',
        steps: [
            { target: null, title: '📦 Parts & Logistics', body: 'Your inventory management hub. Use the tabs to switch between Inventory, Adjustments, Vendors, and Global Logistics.', position: 'center', icon: '📦' },
            { targetQuery: '.nav-pills', title: '📑 Section Tabs', body: 'Each tab has its own tour. Switch to a tab and click Take Tour for a detailed walkthrough of that specific section.', position: 'bottom', icon: '📑' },
            { target: null, title: '✅ Parts Tour Complete', body: 'Switch to any tab and click Take Tour for a detailed walkthrough of that section.', position: 'center', icon: '🎯', isFinal: true },
        ]
    },

    // ────────── ASSETS — Tab-specific tours ──────────
    'assets-registry': {
        label: 'Asset Registry',
        steps: [
            { target: null, title: '⚙️ Asset Registry', body: 'Browse, search, and manage every piece of equipment registered at this plant. Each asset has a health score, maintenance history, and linked parts.', position: 'center', icon: '⚙️' },
            { targetQuery: '.search-bar, input[placeholder*="Search"]', title: '🔍 Asset Search', body: 'Search by asset tag, description, location, or manufacturer. Find any piece of equipment instantly.', position: 'bottom', icon: '🔍' },
            { targetQuery: 'button[title*="Add"], button[title*="New"], button[title*="Create"]', title: '➕ Register New Asset', body: 'Click here to add a new asset. Enter the tag number, description, location, manufacturer, model, serial number, and install date.', position: 'bottom', icon: '➕' },
            { targetQuery: '.data-table, table', title: '📋 Asset Table', body: 'Click any row to open the full asset profile. View maintenance history, parts consumed, health score breakdown, and attached documents like manuals or photos.', position: 'top', icon: '📋' },
            { target: null, title: '✅ Asset Registry Tour Complete', body: 'Key actions: Register assets → View health scores → Review maintenance history → Attach documents → Print asset reports.', position: 'center', icon: '🎯', isFinal: true },
        ]
    },
    'assets-downtime': {
        label: 'Downtime Tracking',
        steps: [
            { target: null, title: '⏱️ Downtime Tracking', body: 'Log and analyze equipment downtime events. Identify your worst offenders and track Mean Time Between Failures (MTBF).', position: 'center', icon: '⏱️' },
            { targetQuery: 'button[title*="Add"], button[title*="New"], button[title*="Log"]', title: '➕ Log Downtime Event', body: 'Record a new downtime event. Select the asset, start/end times, failure category, and root cause description.', position: 'bottom', icon: '➕' },
            { targetQuery: '.data-table, table', title: '📋 Downtime History', body: 'View all logged downtime events sorted by date. Click any entry for the full detail including duration, cost impact, and corrective action taken.', position: 'top', icon: '📋' },
            { target: null, title: '✅ Downtime Tour Complete', body: 'Consistent downtime tracking reveals patterns. Use this data to justify capital replacements and prioritize PM schedules.', position: 'center', icon: '🎯', isFinal: true },
        ]
    },
    'assets-parts-used': {
        label: 'Parts Usage',
        steps: [
            { target: null, title: '🔩 Parts Used by Assets', body: 'See which parts have been consumed by each asset. Track cost trends and identify assets that are eating through your spare parts budget.', position: 'center', icon: '🔩' },
            { targetQuery: '.data-table, table', title: '📋 Parts Usage Table', body: 'Each row shows a part consumption record: which asset used it, how many, the cost, and which work order it was charged to.', position: 'top', icon: '📋' },
            { target: null, title: '✅ Parts Usage Tour Complete', body: 'Use this data to forecast spare parts demand and identify assets with unusually high consumption rates.', position: 'center', icon: '🎯', isFinal: true },
        ]
    },
    'assets-logistics': {
        label: 'Asset Logistics',
        steps: [
            { target: null, title: '🌐 Asset Logistics', body: 'Search for equipment across ALL company plants. Find spare machines, backup equipment, or replacement units at sister facilities.', position: 'center', icon: '🌐' },
            { targetQuery: '.search-bar, input[placeholder*="Search"]', title: '🔍 Cross-Plant Asset Search', body: 'Enter an asset tag, description, or model to search every plant\'s equipment registry simultaneously.', position: 'bottom', icon: '🔍' },
            { targetQuery: '.data-table, table', title: '📋 Availability Results', body: 'See which plants have matching equipment, whether it\'s in production or spare, and contact info for requesting a transfer.', position: 'top', icon: '📋' },
            { target: null, title: '✅ Asset Logistics Tour Complete', body: 'Before renting or buying emergency equipment, search here first to find available units at other company locations.', position: 'center', icon: '🎯', isFinal: true },
        ]
    },
    'assets-floorplan': {
        label: 'Floor Plans',
        steps: [
            { target: null, title: '🗺️ Floor Plans', body: 'Visual facility maps showing equipment placement. Drag and drop asset icons to build an interactive floor plan of your plant.', position: 'center', icon: '🗺️' },
            { target: null, title: '📍 Asset Placement', body: 'Click an asset icon from the palette and place it on the floor plan. Connect assets with process flow lines to show your production layout.', position: 'center', icon: '📍' },
            { target: null, title: '✅ Floor Plans Tour Complete', body: 'Floor plans help new technicians find equipment quickly and give managers a visual overview of the facility layout.', position: 'center', icon: '🎯', isFinal: true },
        ]
    },
    assets: {
        label: 'Assets & Machinery',
        steps: [
            { target: null, title: '⚙️ Assets & Machinery', body: 'Your equipment management hub. Use the tabs to switch between Asset Registry, Downtime, Parts Used, Logistics, and Floor Plans.', position: 'center', icon: '⚙️' },
            { targetQuery: '.nav-pills', title: '📑 Section Tabs', body: 'Each tab has its own tour. Switch to a tab and click Take Tour for a detailed walkthrough of that section.', position: 'bottom', icon: '📑' },
            { target: null, title: '✅ Assets Tour Complete', body: 'Switch to any tab and click Take Tour for a detailed walkthrough of that section.', position: 'center', icon: '🎯', isFinal: true },
        ]
    },

    // ────────── FLEET — Tab-specific tours ──────────
    'fleet-vehicles': {
        label: 'Vehicle Registry',
        steps: [
            { target: null, title: '🚛 Vehicle Registry', body: 'Browse, search, and manage every vehicle in your fleet. Track mileage, service intervals, and assigned drivers.', position: 'center', icon: '🚛' },
            { targetQuery: '.search-bar, input[placeholder*="Search"]', title: '🔍 Vehicle Search', body: 'Search by vehicle number, VIN, make, model, year, or assigned driver.', position: 'bottom', icon: '🔍' },
            { targetQuery: 'button[title*="Add"], button[title*="New"]', title: '➕ Add Vehicle', body: 'Register a new vehicle. Enter the unit number, VIN, make, model, year, license plate, and assigned driver.', position: 'bottom', icon: '➕' },
            { targetQuery: '.data-table, table', title: '📋 Vehicle List', body: 'Click any vehicle to see its full profile: service history, upcoming PMs by mileage, DVIR records, and fuel consumption.', position: 'top', icon: '📋' },
            { target: null, title: '✅ Vehicles Tour Complete', body: 'Key actions: Register vehicles → Log mileage → Schedule PMs by miles/hours → Track service history.', position: 'center', icon: '🎯', isFinal: true },
        ]
    },
    'fleet-dvir': {
        label: 'DVIR Inspections',
        steps: [
            { target: null, title: '📋 DVIR Inspections', body: 'Driver Vehicle Inspection Reports (DVIR). Log pre-trip and post-trip inspections to maintain DOT/FMCSA compliance.', position: 'center', icon: '📋' },
            { targetQuery: 'button[title*="New"], button[title*="Create"], button[title*="Add"]', title: '➕ New DVIR', body: 'Start a new inspection report. Select the vehicle, check each inspection point, and note any defects that need repair.', position: 'bottom', icon: '➕' },
            { targetQuery: '.data-table, table', title: '📋 Inspection History', body: 'View all past DVIRs. Click any report to see the full checklist, defects found, and whether repairs were completed before the next trip.', position: 'top', icon: '📋' },
            { target: null, title: '✅ DVIR Tour Complete', body: 'Consistent DVIRs protect your drivers and company. Every inspection is timestamped and permanently stored for DOT audits.', position: 'center', icon: '🎯', isFinal: true },
        ]
    },
    'fleet-fuel': {
        label: 'Fuel Tracking',
        steps: [
            { target: null, title: '⛽ Fuel Tracking', body: 'Log fuel purchases, track consumption per vehicle, and monitor fuel cost trends across your fleet.', position: 'center', icon: '⛽' },
            { targetQuery: 'button[title*="Add"], button[title*="Log"], button[title*="New"]', title: '➕ Log Fuel Purchase', body: 'Record a fuel transaction: select the vehicle, enter gallons, cost, odometer reading, and fuel type.', position: 'bottom', icon: '➕' },
            { targetQuery: '.data-table, table', title: '📋 Fuel History', body: 'View all fuel transactions. The system calculates MPG and cost per mile for each vehicle automatically.', position: 'top', icon: '📋' },
            { target: null, title: '✅ Fuel Tour Complete', body: 'Monitor fuel efficiency trends. Sudden drops in MPG can indicate maintenance issues like clogged filters or tire problems.', position: 'center', icon: '🎯', isFinal: true },
        ]
    },
    fleet: {
        label: 'Fleet & Vehicles',
        steps: [
            { target: null, title: '🚛 Fleet & Truck Shop', body: 'Your vehicle management hub. Use the tabs to switch between Vehicles, DVIR Inspections, and Fuel Tracking.', position: 'center', icon: '🚛' },
            { targetQuery: '.nav-pills', title: '📑 Fleet Tabs', body: 'Each tab has its own tour. Switch to a tab and click Take Tour for a detailed walkthrough.', position: 'bottom', icon: '📑' },
            { target: null, title: '✅ Fleet Tour Complete', body: 'Switch to any tab and click Take Tour for a detailed walkthrough of that section.', position: 'center', icon: '🎯', isFinal: true },
        ]
    },

    // ────────── SAFETY — Tab-specific tours ──────────
    'safety-permits': {
        label: 'Safety Permits',
        steps: [
            { target: null, title: '📝 Safety Permits', body: 'Issue, track, and manage safety work permits including Hot Work, Confined Space Entry, and LOTO lockout/tagout procedures.', position: 'center', icon: '📝' },
            { targetQuery: 'button[title*="Create"], button[title*="New"], button[title*="Issue"]', title: '➕ Issue New Permit', body: 'Create a new safety permit. Select the type, specify the work area, hazards, required PPE, and authorized personnel.', position: 'bottom', icon: '➕' },
            { targetQuery: '.data-table, table', title: '📋 Active Permits', body: 'View all active and expired permits. Click any permit for the full detail including signatures, conditions, and expiration status.', position: 'top', icon: '📋' },
            { target: null, title: '✅ Permits Tour Complete', body: 'Never start hazardous work without a permit. The system tracks expirations and sends alerts when permits are about to expire.', position: 'center', icon: '🎯', isFinal: true },
        ]
    },
    'safety-incidents': {
        label: 'Incident Reports',
        steps: [
            { target: null, title: '🚨 Incident Reports', body: 'Log and investigate safety incidents, near-misses, and environmental events. Track corrective actions to closure.', position: 'center', icon: '🚨' },
            { targetQuery: 'button[title*="Create"], button[title*="New"], button[title*="Report"]', title: '➕ Report Incident', body: 'File a new incident report. Record the date, location, involved personnel, injury details, and immediate actions taken.', position: 'bottom', icon: '➕' },
            { targetQuery: '.data-table, table', title: '📋 Incident Log', body: 'View all reported incidents. Click any report for the full investigation, root cause, corrective actions, and OSHA recordability status.', position: 'top', icon: '📋' },
            { target: null, title: '✅ Incidents Tour Complete', body: 'Every incident — including near-misses — should be reported. Trend analysis of near-misses prevents serious injuries.', position: 'center', icon: '🎯', isFinal: true },
        ]
    },
    'safety-calibration': {
        label: 'Calibration Records',
        steps: [
            { target: null, title: '🔧 Calibration Tracking', body: 'Manage instrument calibration schedules and records. Track calibration due dates, certificates, and out-of-tolerance events.', position: 'center', icon: '🔧' },
            { targetQuery: 'button[title*="Add"], button[title*="New"], button[title*="Schedule"]', title: '➕ Schedule Calibration', body: 'Add a new instrument to the calibration program or schedule a calibration event for an existing instrument.', position: 'bottom', icon: '➕' },
            { targetQuery: '.data-table, table', title: '📋 Calibration Records', body: 'View all instruments and their calibration status. Color coding shows overdue (red), due soon (yellow), and current (green).', position: 'top', icon: '📋' },
            { target: null, title: '✅ Calibration Tour Complete', body: 'Maintain calibration schedules for food safety, quality, and regulatory compliance. Overdue calibrations can trigger audit findings.', position: 'center', icon: '🎯', isFinal: true },
        ]
    },
    safety: {
        label: 'Safety & Compliance',
        steps: [
            { target: null, title: '🛡️ Safety & Compliance', body: 'Your safety management hub. Use the tabs to switch between Permits, Incidents, and Calibration tracking.', position: 'center', icon: '🛡️' },
            { targetQuery: '.nav-pills', title: '📑 Safety Tabs', body: 'Each tab has its own tour. Switch to a tab and click Take Tour for a detailed walkthrough.', position: 'bottom', icon: '📑' },
            { target: null, title: '✅ Safety Tour Complete', body: 'Switch to any tab and click Take Tour for a detailed walkthrough of that section.', position: 'center', icon: '🎯', isFinal: true },
        ]
    },

    // ────────── ENGINEERING — Tab-specific tours ──────────
    'engineering-rca': {
        label: 'Root Cause Analysis',
        steps: [
            { target: null, title: '🔍 Root Cause Analysis', body: 'Investigate equipment failures using structured 5-Why analysis. Document findings and corrective actions to prevent recurrence.', position: 'center', icon: '🔍' },
            { targetQuery: 'button[title*="Create"], button[title*="New"]', title: '➕ Start New RCA', body: 'Begin a new root cause investigation. Select the failed asset, describe the failure, and walk through the 5-Why questioning chain.', position: 'bottom', icon: '➕' },
            { targetQuery: '.data-table, table', title: '📋 RCA Records', body: 'Click any RCA to see the full investigation: failure description, 5-Why chain, root cause determination, and corrective/preventive actions.', position: 'top', icon: '📋' },
            { target: null, title: '✅ RCA Tour Complete', body: 'Every major failure deserves an RCA. The knowledge captured here prevents repeat failures and builds your engineering knowledge base.', position: 'center', icon: '🎯', isFinal: true },
        ]
    },
    'engineering-fmea': {
        label: 'FMEA Studies',
        steps: [
            { target: null, title: '📊 FMEA Studies', body: 'Failure Mode & Effects Analysis. Proactively assess risk by scoring Severity, Occurrence, and Detection for potential failure modes.', position: 'center', icon: '📊' },
            { targetQuery: 'button[title*="Create"], button[title*="New"]', title: '➕ New FMEA Study', body: 'Start a new FMEA. Define the system/asset, list potential failure modes, and score each for severity, occurrence, and detection.', position: 'bottom', icon: '➕' },
            { targetQuery: '.data-table, table', title: '📋 FMEA Records', body: 'Each study shows its Risk Priority Number (RPN). Higher RPNs need immediate mitigation. Click for full scoring details.', position: 'top', icon: '📋' },
            { target: null, title: '✅ FMEA Tour Complete', body: 'FMEA is your proactive reliability tool. Focus on high-RPN items first to get the most risk reduction per dollar spent.', position: 'center', icon: '🎯', isFinal: true },
        ]
    },
    'engineering-ecn': {
        label: 'Engineering Changes',
        steps: [
            { target: null, title: '📋 Engineering Change Notices', body: 'Submit, review, and track engineering changes to equipment, processes, or procedures. Full approval workflow included.', position: 'center', icon: '📋' },
            { targetQuery: 'button[title*="Create"], button[title*="New"], button[title*="Submit"]', title: '➕ Submit ECN', body: 'File a new Engineering Change Notice. Describe the proposed change, affected assets, justification, and estimated cost.', position: 'bottom', icon: '➕' },
            { targetQuery: '.data-table, table', title: '📋 ECN Tracker', body: 'Track ECN status from Draft → Submitted → Under Review → Approved → Implemented. Click any ECN for the full change package.', position: 'top', icon: '📋' },
            { target: null, title: '✅ ECN Tour Complete', body: 'Good change management prevents unintended consequences. Every modification to equipment or processes should go through the ECN workflow.', position: 'center', icon: '🎯', isFinal: true },
        ]
    },
    'engineering-projects': {
        label: 'Capital Projects',
        steps: [
            { target: null, title: '🏗️ Capital Projects', body: 'Track maintenance and engineering projects from planning through completion. Manage budgets, milestones, and resource allocation.', position: 'center', icon: '🏗️' },
            { targetQuery: 'button[title*="Create"], button[title*="New"]', title: '➕ Create Project', body: 'Define a new project with scope, budget, timeline, and responsible engineers.', position: 'bottom', icon: '➕' },
            { targetQuery: '.data-table, table', title: '📋 Project List', body: 'View all projects with status, budget utilization, and completion percentage. Click any project for the full detail.', position: 'top', icon: '📋' },
            { target: null, title: '✅ Projects Tour Complete', body: 'Use projects to manage capital expenditures, track ROI, and keep stakeholders informed on progress.', position: 'center', icon: '🎯', isFinal: true },
        ]
    },
    'engineering-lube': {
        label: 'Lubrication Routes',
        steps: [
            { target: null, title: '🛢️ Lubrication Management', body: 'Define and manage lubrication routes. Specify lube points, oil types, quantities, and frequencies for each asset.', position: 'center', icon: '🛢️' },
            { targetQuery: '.data-table, table', title: '📋 Lube Routes', body: 'Each route lists the assets, lube points, required lubricant types, quantities, and schedule. Click to edit or print route sheets for technicians.', position: 'top', icon: '📋' },
            { target: null, title: '✅ Lubrication Tour Complete', body: 'Proper lubrication is the #1 way to extend equipment life. Standardized routes ensure nothing gets missed.', position: 'center', icon: '🎯', isFinal: true },
        ]
    },
    'engineering-oil': {
        label: 'Oil Analysis',
        steps: [
            { target: null, title: '🧪 Oil Analysis Tracking', body: 'Track oil sample results from your lab. Monitor contamination levels, wear metals, and viscosity trends to predict failures before they happen.', position: 'center', icon: '🧪' },
            { targetQuery: 'button[title*="Add"], button[title*="New"], button[title*="Log"]', title: '➕ Log Sample Results', body: 'Enter oil analysis results from the lab. Record sample date, asset, oil type, contamination levels, and wear metal concentrations.', position: 'bottom', icon: '➕' },
            { targetQuery: '.data-table, table', title: '📋 Analysis History', body: 'Color-coded results flag abnormal readings. Click any sample for the full lab report with trend charts over time.', position: 'top', icon: '📋' },
            { target: null, title: '✅ Oil Analysis Tour Complete', body: 'Oil analysis is predictive maintenance at its best. Catching bearing wear early in oil samples prevents catastrophic failures.', position: 'center', icon: '🎯', isFinal: true },
        ]
    },
    engineering: {
        label: 'Engineering',
        steps: [
            { target: null, title: '🔬 Engineering Excellence', body: 'Your advanced engineering toolkit. Use the tabs to access RCA, FMEA, ECN, Projects, Lubrication, and Oil Analysis.', position: 'center', icon: '🔬' },
            { targetQuery: '.nav-pills', title: '📑 Engineering Tabs', body: 'Each tab has its own tour. Switch to a tab and click Take Tour for a detailed walkthrough.', position: 'bottom', icon: '📑' },
            { target: null, title: '✅ Engineering Tour Complete', body: 'Switch to any tab and click Take Tour for a detailed walkthrough of that section.', position: 'center', icon: '🎯', isFinal: true },
        ]
    },

    // ────────── CONTRACTORS — Tab-specific tours ──────────
    'contractors-contractors': {
        label: 'Contractor List',
        steps: [
            { target: null, title: '🏗️ Contractor Directory', body: 'Browse and manage all approved contractors. Track company info, trade specialties, insurance status, and performance ratings.', position: 'center', icon: '🏗️' },
            { targetQuery: '.search-bar, input[placeholder*="Search"]', title: '🔍 Find Contractors', body: 'Search by company name, trade specialty, contact name, or city. Quickly find the right contractor for the job.', position: 'bottom', icon: '🔍' },
            { targetQuery: 'button[title*="Add"], button[title*="New"]', title: '➕ Add Contractor', body: 'Register a new contractor. Enter company name, trade, contact info, insurance details, and rate structure.', position: 'bottom', icon: '➕' },
            { targetQuery: '.data-table, table', title: '📋 Contractor Table', body: 'Click any contractor for the full profile: insurance certificates, certifications, work history, and rate sheets.', position: 'top', icon: '📋' },
            { target: null, title: '✅ Contractor List Tour Complete', body: 'Keep insurance and certification records current. The system alerts you when contractor documents are expiring.', position: 'center', icon: '🎯', isFinal: true },
        ]
    },
    'contractors-certs': {
        label: 'Certifications',
        steps: [
            { target: null, title: '📜 Certifications & Insurance', body: 'Track contractor certifications, licenses, and insurance policies. Get alerts before documents expire.', position: 'center', icon: '📜' },
            { targetQuery: '.data-table, table', title: '📋 Certification Tracker', body: 'View all contractor certifications with expiration dates. Red flags indicate expired or soon-to-expire documents.', position: 'top', icon: '📋' },
            { target: null, title: '✅ Certifications Tour Complete', body: 'Never let a contractor on site with expired insurance. This tracker keeps you compliant and protected.', position: 'center', icon: '🎯', isFinal: true },
        ]
    },
    'contractors-jobs': {
        label: 'Contractor Jobs',
        steps: [
            { target: null, title: '📋 Contractor Work Orders', body: 'View all work orders assigned to external contractors. Track their progress, costs, and completion status.', position: 'center', icon: '📋' },
            { targetQuery: '.data-table, table', title: '📋 Contractor WOs', body: 'Each row shows a contractor-assigned work order with status, cost, and completion date. Click for full details.', position: 'top', icon: '📋' },
            { target: null, title: '✅ Contractor Jobs Tour Complete', body: 'Monitor contractor work closely. Compare estimated vs. actual costs and track on-time completion rates.', position: 'center', icon: '🎯', isFinal: true },
        ]
    },
    'contractors-stats': {
        label: 'Contractor Stats',
        steps: [
            { target: null, title: '📊 Contractor Performance', body: 'Analyze contractor performance metrics: on-time completion rates, cost accuracy, safety records, and quality scores.', position: 'center', icon: '📊' },
            { target: null, title: '✅ Stats Tour Complete', body: 'Use performance data to make informed decisions about contractor renewal, preferred vendor status, and rate negotiations.', position: 'center', icon: '🎯', isFinal: true },
        ]
    },
    contractors: {
        label: 'Contractors & Vendors',
        steps: [
            { target: null, title: '🏗️ Contractors & Vendor Portal', body: 'Your contractor management hub. Use the tabs to access the Contractor List, Certifications, Jobs, and Performance Stats.', position: 'center', icon: '🏗️' },
            { targetQuery: '.nav-pills', title: '📑 Contractor Tabs', body: 'Each tab has its own tour. Switch to a tab and click Take Tour for a detailed walkthrough.', position: 'bottom', icon: '📑' },
            { target: null, title: '✅ Contractors Tour Complete', body: 'Switch to any tab and click Take Tour for a detailed walkthrough of that section.', position: 'center', icon: '🎯', isFinal: true },
        ]
    },

    // ────────── ANALYTICS ──────────
    analytics: {
        label: 'Analytics',
        steps: [
            { target: null, title: '📊 OEE, Workforce & Analytics', body: 'Enterprise-wide analytics: OEE tracking, workforce utilization, plant comparisons, and predictive maintenance insights.', position: 'center', icon: '📊' },
            { targetQuery: '.nav-pills', title: '📑 Analytics Sections', body: 'Navigate between OEE Monitoring, Workforce Analytics, Plant Comparison, and Predictive Insights.', position: 'bottom', icon: '📑' },
            { target: null, title: '📈 Charts & Metrics', body: 'Each section shows interactive charts. Hover over data points for detail. Use date range filters to adjust the time period.', position: 'center', icon: '📈' },
            { target: null, title: '✅ Analytics Tour Complete', body: 'Key actions: Monitor OEE by asset, compare plant performance, track technician utilization, and review AI-generated maintenance predictions.', position: 'center', icon: '🎯', isFinal: true },
        ]
    },

    // ────────── SETTINGS ──────────
    settings: {
        label: 'Settings',
        steps: [
            { target: null, title: '⚙️ Settings Hub', body: 'Your personal settings and system configuration. All users can change passwords and preferences. Admins access the Admin Console.', position: 'center', icon: '⚙️' },
            { targetQuery: 'button[title*="My Account"], button[title*="Account"]', title: '👤 My Account', body: 'Change your password, select your language, replay the onboarding tour, and toggle shop floor display mode.', position: 'bottom', icon: '👤' },
            { targetQuery: 'button[title*="Notification"], button[title*="Escalation"]', title: '🔔 Notifications', body: 'Configure which email alerts you receive. Managers can set auto-escalation rules for overdue work orders.', position: 'bottom', icon: '🔔' },
            { targetQuery: 'button[title*="Monitoring"], button[title*="Compliance"]', title: '📡 Monitoring', body: 'Access the Sensor Gateway, compliance tracking, energy dashboards, and LOTO digital permits.', position: 'bottom', icon: '📡' },
            { targetQuery: '.btn-admin, button[title*="Admin Console"]', title: '🔐 Admin Console', body: 'IT Admins and Creators can manage users, database backups, integrations, webhooks, and branding from here.', position: 'bottom', icon: '🔐', adminOnly: true },
            { target: null, title: '✅ Settings Tour Complete', body: 'Key actions: Change password, set language, configure alerts, and (admins) manage users, backups, and integrations.', position: 'center', icon: '🎯', isFinal: true },
        ]
    },

    // ────────── HISTORY — Tab-specific tours ──────────
    'history-completed': {
        label: 'Completed Jobs',
        steps: [
            { target: null, title: '✅ Completed Jobs', body: 'All closed work orders are archived here. Review past maintenance for compliance, audits, and trend analysis.', position: 'center', icon: '✅' },
            { targetQuery: '.search-bar, input[placeholder*="Search"]', title: '🔍 Search Closed WOs', body: 'Search by WO number, asset, technician, or description. Filter by date range to find specific work.', position: 'bottom', icon: '🔍' },
            { targetQuery: '.data-table, table', title: '📋 Closed Work Orders', body: 'Click any row to see the full close-out details: labor hours, parts used, root cause, corrective action, and technician notes.', position: 'top', icon: '📋' },
            { target: null, title: '✅ Completed Jobs Tour Complete', body: 'Use this archive for audits, training, and identifying recurring issues by asset or failure type.', position: 'center', icon: '🎯', isFinal: true },
        ]
    },
    'history-pms': {
        label: 'Past PMs',
        steps: [
            { target: null, title: '📅 Historical PM Records', body: 'View all past preventive maintenance work orders, including completion dates, who performed the work, and elapsed time.', position: 'center', icon: '📅' },
            { targetQuery: '.data-table, table', title: '📋 PM History Table', body: 'Each row is a completed PM work order. Click to see the full details, parts consumed, and technician notes.', position: 'top', icon: '📋' },
            { target: null, title: '✅ Past PMs Tour Complete', body: 'Track PM compliance over time. Consistent PM completion reduces emergency breakdowns and extends asset life.', position: 'center', icon: '🎯', isFinal: true },
        ]
    },
    'history-reliability': {
        label: 'Asset Reliability',
        steps: [
            { target: null, title: '📊 Asset Reliability Analytics', body: 'MTBF/MTTR dashboards, OEE tracking, budget forecasting, and warranty intelligence — all in one view.', position: 'center', icon: '📊' },
            { targetQuery: 'button[title*="Print"]', title: '🖨️ Print Report', body: 'Generate a comprehensive reliability report with all analytics data compiled into a printable document.', position: 'bottom', icon: '🖨️' },
            { target: null, title: '✅ Reliability Tour Complete', body: 'Use MTBF trends to justify capital replacements and OEE data to identify bottleneck equipment.', position: 'center', icon: '🎯', isFinal: true },
        ]
    },
    'history-audit': {
        label: 'Audit Log',
        steps: [
            { target: null, title: '🛡️ System Audit Log', body: 'Every significant action in the system is logged here: transfers, deletions, user changes, and configuration modifications.', position: 'center', icon: '🛡️' },
            { targetQuery: 'button[title*="Print"]', title: '🖨️ Print Audit Log', body: 'Print the full audit log for compliance reviews, internal audits, or regulatory inspections.', position: 'bottom', icon: '🖨️' },
            { targetQuery: '.data-table, table', title: '📋 Audit Entries', body: 'Click any entry to see the full details: who performed the action, what changed, and when it happened.', position: 'top', icon: '📋' },
            { target: null, title: '✅ Audit Log Tour Complete', body: 'The audit trail ensures accountability. Every data change is permanently recorded and cannot be modified.', position: 'center', icon: '🎯', isFinal: true },
        ]
    },
    'history-reports': {
        label: 'Dynamic Reports',
        steps: [
            { target: null, title: '📄 Dynamic Report Builder', body: 'Build custom ad-hoc reports by selecting data sources, filters, and output formats. Save templates for recurring reports.', position: 'center', icon: '📄' },
            { target: null, title: '✅ Reports Tour Complete', body: 'Create reports for management reviews, compliance audits, or KPI tracking. Saved templates can be re-run anytime.', position: 'center', icon: '🎯', isFinal: true },
        ]
    },
    history: {
        label: 'Work History',
        steps: [
            { target: null, title: '📜 Work History & Audit', body: 'Complete archive of all maintenance work. Use the tabs to access Completed Jobs, Past PMs, Reliability, Audit Log, and Dynamic Reports.', position: 'center', icon: '📜' },
            { targetQuery: '.nav-pills', title: '📑 History Tabs', body: 'Each tab has its own tour. Switch to a tab and click Take Tour for a detailed walkthrough.', position: 'bottom', icon: '📑' },
            { target: null, title: '✅ History Tour Complete', body: 'Switch to any tab and click Take Tour for a detailed walkthrough of that section.', position: 'center', icon: '🎯', isFinal: true },
        ]
    },

    // ────────── DIRECTORY ──────────
    directory: {
        label: 'Directory',
        steps: [
            { target: null, title: '📞 Enterprise Directory', body: 'Find contacts across all plant locations. Direct dial, email, or view organizational structure.', position: 'center', icon: '📞' },
            { targetQuery: '.search-bar, input[placeholder*="Search"]', title: '🔍 Find People', body: 'Search by name, role, department, or plant location. Results update as you type.', position: 'bottom', icon: '🔍' },
            { targetQuery: '.glass-card', title: '📋 Site Cards', body: 'Each card shows a plant location with its leadership contacts. Click any phone number to dial directly or email to compose a message.', position: 'top', icon: '📋' },
            { target: null, title: '✅ Directory Tour Complete', body: 'Key actions: Find contacts, direct dial, send email, and view site leadership for any plant location.', position: 'center', icon: '🎯', isFinal: true },
        ]
    },

    // ────────── GOVERNANCE — Tab-specific tours ──────────
    'governance-audit': {
        label: 'Security Audit',
        steps: [
            { target: null, title: '🛡️ Security Audit Log', body: 'Every significant action in the system is logged here — logins, data changes, transfers, and security events. Filter and search to investigate activity.', position: 'center', icon: '🛡️' },
            { targetQuery: 'input[placeholder*="Search"], .search-bar', title: '🔍 Search Events', body: 'Search by user, action type, or details. Combine with severity and action filters for precise investigations.', position: 'bottom', icon: '🔍' },
            { targetQuery: 'select', title: '🔽 Severity & Action Filters', body: 'Filter by severity (Info, Warning, Error, Critical) and specific action types to narrow your investigation.', position: 'bottom', icon: '🔽' },
            { targetQuery: '.data-table, table', title: '📋 Audit Event Table', body: 'Click any row to expand full event details including metadata, IP address, and complete action context.', position: 'top', icon: '📋' },
            { targetQuery: 'button[title*="Export"]', title: '📥 Export CSV', body: 'Download the filtered audit log as a CSV file for compliance reporting, external analysis, or permanent archival.', position: 'bottom', icon: '📥' },
            { target: null, title: '✅ Security Audit Tour Complete', body: 'Every action is permanently logged. Use filters to investigate incidents and export for compliance audits.', position: 'center', icon: '🎯', isFinal: true },
        ]
    },
    'governance-logins': {
        label: 'Login Activity',
        steps: [
            { target: null, title: '🔐 Login Activity Monitor', body: 'Track all login attempts — successful and failed — across your enterprise. Identify suspicious access patterns.', position: 'center', icon: '🔐' },
            { targetQuery: '.data-table, table', title: '📋 Login History', body: 'Each row shows a login event with timestamp, user, success/failure status, IP address, and context details.', position: 'top', icon: '📋' },
            { target: null, title: '✅ Login Activity Tour Complete', body: 'Monitor for repeated failed logins which may indicate brute-force attempts. Check IP addresses for unusual locations.', position: 'center', icon: '🎯', isFinal: true },
        ]
    },
    'governance-users': {
        label: 'User Roles & RBAC',
        steps: [
            { target: null, title: '👥 User Roles & RBAC', body: 'View all system users, their assigned roles, plant access levels, and account status. Trier OS enforces Plant Jail to ensure data isolation.', position: 'center', icon: '👥' },
            { targetQuery: '.data-table, table', title: '📋 User Table', body: 'Each row shows a user\'s role, plant access, global access status, and whether the account is active or locked.', position: 'top', icon: '📋' },
            { target: null, title: '✅ RBAC Tour Complete', body: 'Roles control what users can see and do. Plant-level users cannot access other plants\' data unless granted Global Access.', position: 'center', icon: '🎯', isFinal: true },
        ]
    },
    'governance-transfers': {
        label: 'Transfer Ledger',
        steps: [
            { target: null, title: '📦 Transfer Ledger', body: 'Audit trail of all inter-plant transfers — parts shipments, asset moves, and logistics activity across your enterprise.', position: 'center', icon: '📦' },
            { target: null, title: '✅ Transfer Ledger Tour Complete', body: 'Every transfer is permanently recorded with timestamps and status. Use this for inventory reconciliation and audit compliance.', position: 'center', icon: '🎯', isFinal: true },
        ]
    },
    governance: {
        label: 'Governance & Security',
        steps: [
            { target: null, title: '🛡️ Governance & Security', body: 'Enterprise security oversight. Use the tabs to access Security Audit, Login Activity, User Roles, and Transfer Ledger.', position: 'center', icon: '🛡️' },
            { targetQuery: '.nav-pills', title: '📑 Governance Tabs', body: 'Each tab has its own tour. Switch to a tab and click Take Tour for a detailed walkthrough.', position: 'bottom', icon: '📑' },
            { target: null, title: '✅ Governance Tour Complete', body: 'Switch to any tab and click Take Tour for a detailed walkthrough of that section.', position: 'center', icon: '🎯', isFinal: true },
        ]
    },

    // ────────── PROCEDURES — Tab-specific tours ──────────
    'procedures-sops': {
        label: 'SOP Library',
        steps: [
            { target: null, title: '📖 SOP Library', body: 'Browse, search, and manage all Standard Operating Procedures. Each SOP contains step-by-step instructions, required parts, safety notes, and attachments.', position: 'center', icon: '📖' },
            { targetQuery: 'button[title*="AI"], button[title*="ai"]', title: '🤖 AI SOP Generator', body: 'Use AI to automatically generate a new SOP from equipment documentation, manuals, or verbal descriptions.', position: 'bottom', icon: '🤖' },
            { targetQuery: 'button[title*="Print"]', title: '🖨️ Print Catalog', body: 'Print the full SOP catalog or an individual procedure with all steps, parts, and instructions formatted for a binder.', position: 'bottom', icon: '🖨️' },
            { targetQuery: '.data-table, table', title: '📋 Procedure Table', body: 'Click any SOP to open the detailed view. You can read instructions, edit steps, attach photos, and print formatted documents.', position: 'top', icon: '📋' },
            { target: null, title: '✅ SOP Library Tour Complete', body: 'Key actions: Browse SOPs → View step-by-step instructions → Edit → AI Generate → Print formatted procedures.', position: 'center', icon: '🎯', isFinal: true },
        ]
    },
    'procedures-tasks': {
        label: 'Task Master Data',
        steps: [
            { target: null, title: '🗂️ Task Master Data', body: 'View and edit all individual task master records. These are the reusable building blocks that make up your SOPs.', position: 'center', icon: '🗂️' },
            { targetQuery: '.data-table, table', title: '📋 Task Records', body: 'Each row is a master task record with its code, description, category, and instructional text. Click View to see full details or Edit to modify.', position: 'top', icon: '📋' },
            { target: null, title: '✅ Task Data Tour Complete', body: 'Task records are shared building blocks. Editing a task here updates it everywhere it\'s referenced in your SOPs.', position: 'center', icon: '🎯', isFinal: true },
        ]
    },
    procedures: {
        label: 'SOPs & Procedures',
        steps: [
            { target: null, title: '📖 SOPs & Procedures', body: 'Your procedure management hub. Use the tabs to switch between the SOP Library and Task Master Data.', position: 'center', icon: '📖' },
            { targetQuery: '.nav-pills', title: '📑 Procedure Tabs', body: 'Each tab has its own tour. Switch to a tab and click Take Tour for a detailed walkthrough.', position: 'bottom', icon: '📑' },
            { target: null, title: '✅ Procedures Tour Complete', body: 'Switch to any tab and click Take Tour for a detailed walkthrough of that section.', position: 'center', icon: '🎯', isFinal: true },
        ]
    },

    // ────────── TOOLS — Tab-specific tours ──────────
    'tools-inventory': {
        label: 'Tool Inventory',
        steps: [
            { target: null, title: '🔧 Tool Inventory', body: 'Browse and manage all tools in your tool crib. Track serial numbers, conditions, locations, and asset values.', position: 'center', icon: '🔧' },
            { targetQuery: '.btn-save, button[title*="Add"]', title: '➕ Add Tool', body: 'Register a new tool in the inventory. Enter the tool ID, description, category, serial number, and storage location.', position: 'bottom', icon: '➕' },
            { targetQuery: '.data-table, table', title: '📋 Tool Table', body: 'Click the eye icon to view tool details or the pencil to edit. See condition status, serial numbers, and current availability.', position: 'top', icon: '📋' },
            { target: null, title: '✅ Tool Inventory Tour Complete', body: 'Key actions: Add tools → Track serial numbers → Monitor condition → View checkout history.', position: 'center', icon: '🎯', isFinal: true },
        ]
    },
    'tools-checkouts': {
        label: 'Active Checkouts',
        steps: [
            { target: null, title: '📋 Active Checkouts', body: 'See all tools currently checked out. Track who has them, when they\'re due back, and their last known condition.', position: 'center', icon: '📋' },
            { targetQuery: '.data-table, table', title: '📋 Checkout List', body: 'Each row shows a checked-out tool. Click View for checkout details including who checked it out, due date, and checkout history.', position: 'top', icon: '📋' },
            { target: null, title: '✅ Checkouts Tour Complete', body: 'Monitor checkouts to prevent tool loss. Tools approaching their due date should be followed up on.', position: 'center', icon: '🎯', isFinal: true },
        ]
    },
    'tools-overdue': {
        label: 'Overdue Returns',
        steps: [
            { target: null, title: '⚠️ Overdue Tool Returns', body: 'Tools that have not been returned by their due date. Follow up with the assigned users to recover them.', position: 'center', icon: '⚠️' },
            { targetQuery: '.data-table, table', title: '📋 Overdue List', body: 'Each row shows the overdue tool, who has it, when it was due, and how many days overdue. Red text = critical overdue.', position: 'top', icon: '📋' },
            { target: null, title: '✅ Overdue Tour Complete', body: 'Print the overdue report for shift meetings. Consistent follow-up reduces tool loss and replacement costs.', position: 'center', icon: '🎯', isFinal: true },
        ]
    },
    'tools-stats': {
        label: 'Tool Statistics',
        steps: [
            { target: null, title: '📊 Tool Program Statistics', body: 'Overview of your tool program health: total inventory, availability rate, checkout volume, and asset value.', position: 'center', icon: '📊' },
            { target: null, title: '✅ Stats Tour Complete', body: 'Track your tool program KPIs. High overdue rates may indicate insufficient tool quantities or accountability issues.', position: 'center', icon: '🎯', isFinal: true },
        ]
    },
    tools: {
        label: 'Tool Crib',
        steps: [
            { target: null, title: '🔧 Tool Crib Management', body: 'Your tool management hub. Use the tabs to access Inventory, Active Checkouts, Overdue Returns, and Statistics.', position: 'center', icon: '🔧' },
            { targetQuery: '.nav-pills', title: '📑 Tool Crib Tabs', body: 'Each tab has its own tour. Switch to a tab and click Take Tour for a detailed walkthrough.', position: 'bottom', icon: '📑' },
            { target: null, title: '✅ Tool Crib Tour Complete', body: 'Switch to any tab and click Take Tour for a detailed walkthrough of that section.', position: 'center', icon: '🎯', isFinal: true },
        ]
    },

    // ────────── VENDOR PORTAL — Tab-specific tours ──────────
    'vendor-portal-vendors': {
        label: 'Vendor Access',
        steps: [
            { target: null, title: '🔑 Vendor Access Tokens', body: 'Manage portal access for your vendors. Each vendor gets a unique access token for secure, limited-scope API access.', position: 'center', icon: '🔑' },
            { targetQuery: '.data-table, table', title: '📋 Vendor Access Table', body: 'View all vendor portal credentials: contact info, token status, expiry dates, and last login. Click View for full details.', position: 'top', icon: '📋' },
            { target: null, title: '✅ Vendor Access Tour Complete', body: 'Manage access tokens carefully. Revoke tokens when vendor relationships end. Monitor last login dates for inactive accounts.', position: 'center', icon: '🎯', isFinal: true },
        ]
    },
    'vendor-portal-rfq': {
        label: 'RFQ Workflow',
        steps: [
            { target: null, title: '📄 Request for Quote (RFQ)', body: 'Create and manage RFQs sent to vendors. Track from Draft through to Award with full line-item pricing.', position: 'center', icon: '📄' },
            { targetQuery: '.data-table, table', title: '📋 RFQ List', body: 'Each RFQ shows its status (Open → Submitted → Quoted → Awarded), vendor, due date, and item count. Click for full details.', position: 'top', icon: '📋' },
            { target: null, title: '✅ RFQ Tour Complete', body: 'Use RFQs to get competitive bids. Compare target vs quoted prices and track savings across your procurement program.', position: 'center', icon: '🎯', isFinal: true },
        ]
    },
    'vendor-portal-messages': {
        label: 'Vendor Messages',
        steps: [
            { target: null, title: '💬 Vendor Messaging', body: 'Communicate with vendors directly through the portal. All messages are logged for procurement audit trails.', position: 'center', icon: '💬' },
            { target: null, title: '✅ Messages Tour Complete', body: 'All vendor communications are permanently stored. Use this instead of personal email for auditable procurement records.', position: 'center', icon: '🎯', isFinal: true },
        ]
    },
    'vendor-portal': {
        label: 'Vendor Portal',
        steps: [
            { target: null, title: '🌐 Vendor Portal', body: 'Your vendor collaboration hub. Use the tabs to manage Vendor Access, RFQ Workflow, and Messaging.', position: 'center', icon: '🌐' },
            { targetQuery: '.nav-pills', title: '📑 Portal Tabs', body: 'Each tab has its own tour. Switch to a tab and click Take Tour for a detailed walkthrough.', position: 'bottom', icon: '📑' },
            { target: null, title: '✅ Vendor Portal Tour Complete', body: 'Switch to any tab and click Take Tour for a detailed walkthrough of that section.', position: 'center', icon: '🎯', isFinal: true },
        ]
    },

    // ────────── IMPORT & API HUB — Tab-specific tours ──────────
    'import-api-import': {
        label: 'Import Wizard',
        steps: [
            { target: null, title: '📥 Data Import Wizard', body: 'Import data from CSV, Microsoft Access, Excel, or JSON files. The wizard auto-maps columns to the Trier OS schema.', position: 'center', icon: '📥' },
            { target: null, title: '✅ Import Wizard Tour Complete', body: 'Supported formats: CSV, .accdb/.mdb (Access), .xlsx (Excel), .json. The system validates and previews data before commit.', position: 'center', icon: '🎯', isFinal: true },
        ]
    },
    'import-api-api-keys': {
        label: 'API Keys',
        steps: [
            { target: null, title: '🔑 API Key Management', body: 'Generate and manage REST API access keys. Each key has a label, creation date, and usage tracking.', position: 'center', icon: '🔑' },
            { targetQuery: 'button[title*="Generate"], button[title*="New"]', title: '➕ Generate New Key', body: 'Create a new API key with a descriptive label. Keys are shown once at creation — copy immediately!', position: 'bottom', icon: '➕' },
            { targetQuery: 'table', title: '📋 Key List', body: 'View all active keys with their prefixes and last-used timestamps. Revoke keys that are no longer needed.', position: 'top', icon: '📋' },
            { target: null, title: '✅ API Keys Tour Complete', body: 'Include the key as header X-API-Key in all API requests. Revoke unused keys promptly for security.', position: 'center', icon: '🎯', isFinal: true },
        ]
    },
    'import-api-api-docs': {
        label: 'API Documentation',
        steps: [
            { target: null, title: '📚 API Documentation', body: 'Complete REST API reference for Trier OS. Browse all available endpoints, parameters, and response formats.', position: 'center', icon: '📚' },
            { target: null, title: '✅ API Docs Tour Complete', body: 'Use the API docs to build integrations. All endpoints accept JSON and require an X-API-Key header.', position: 'center', icon: '🎯', isFinal: true },
        ]
    },
    'import-api-integrations': {
        label: 'Integrations',
        steps: [
            { target: null, title: '🔗 Webhooks & Integrations', body: 'Connect Trier OS to Slack, Teams, and external systems via webhooks. Get real-time notifications on work order events.', position: 'center', icon: '🔗' },
            { target: null, title: '✅ Integrations Tour Complete', body: 'Configure webhooks in Settings → Admin Console → Integrations. Active webhooks appear here for monitoring.', position: 'center', icon: '🎯', isFinal: true },
        ]
    },
    'import-api-bi-export': {
        label: 'BI / Power BI',
        steps: [
            { target: null, title: '📊 BI & Power BI Integration', body: 'Connect Power BI, Excel, or any BI tool to live Trier OS data feeds. OData-compatible endpoints for all major data sets.', position: 'center', icon: '📊' },
            { target: null, title: '✅ BI Export Tour Complete', body: 'Copy any feed URL and paste into Power BI → Get Data → Web. Add your API key as a header for authentication.', position: 'center', icon: '🎯', isFinal: true },
        ]
    },
    'import-api': {
        label: 'Import & API Hub',
        steps: [
            { target: null, title: '🔌 Import & API Hub', body: 'Your integration command center. Use the tabs to access Import Wizard, API Keys, Documentation, Webhooks, and BI Feeds.', position: 'center', icon: '🔌' },
            { targetQuery: '.nav-pills', title: '📑 Integration Tabs', body: 'Each tab has its own tour. Switch to a tab and click Take Tour for a detailed walkthrough.', position: 'bottom', icon: '📑' },
            { target: null, title: '✅ Import & API Tour Complete', body: 'Switch to any tab and click Take Tour for a detailed walkthrough of that section.', position: 'center', icon: '🎯', isFinal: true },
        ]
    },

    // ────────── LOTO ──────────
    loto: {
        label: 'LOTO / Lockout-Tagout',
        steps: [
            { target: null, title: '🔒 LOTO Digital Permits', body: 'Manage digital lockout-tagout permits. Track isolation points, energy source verification, and maintain a complete audit trail.', position: 'center', icon: '🔒' },
            { targetQuery: '.data-table, table', title: '📋 Active Permits', body: 'View all active and historical LOTO permits. Each permit logs isolation points, authorized personnel, and verification steps.', position: 'top', icon: '📋' },
            { target: null, title: '✅ LOTO Tour Complete', body: 'Never start maintenance on energized equipment without a LOTO permit. Digital permits ensure accountability and compliance.', position: 'center', icon: '🎯', isFinal: true },
        ]
    },

    // ────────── COMPLIANCE ──────────
    compliance: {
        label: 'Compliance Tracker',
        steps: [
            { target: null, title: '✅ Compliance & SOP Adherence', body: 'Track SOP compliance scores, audit results, training certifications, and regulatory gap analysis across your operations.', position: 'center', icon: '✅' },
            { targetQuery: '.data-table, table', title: '📋 Compliance Records', body: 'View compliance scores, training status, and audit findings. Identify regulatory gaps that need immediate attention.', position: 'top', icon: '📋' },
            { target: null, title: '✅ Compliance Tour Complete', body: 'Maintain high compliance scores to pass regulatory audits. Address training gaps and SOP deviations promptly.', position: 'center', icon: '🎯', isFinal: true },
        ]
    },

    // ────────── CHAT ──────────
    chat: {
        label: 'Communications',
        steps: [
            { target: null, title: '💬 Knowledge Exchange', body: 'Real-time messaging for maintenance teams. Share shift handoff notes, escalate issues, and coordinate across plants.', position: 'center', icon: '💬' },
            { target: null, title: '✅ Chat Tour Complete', body: 'Use Knowledge Exchange for shift handoffs, urgent escalations, and cross-plant coordination. All messages are permanently stored.', position: 'center', icon: '🎯', isFinal: true },
        ]
    },

    // ────────── IT DEPARTMENT — Tab-specific tours ──────────
    'it-department-software': {
        label: 'Software Licenses',
        steps: [
            { target: null, title: '📀 Software License Management', body: 'Track all enterprise software licenses, subscriptions, seat utilization, and renewal schedules. Sensitive license keys are masked for non-IT roles.', position: 'center', icon: '📀' },
            { targetQuery: '.search-bar, input[placeholder*="Search"]', title: '🔍 Search Licenses', body: 'Search by software name, vendor, category, or license key. Filter the list instantly to find any license.', position: 'bottom', icon: '🔍' },
            { targetQuery: 'button[title*="Add new software"]', title: '➕ Add License', body: 'Register a new software license. Enter the vendor, version, license type (Subscription/Perpetual), seats, key, and renewal cost.', position: 'bottom', icon: '➕' },
            { targetQuery: '.data-table, table', title: '📋 License Table', body: 'Each row shows a software license with vendor, category, seat utilization, expiry countdown, and renewal cost. Color-coded expiry (red = expired, amber = <30 days, green = good).', position: 'top', icon: '📋' },
            { targetQuery: 'button[title*="View"]', title: '👁️ License Details', body: 'Click View to see the full license record including the key (visible to IT only), assigned user, department, and purchase history.', position: 'bottom', icon: '👁️' },
            { target: null, title: '✅ Software Tour Complete', body: 'Key actions: Add licenses → Track seat usage → Monitor expirations → Manage renewals. Non-IT users see keys as ••••••••.', position: 'center', icon: '🎯', isFinal: true },
        ]
    },
    'it-department-hardware': {
        label: 'Hardware Inventory',
        steps: [
            { target: null, title: '🖥️ Hardware Inventory', body: 'Manage all IT hardware: Dell desktops, laptops, monitors, Zebra printers, and peripherals. Every asset has a barcode, depreciation schedule, and full chain of custody.', position: 'center', icon: '🖥️' },
            { targetQuery: '.search-bar, input[placeholder*="Search"]', title: '🔍 Find Hardware', body: 'Search by asset name, serial number, asset tag, barcode, manufacturer, model, or assigned user.', position: 'bottom', icon: '🔍' },
            { targetQuery: 'button[title*="Add new"]', title: '➕ Add Hardware Asset', body: 'Register a new hardware asset. The system auto-generates a unique barcode (IT-HW-XXXXX) for scan tracking.', position: 'bottom', icon: '➕' },
            { targetQuery: '.data-table, table', title: '📋 Asset Table', body: 'View all hardware with type, manufacturer/model, serial number, assigned user, status, and current book value (auto-calculated from depreciation).', position: 'top', icon: '📋' },
            { target: null, title: '✅ Hardware Tour Complete', body: 'Key actions: Register assets → Assign to users → Track depreciation → Scan barcodes for chain of custody → Monitor warranty expirations.', position: 'center', icon: '🎯', isFinal: true },
        ]
    },
    'it-department-infrastructure': {
        label: 'Infrastructure',
        steps: [
            { target: null, title: '🌐 Network Infrastructure', body: 'Manage servers, firewalls, switches, access points, and UPS systems. Track IP addresses, firmware versions, rack positions, and criticality levels.', position: 'center', icon: '🌐' },
            { targetQuery: '.search-bar, input[placeholder*="Search"]', title: '🔍 Search Devices', body: 'Search by device name, serial, IP address, model, or manufacturer. Quickly locate any device in your network.', position: 'bottom', icon: '🔍' },
            { targetQuery: 'button[title*="Add new"]', title: '➕ Add Infrastructure Device', body: 'Register a new network device. Enter IP, MAC, rack position, firmware version, and criticality (Critical/High/Medium/Low).', position: 'bottom', icon: '➕' },
            { targetQuery: '.data-table, table', title: '📋 Device Table', body: 'View infrastructure assets with type badges, IP addresses, online/offline status, and book value. Includes Dell servers, Fortinet firewalls, switches, and APs.', position: 'top', icon: '📋' },
            { target: null, title: '✅ Infrastructure Tour Complete', body: 'Key actions: Track all network devices → Monitor firmware versions → Manage rack positions → Calculate depreciation on datacenter equipment.', position: 'center', icon: '🎯', isFinal: true },
        ]
    },
    'it-department-mobile': {
        label: 'Mobile Devices',
        steps: [
            { target: null, title: '📱 Mobile Device Management', body: 'Track all mobile devices: Zebra scanners (MC9300/MC9400/TC72/TC77), tablets, and mobile printers. Monitor SOTI MDM enrollment, carrier plans, and monthly costs.', position: 'center', icon: '📱' },
            { targetQuery: '.search-bar, input[placeholder*="Search"]', title: '🔍 Find Devices', body: 'Search by device name, model, IMEI, serial number, assigned user, or barcode. Find any mobile device across all plants.', position: 'bottom', icon: '🔍' },
            { targetQuery: 'button[title*="Add new"]', title: '➕ Register Device', body: 'Add a new mobile device. Enter IMEI, carrier info, monthly cost, MDM status, and assign to a user and plant location.', position: 'bottom', icon: '➕' },
            { targetQuery: '.data-table, table', title: '📋 Device Fleet', body: 'View all mobile devices with type, manufacturer/model, assigned user, carrier, status, and book value. SOTI-enrolled devices show MDM status.', position: 'top', icon: '📋' },
            { target: null, title: '✅ Mobile Tour Complete', body: 'Key actions: Register devices → Enroll in SOTI MDM → Track carrier costs → Monitor depreciation → Scan barcodes for chain of custody.', position: 'center', icon: '🎯', isFinal: true },
        ]
    },
    'it-department-vendors': {
        label: 'Vendors & Contracts',
        steps: [
            { target: null, title: '🤝 Vendors & Contracts', body: 'Manage all IT vendor relationships and service contracts. Track SLAs, renewal dates, annual costs, and vendor contact information for SOTI, Fortinet, Dell, EMP, GHA, PCS, ASCtrack, and more.', position: 'center', icon: '🤝' },
            { targetQuery: '.search-bar, input[placeholder*="Search"]', title: '🔍 Find Vendors', body: 'Search by vendor name, contact, contract number, or description. Find any vendor relationship instantly.', position: 'bottom', icon: '🔍' },
            { targetQuery: 'button[title*="Add new vendor"]', title: '➕ Add Vendor/Contract', body: 'Create a new vendor record with contact info and contract details. Set SLA response times, uptime guarantees, auto-renewal, and payment terms.', position: 'bottom', icon: '➕' },
            { targetQuery: '.data-table, table', title: '📋 Contract Table', body: 'Each row shows a vendor with category badge, contract number, type, SLA response time, end date with countdown, annual cost, and status. Amber = expiring soon, Red = expired.', position: 'top', icon: '📋' },
            { targetQuery: 'button[title*="View"]', title: '👁️ Vendor Details', body: 'Click View to see the full vendor profile: contact info, contract scope, SLA terms, cost breakdown, auto-renewal status, and notes.', position: 'bottom', icon: '👁️' },
            { target: null, title: '✅ Vendors Tour Complete', body: 'Key actions: Add vendors → Track contract dates → Monitor SLA compliance → Review annual costs → Get alerts before contracts expire.', position: 'center', icon: '🎯', isFinal: true },
        ]
    },
    'it-department-tracking': {
        label: 'Asset Tracking',
        steps: [
            { target: null, title: '📦 Asset Tracking & Depreciation', body: 'Full chain of custody ledger and depreciation reporting. Track every IT asset movement between plants and monitor financial depreciation schedules.', position: 'center', icon: '📦' },
            { targetQuery: 'button[title*="movement"]', title: '📋 Movement Ledger', body: 'View the complete movement history: shipments, receipts, transfers, and audit scans. Every scan is timestamped with who, what, where, and tracking numbers.', position: 'bottom', icon: '📋' },
            { targetQuery: 'button[title*="Depreciation"]', title: '📊 Depreciation Report', body: 'Financial depreciation dashboard: original cost, accumulated depreciation, current book value, and monthly expense — broken down by category.', position: 'bottom', icon: '📊' },
            { target: null, title: '✅ Tracking Tour Complete', body: 'Key actions: View movement history → Track chain of custody → Review depreciation schedules → Monitor total enterprise IT book value.', position: 'center', icon: '🎯', isFinal: true },
        ]
    },
    'it-department': {
        label: 'IT Department',
        steps: [
            { target: null, title: '🖥️ IT Department', body: 'Your IT asset management hub. Manage software licenses, hardware inventory, network infrastructure, mobile devices, and track asset movements and depreciation.', position: 'center', icon: '🖥️' },
            { targetQuery: '.nav-pills', title: '📑 IT Tabs', body: 'Switch between Software, Hardware, Infrastructure, Mobile, and Asset Tracking. Each tab has its own detailed tour — click Take Tour on any tab.', position: 'bottom', icon: '📑' },
            { target: null, title: '📊 Stats Bar', body: 'Top-level metrics show total software licenses, hardware assets, infrastructure devices, mobile devices, and overall IT book value. Expiring license alerts appear here.', position: 'center', icon: '📊' },
            { target: null, title: '✅ IT Department Tour Complete', body: 'Switch to any tab and click Take Tour for a detailed walkthrough. IT and Creator roles have full edit access; Corporate sees metrics only with masked keys.', position: 'center', icon: '🎯', isFinal: true },
        ]
    },

    // ────────── SUPPLY CHAIN — Tab-specific tours ──────────
    'supply-chain-inventory': {
        label: 'Ingredient Inventory',
        steps: [
            { target: null, title: '📦 Ingredient & Supply Inventory', body: 'Your live stock list for every dairy ingredient, packaging material, chemical, and consumable at this plant. On-hand quantities and stock values update in real-time.', position: 'center', icon: '📦' },
            { targetQuery: 'input[placeholder*="Search"]', title: '🔍 Search Items', body: 'Search by item description, supplier, or category to instantly narrow the list.', position: 'bottom', icon: '🔍' },
            { targetQuery: '.data-table, table', title: '📋 Inventory Table', body: 'Each row shows category, supplier, on-hand qty, reorder point, unit cost, and total stock value. Red REORDER badges flag items needing immediate ordering.', position: 'top', icon: '📋' },
            { target: null, title: '👁️ View & Edit', body: 'Click View to see the full item detail. Click Edit to update any field, including stock levels and the product photo.', position: 'center', icon: '👁️' },
            { target: null, title: '📷 Product Photos', body: 'In Edit mode, scroll to Product Photo. Click "📷 Take Photo" to use your device camera or "🖼 Browse File" to upload an image — anyone opening the record can immediately identify the product.', position: 'center', icon: '📷' },
            { target: null, title: '🖨️ Print Inventory', body: 'Click Print in the toolbar to generate a branded TrierPrint inventory report. Perfect for cycle count sheets and shift binders.', position: 'center', icon: '🖨️' },
            { target: null, title: '✅ Inventory Tour Complete', body: 'Key workflow: Browse stock → Filter Low Stock → Edit items → Attach product photos → Print reports → Create Purchase Orders when stock is low.', position: 'center', icon: '🎯', isFinal: true },
        ]
    },
    'supply-chain-purchase-orders': {
        label: 'Purchase Orders',
        steps: [
            { target: null, title: '🛒 Purchase Orders', body: 'Create, track, and receive supplier purchase orders. Status flows Open → Partial → Received as deliveries arrive and inventory is updated automatically.', position: 'center', icon: '🛒' },
            { targetQuery: '.data-table, table', title: '📋 PO Table', body: 'Each row shows PO number, vendor, order date, expected delivery, line count, total value, and status badge.', position: 'top', icon: '📋' },
            { target: null, title: '✏️ Edit PO', body: 'Click Edit to correct mistakes — change the supplier, adjust dates, update status, or fix line item quantities and unit costs. PO total recalculates automatically. Print directly from the Edit window.', position: 'center', icon: '✏️' },
            { target: null, title: '🚚 Receive a PO', body: 'When a delivery arrives, click Receive on an Open or Partial PO. Enter quantities received for each line. Inventory updates automatically and PO status changes to Partial or Received.', position: 'center', icon: '🚚' },
            { target: null, title: '➕ Create PO', body: 'Click "Create PO" to open the creation form. Select a supplier, set dates, add line items — each linking to an inventory item and auto-filling the unit cost.', position: 'center', icon: '➕' },
            { target: null, title: '✅ Purchase Orders Tour Complete', body: 'Key workflow: Create PO → Vendor ships → Receive delivery (inventory auto-updates) → PO closes. Use Edit to correct any data entry errors.', position: 'center', icon: '🎯', isFinal: true },
        ]
    },
    'supply-chain-receiving-log': {
        label: 'Receiving Log',
        steps: [
            { target: null, title: '📋 Transaction & Receiving Log', body: 'Every inventory movement is recorded here — PO receipts, daily usage, manual adjustments, waste, and transfers. Your complete supply chain audit trail.', position: 'center', icon: '📋' },
            { targetQuery: '.data-table, table', title: '📋 Transaction Table', body: 'Each row shows the item, transaction type (Usage, Receipt, Adjustment, Waste), quantity, date, reference, and who entered it.', position: 'top', icon: '📋' },
            { target: null, title: '➕ Log a Transaction', body: 'Click "Log Transaction" to manually record: Usage reduces on-hand; Receipt/Adjustment In increases it; Waste removes with an audit record.', position: 'center', icon: '➕' },
            { target: null, title: '🖨️ Print Log', body: 'Print a transaction report for audits, food safety documentation, or cost tracking in TrierPrint format with your company logo.', position: 'center', icon: '🖨️' },
            { target: null, title: '✅ Receiving Log Tour Complete', body: 'Key workflow: Receive PO → Log daily usage → Record waste events → Print for food safety audits or internal inventory reviews.', position: 'center', icon: '🎯', isFinal: true },
        ]
    },
    'supply-chain-suppliers': {
        label: 'Suppliers',
        steps: [
            { target: null, title: '🏭 Supplier Directory', body: 'Your approved vendor list: Dairy Ingredients, Packaging, Chemicals, and Consumables suppliers, all with full contact info and account details.', position: 'center', icon: '🏭' },
            { targetQuery: '.data-table, table', title: '📋 Supplier Table', body: 'Each row shows supplier name, category, primary contact, phone, email, standard lead time, and account number.', position: 'top', icon: '📋' },
            { target: null, title: '👁️ & ✏️ View / Edit', body: 'Click View for the full contact detail. Click Edit to update any field. Print a formatted supplier record directly from the View window.', position: 'center', icon: '👁️' },
            { target: null, title: '➕ Add Supplier', body: 'Click "Add Supplier" to register a new vendor. Fill in company name, category, contact info, website, account number, and standard lead time in days.', position: 'center', icon: '➕' },
            { target: null, title: '✅ Suppliers Tour Complete', body: 'Key workflow: Add suppliers → Link to inventory items → Select when creating POs → Print directory for the purchasing office.', position: 'center', icon: '🎯', isFinal: true },
        ]
    },
    'supply-chain': {
        label: 'Supply Chain & Ingredients',
        steps: [
            { target: null, title: '🛒 Supply Chain & Ingredient Inventory', body: 'Your production supply management hub. Track ingredients, packaging, chemicals, and consumables. Create POs, receive deliveries, and log daily usage — all in one place.', position: 'center', icon: '🛒' },
            { targetQuery: 'button[class*="btn-nav"]', title: '📑 Module Tabs', body: 'Four tabs: Inventory (live stock), Purchase Orders (supplier orders), Receiving Log (all transactions), and Suppliers (vendor directory). Each tab has its own Take Tour.', position: 'bottom', icon: '📑' },
            { target: null, title: '📊 KPI Summary Bar', body: 'The top bar shows Total Inventory Value, SKUs Tracked, Low/Reorder Alerts, Open POs, PO Value, Active Suppliers, and HazMat Items — all live for your selected plant.', position: 'center', icon: '📊' },
            { target: null, title: '✅ Supply Chain Tour Complete', body: 'Switch to any tab and click Take Tour for a tab-specific walkthrough. Recommended flow: Inventory → Purchase Orders → Receiving Log → Suppliers.', position: 'center', icon: '🎯', isFinal: true },
        ]
    },

    // ────────── UNDERWRITER PORTAL ──────────
    underwriter: {
        label: 'Underwriter Portal',
        steps: [
            { target: null, title: '🛡️ Underwriter Portal', body: 'This read-only portal gives insurance underwriters a verified snapshot of your safety and compliance posture. All data here is live from the plant\'s operational systems.', position: 'center', icon: '🛡️' },
            { targetQuery: 'button[class*="btn-nav"]', title: '📑 Portal Tabs', body: 'Four tabs: Risk Overview (scorecard), Safety Incidents (incident history), Calibration (instrument status), and LOTO Permits (lockout audit trail).', position: 'bottom', icon: '📑' },
            { targetQuery: 'button[title*="Print Evidence"]', title: '🖨️ Print Evidence Packet', body: 'Click "Print Evidence Packet" to generate a comprehensive, print-ready document covering all four compliance areas. Use this for insurance renewals and audits.', position: 'bottom', icon: '🖨️' },
            { target: null, title: '📊 Risk Score', body: 'The Risk Score (0–100) is auto-calculated from PM adherence, open near-miss incidents, overdue calibrations, and LOTO audit completion. Higher is better.', position: 'center', icon: '📊' },
            { targetQuery: 'table', title: '📋 Read-Only Data Tables', body: 'All tables in this portal are read-only. To update records, navigate to Safety, Calibration, or LOTO modules. Changes appear here automatically.', position: 'top', icon: '📋' },
            { target: null, title: '✅ Underwriter Portal Tour Complete', body: 'Share this portal with your insurance broker during renewal. The Risk Score and evidence packet demonstrate proactive safety management, which can reduce premiums.', position: 'center', icon: '🎯', isFinal: true },
        ]
    },

    // ────────── ENERGY / UTILITIES ──────────
    'utilities-energy': {
        label: 'Energy & Sustainability',
        steps: [
            { target: null, title: '⚡ Energy & Sustainability Dashboard', body: 'Track electricity, natural gas, water, and propane consumption. Set targets, log utility bills, and monitor your carbon footprint — all in one place.', position: 'center', icon: '⚡' },
            { targetQuery: 'button[title*="Log Utility"]', title: '📥 Log a Utility Bill', body: 'Click "Log Utility Bill" to record a new energy reading. Enter the meter type, reading value, cost, and billing period. Historical data builds your trend chart.', position: 'bottom', icon: '📥' },
            { targetQuery: 'button[title*="Set Target"], button[title*="target"]', title: '🎯 Set Energy Targets', body: 'Click "Set Target" to define monthly and annual consumption targets per utility type. The bar chart shows a red line at your target — stay below it.', position: 'bottom', icon: '🎯' },
            { target: null, title: '🕐 Pricing Clock', body: 'The Pricing Clock shows the current grid pricing tier (Off-Peak, Mid-Peak, or On-Peak). Schedule high-load tasks like compressor runs during Off-Peak hours to save money.', position: 'center', icon: '🕐' },
            { targetQuery: 'button[title*="Arbitrage"], button[title*="Advisor"]', title: '💡 Arbitrage Advisor', body: 'The Arbitrage Advisor suggests the best times to run high-load equipment over the next 24 hours. It shows potential savings from shifting loads to off-peak windows.', position: 'bottom', icon: '💡' },
            { target: null, title: '✅ Energy Tour Complete', body: 'Key workflow: Log readings → Set targets → Watch the Pricing Clock → Use Arbitrage Advisor to shift loads → Print Sustainability Report for ESG reporting.', position: 'center', icon: '🎯', isFinal: true },
        ]
    },
};



// ═══════════════════════════════════════════════════════════════════
// TakeTourButton — Place this in any view header
// ═══════════════════════════════════════════════════════════════════
// Props:
//   tourId:    base tour key (e.g. "jobs")
//   nestedTab: current active sub-tab (e.g. "work-orders")
//              The button resolves "jobs-work-orders" first, then
//              falls back to "jobs" if no sub-tour exists.
//   style:     optional extra inline styles
// ═══════════════════════════════════════════════════════════════════
export function TakeTourButton({ tourId, nestedTab, style }) {
    const { t } = useTranslation();
    // Resolve the best matching tour
    const resolvedId = nestedTab && TOURS[`${tourId}-${nestedTab}`]
        ? `${tourId}-${nestedTab}`
        : tourId;

    const tour = TOURS[resolvedId];
    if (!tour) return null;

    const handleClick = () => {
        window.dispatchEvent(new CustomEvent('pf-start-contextual-tour', { detail: resolvedId }));
    };

    return (
        <button title={t('tour.clickTip')}
            onClick={handleClick}
            style={{
                display: 'flex', alignItems: 'center', gap: '7px',
                padding: '7px 16px',
                fontSize: '0.78rem', fontWeight: 700,
                color: '#fff',
                background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                border: '1px solid rgba(245, 158, 11, 0.4)',
                borderRadius: '8px',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                boxShadow: '0 2px 10px rgba(245, 158, 11, 0.25)',
                transition: 'all 0.2s ease',
                letterSpacing: '0.02em',
                ...style
            }}
            onMouseEnter={e => {
                e.currentTarget.style.boxShadow = '0 4px 18px rgba(245, 158, 11, 0.45)';
                e.currentTarget.style.transform = 'translateY(-1px)';
            }}
            onMouseLeave={e => {
                e.currentTarget.style.boxShadow = '0 2px 10px rgba(245, 158, 11, 0.25)';
                e.currentTarget.style.transform = 'translateY(0)';
            }}

        >
            <GraduationCap size={15} />{t('tour.takeTour', 'Take Tour')}</button>
    );
}


// ═══════════════════════════════════════════════════════════════════
// ContextualTour — The tour overlay (rendered once at app level)
// ═══════════════════════════════════════════════════════════════════
export default function ContextualTour() {
    const { t } = useTranslation();
    const [activeTourId, setActiveTourId] = useState(null);
    const [currentStep, setCurrentStep] = useState(0);
    const [targetRect, setTargetRect] = useState(null);
    const [tooltipPos, setTooltipPos] = useState({ top: 0, left: 0 });
    const tooltipRef = useRef(null);
    const animFrameRef = useRef(null);

    const isAdminOrCreator = ['it_admin', 'creator'].includes(localStorage.getItem('userRole')) ||
        localStorage.getItem('PF_USER_IS_CREATOR') === 'true';

    // Listen for tour start events
    useEffect(() => {
        const handleStart = (e) => {
            const tourId = e.detail;
            if (TOURS[tourId]) {
                setActiveTourId(tourId);
                setCurrentStep(0);
            }
        };
        window.addEventListener('pf-start-contextual-tour', handleStart);
        return () => window.removeEventListener('pf-start-contextual-tour', handleStart);
    }, []);

    const tour = activeTourId ? TOURS[activeTourId] : null;
    const allSteps = tour?.steps || [];
    const visibleSteps = allSteps.filter(s => !s.adminOnly || isAdminOrCreator);
    const step = visibleSteps[currentStep];

    // Find and highlight the target element
    const findTarget = useCallback(() => {
        if (!step || step.position === 'center') {
            setTargetRect(null);
            return;
        }

        let el = null;

        if (step.targetQuery && step.targetText) {
            const candidates = document.querySelectorAll(step.targetQuery);
            for (const c of candidates) {
                if (c.textContent.trim().includes(step.targetText)) { el = c; break; }
            }
        } else if (step.targetQuery) {
            el = document.querySelector(step.targetQuery);
        }

        if (el) {
            const rect = el.getBoundingClientRect();
            setTargetRect({
                top: rect.top - 8, left: rect.left - 8,
                width: rect.width + 16, height: rect.height + 16,
                element: el
            });
        } else {
            setTargetRect(null);
        }
    }, [step]);

    // Position tracking loop
    useEffect(() => {
        if (!activeTourId) return;
        const positionLoop = () => {
            findTarget();
            animFrameRef.current = requestAnimationFrame(positionLoop);
        };
        const timer = setTimeout(() => positionLoop(), 100);
        return () => {
            clearTimeout(timer);
            if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
        };
    }, [activeTourId, currentStep, findTarget]);

    // Calculate tooltip position
    useEffect(() => {
        if (!activeTourId || !tooltipRef.current) return;
        const tooltip = tooltipRef.current;
        const tooltipWidth = 380;
        const tooltipHeight = tooltip.offsetHeight || 220;
        const padding = 16;
        const vw = window.innerWidth;
        const vh = window.innerHeight;

        if (!targetRect || step?.position === 'center') {
            setTooltipPos({ top: Math.max(padding, (vh - tooltipHeight) / 2), left: Math.max(padding, (vw - tooltipWidth) / 2) });
            return;
        }

        let top = targetRect.top + targetRect.height + 16;
        let left = targetRect.left + targetRect.width / 2 - tooltipWidth / 2;

        if (step?.position === 'top' || top + tooltipHeight > vh - padding) {
            top = targetRect.top - tooltipHeight - 16;
        }

        left = Math.max(padding, Math.min(left, vw - tooltipWidth - padding));
        top = Math.max(padding, Math.min(top, vh - tooltipHeight - padding));

        setTooltipPos({ top, left });
    }, [targetRect, activeTourId, currentStep, step]);

    const closeTour = () => {
        setActiveTourId(null);
        setCurrentStep(0);
        setTargetRect(null);
    };

    const goNext = () => {
        if (currentStep + 1 >= visibleSteps.length) closeTour();
        else setCurrentStep(currentStep + 1);
    };

    const goPrev = () => {
        if (currentStep > 0) setCurrentStep(currentStep - 1);
    };

    // ESC to close
    useEffect(() => {
        if (!activeTourId) return;
        const handleKey = (e) => { if (e.key === 'Escape') closeTour(); };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [activeTourId]);

    if (!activeTourId || !step) return null;

    const progressPct = ((currentStep + 1) / visibleSteps.length) * 100;

    return (
        <>
            {/* Overlay with cutout */}
            <div style={{ position: 'fixed', inset: 0, zIndex: 99990, pointerEvents: 'none' }}>
                <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0 }}>
                    <defs>
                        <mask id="ctx-tour-mask">
                            <rect width="100%" height="100%" fill="white" />
                            {targetRect && (
                                <rect x={targetRect.left} y={targetRect.top}
                                    width={targetRect.width} height={targetRect.height}
                                    rx="12" fill="black" />
                            )}
                        </mask>
                    </defs>
                    <rect width="100%" height="100%" fill="rgba(0, 0, 0, 0.78)" mask="url(#ctx-tour-mask)" />
                </svg>

                {/* Glow border */}
                {targetRect && (
                    <div style={{
                        position: 'absolute', top: targetRect.top, left: targetRect.left,
                        width: targetRect.width, height: targetRect.height,
                        borderRadius: '12px', border: '2px solid #818cf8',
                        boxShadow: '0 0 20px rgba(129,140,248,0.5), 0 0 40px rgba(129,140,248,0.2)',
                        animation: 'ctxTourPulse 2s ease-in-out infinite',
                        pointerEvents: 'none'
                    }} />
                )}
            </div>

            {/* Backdrop click to dismiss */}
            <div onClick={closeTour} style={{ position: 'fixed', inset: 0, zIndex: 99991, cursor: 'pointer' }} />

            {/* Tooltip */}
            <div ref={tooltipRef} onClick={e => e.stopPropagation()} style={{
                position: 'fixed', top: tooltipPos.top, left: tooltipPos.left,
                zIndex: 99992, width: '380px',
                background: 'linear-gradient(145deg, #1e293b, #0f172a)',
                border: '2px solid rgba(129, 140, 248, 0.4)',
                borderRadius: '16px', padding: '24px',
                boxShadow: '0 20px 60px rgba(0,0,0,0.6), 0 0 30px rgba(129,140,248,0.15)',
                transition: 'top 0.3s ease, left 0.3s ease', cursor: 'default'
            }}>
                {/* Close */}
                <button onClick={closeTour} style={{
                    position: 'absolute', top: '12px', right: '12px',
                    background: 'rgba(255,255,255,0.05)', border: 'none',
                    color: '#94a3b8', cursor: 'pointer', padding: '4px',
                    borderRadius: '6px', display: 'flex', alignItems: 'center'
                }} title={t('tour.closeTourTip')}>
                    <X size={16} />
                </button>

                {/* Tour badge */}
                <div style={{
                    position: 'absolute', top: '-12px', left: '24px',
                    padding: '3px 12px', borderRadius: '12px',
                    background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                    fontSize: '0.65rem', fontWeight: 700, color: '#fff',
                    letterSpacing: '0.04em', textTransform: 'uppercase',
                    boxShadow: '0 2px 8px rgba(245,158,11,0.4)'
                }}>
                    {tour.label} Tour
                </div>

                {/* Icon + Title */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px', marginTop: '4px' }}>
                    <div style={{
                        fontSize: '2rem', width: '50px', height: '50px',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: 'rgba(245,158,11,0.1)', borderRadius: '14px',
                        border: '1px solid rgba(245,158,11,0.2)', flexShrink: 0
                    }}>
                        {step.icon}
                    </div>
                    <div>
                        <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#f1f5f9', fontWeight: 700 }}>
                            {step.title}
                        </h3>
                        <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '2px' }}>
                            Step {currentStep + 1} of {visibleSteps.length}
                        </div>
                    </div>
                </div>

                {/* Body */}
                <p style={{ margin: '0 0 20px 0', fontSize: '0.9rem', lineHeight: 1.6, color: '#cbd5e1' }}>
                    {step.body}
                </p>

                {/* Progress bar */}
                <div style={{ height: '4px', borderRadius: '2px', background: 'rgba(255,255,255,0.06)', marginBottom: '16px', overflow: 'hidden' }}>
                    <div style={{
                        height: '100%', width: `${progressPct}%`,
                        background: 'linear-gradient(90deg, #f59e0b, #d97706)',
                        borderRadius: '2px', transition: 'width 0.4s ease'
                    }} />
                </div>

                {/* Navigation */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <button onClick={closeTour} style={{
                        background: 'none', border: 'none', color: '#64748b',
                        cursor: 'pointer', fontSize: '0.8rem', padding: '6px 0'
                    }} title={t('tour.endTheTourTip')}>{t('tour.endTour', 'End Tour')}</button>

                    <div style={{ display: 'flex', gap: '8px' }}>
                        {currentStep > 0 && (
                            <button onClick={goPrev} style={{
                                display: 'flex', alignItems: 'center', gap: '4px',
                                padding: '8px 16px', borderRadius: '8px',
                                background: 'rgba(255,255,255,0.06)',
                                border: '1px solid rgba(255,255,255,0.1)',
                                color: '#94a3b8', cursor: 'pointer',
                                fontSize: '0.85rem', fontWeight: 500
                            }} title={t('tour.goToPreviousStepTip')}>
                                <ChevronLeft size={16} />{t('tour.back', 'Back')}</button>
                        )}
                        <button onClick={step.isFinal ? closeTour : goNext} style={{
                            display: 'flex', alignItems: 'center', gap: '6px',
                            padding: '8px 20px', borderRadius: '8px',
                            background: step.isFinal
                                ? 'linear-gradient(135deg, #10b981, #059669)'
                                : 'linear-gradient(135deg, #f59e0b, #d97706)',
                            border: 'none', color: '#fff', cursor: 'pointer',
                            fontSize: '0.85rem', fontWeight: 600,
                            boxShadow: step.isFinal
                                ? '0 4px 15px rgba(16,185,129,0.3)'
                                : '0 4px 15px rgba(245,158,11,0.3)'
                        }} title={step.isFinal ? 'Complete the tour' : 'Next step'}>
                            {step.isFinal ? 'Got It!' : 'Next'}
                            {!step.isFinal && <ChevronRight size={16} />}
                            {step.isFinal && <Sparkles size={16} />}
                        </button>
                    </div>
                </div>
            </div>

            {/* CSS Animation */}
            <style>{`
                @keyframes ctxTourPulse {
                    0%, 100% { box-shadow: 0 0 20px rgba(129,140,248,0.5), 0 0 40px rgba(129,140,248,0.2); }
                    50% { box-shadow: 0 0 30px rgba(129,140,248,0.7), 0 0 60px rgba(129,140,248,0.3); }
                }
            `}</style>
        </>
    );
}
