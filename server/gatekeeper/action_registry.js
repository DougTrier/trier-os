// Copyright © 2026 Trier OS. All Rights Reserved.

const ACTION_REGISTRY = {
    // Safety-Critical
    'LOTO_ACTIVATE':        'SAFETY_CRITICAL',
    'LOTO_VOID':            'SAFETY_CRITICAL',
    'MOC_APPROVE':          'SAFETY_CRITICAL',
    'MOC_CLOSE':            'SAFETY_CRITICAL',
    'SETPOINT_WRITE':       'SAFETY_CRITICAL',
    'SAFETY_PARAM_CHANGE':  'SAFETY_CRITICAL',
    'SOP_OVERRIDE':         'SAFETY_CRITICAL',

    // Non-Critical
    'WORK_ORDER_CREATE':    'NON_CRITICAL',
    'WORK_ORDER_CLOSE':     'NON_CRITICAL',
    'PARTS_CONSUME':        'NON_CRITICAL',
    'INVENTORY_ADJUST':     'NON_CRITICAL',
    'SHIFT_HANDOVER':       'NON_CRITICAL',

    // Advisory
    'ALERT_ACKNOWLEDGE':    'ADVISORY',
    'WO_ANNOTATE':          'ADVISORY',

    // Read-only
    'REPORT_READ':          'READ_ONLY',
    'DASHBOARD_VIEW':       'READ_ONLY',
};

function getActionClass(actionType) {
    const actionClass = ACTION_REGISTRY[actionType];
    if (!actionClass) {
        throw new Error(`Unknown actionType: ${actionType}`);
    }
    return actionClass;
}

function isGoverned(actionType) {
    const actionClass = getActionClass(actionType);
    return actionClass === 'NON_CRITICAL' || actionClass === 'SAFETY_CRITICAL';
}

module.exports = {
    getActionClass,
    isGoverned
};
