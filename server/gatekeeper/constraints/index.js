// Copyright © 2026 Trier OS. All Rights Reserved.

const CONSTRAINT_MAP = {
    LOTO_ACTIVATE:       require('./loto').checkActivate,
    LOTO_VOID:           require('./loto').checkVoid,
    SETPOINT_WRITE:      require('./setpoint').checkNotLocked,
    SAFETY_PARAM_CHANGE: require('./setpoint').checkNotLocked,
    MOC_APPROVE:         require('./moc_state').checkUnderReview,
    MOC_CLOSE:           require('./moc_state').checkCloseable,
};

async function runConstraints(intent) {
    const checker = CONSTRAINT_MAP[intent.actionType];
    if (!checker) {
        return { 
            certified: true, 
            passed: ['NO_CONSTRAINTS_REQUIRED'],    
            failed: [], 
            causalExplanation: null 
        };
    }
    return checker(intent);
}

module.exports = { runConstraints };
