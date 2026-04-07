// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS — Depreciation Calculation Utility
 * =============================================
 * Supports Straight-Line and Double Declining Balance methods.
 * Handles mid-year purchases (pro-rated), fully depreciated assets, and salvage floors.
 */

/**
 * Calculate current depreciation state for an IT asset.
 * @param {number|string} purchaseCost - Original purchase price
 * @param {number|string} salvageValue - Residual/salvage value at end of useful life
 * @param {number|string} usefulLife - Useful life in years
 * @param {string} method - 'Straight-Line' or 'Declining Balance'
 * @param {string} purchaseDate - ISO date string of purchase
 * @returns {{ currentBookValue: number, accumulatedDepreciation: number, monthlyExpense: number, fullyDepreciated: boolean, remainingMonths: number, percentDepreciated: number }}
 */
function calculateDepreciation(purchaseCost, salvageValue, usefulLife, method, purchaseDate) {
    const cost = parseFloat(purchaseCost || 0);
    const salvage = parseFloat(salvageValue || 0);
    const life = parseInt(usefulLife || 5);
    if (cost <= 0 || !purchaseDate) return { currentBookValue: cost, accumulatedDepreciation: 0, monthlyExpense: 0, fullyDepreciated: false, remainingMonths: life * 12, percentDepreciated: 0 };

    const purchase = new Date(purchaseDate);
    const now = new Date();
    const ageYears = (now - purchase) / (1000 * 60 * 60 * 24 * 365.25);

    if (ageYears < 0) return { currentBookValue: cost, accumulatedDepreciation: 0, monthlyExpense: 0, fullyDepreciated: false, remainingMonths: life * 12, percentDepreciated: 0 };

    let currentBookValue, accumulatedDepreciation, monthlyExpense;

    if (method === 'Declining Balance' || method === 'Double-Declining Balance') {
        const rate = 2 / life;
        let bookValue = cost;
        const straightLineAnnual = (cost - salvage) / life;
        for (let y = 0; y < Math.floor(ageYears) && y < life; y++) {
            const declining = bookValue * rate;
            const dep = Math.max(declining, straightLineAnnual);
            bookValue -= dep;
            if (bookValue < salvage) { bookValue = salvage; break; }
        }
        // Pro-rate partial year
        const partial = ageYears - Math.floor(ageYears);
        if (partial > 0 && bookValue > salvage) {
            const declining = bookValue * rate;
            const dep = Math.max(declining, straightLineAnnual) * partial;
            bookValue -= dep;
            if (bookValue < salvage) bookValue = salvage;
        }
        currentBookValue = Math.max(bookValue, salvage);
        accumulatedDepreciation = cost - currentBookValue;
        monthlyExpense = ageYears < life ? (cost - salvage) / life / 12 : 0;
    } else if (method === 'Sum-of-the-Years-Digits') {
        // ── Defect 3.4: True Sum-of-the-Years-Digits Logic ──
        const depreciableBase = Math.max(0, cost - salvage);
        const sumOfYears = (life * (life + 1)) / 2;
        let accum = 0;
        const fullYears = Math.min(Math.floor(ageYears), life);
        
        for (let y = 1; y <= fullYears; y++) {
            const fraction = (life - y + 1) / sumOfYears;
            accum += (fraction * depreciableBase);
        }
        
        let currentMonthExp = 0;
        if (fullYears < life) {
            const partial = ageYears - fullYears;
            const currentYearFraction = (life - fullYears) / sumOfYears;
            const currentYearDep = currentYearFraction * depreciableBase;
            accum += (currentYearDep * partial);
            currentMonthExp = currentYearDep / 12;
        }
        
        accumulatedDepreciation = Math.min(accum, depreciableBase);
        currentBookValue = Math.max(cost - accumulatedDepreciation, salvage);
        monthlyExpense = currentMonthExp;
    } else {
        // Default: Straight-Line
        const annualDep = (cost - salvage) / life;
        accumulatedDepreciation = Math.min(annualDep * ageYears, cost - salvage);
        currentBookValue = Math.max(cost - accumulatedDepreciation, salvage);
        monthlyExpense = ageYears < life ? annualDep / 12 : 0;
    }

    const fullyDepreciated = currentBookValue <= salvage + 0.01;
    const totalMonths = life * 12;
    const elapsedMonths = Math.min(Math.round(ageYears * 12), totalMonths);
    const remainingMonths = Math.max(totalMonths - elapsedMonths, 0);
    const depreciableAmount = cost - salvage;
    const percentDepreciated = depreciableAmount > 0 ? Math.round((accumulatedDepreciation / depreciableAmount) * 100) : 0;

    return {
        currentBookValue: Math.round(currentBookValue * 100) / 100,
        accumulatedDepreciation: Math.round(accumulatedDepreciation * 100) / 100,
        monthlyExpense: Math.round(monthlyExpense * 100) / 100,
        fullyDepreciated,
        remainingMonths,
        percentDepreciated: Math.min(percentDepreciated, 100),
    };
}

module.exports = { calculateDepreciation };
