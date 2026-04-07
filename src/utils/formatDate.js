// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * formatDate — Standard 8: Platform-wide Date & Time Formatting
 * ==============================================================
 * Usage:
 *   import { formatDate, formatDateTime, relativeTime, formatDateInput } from '../utils/formatDate';
 *
 *   formatDate('2026-03-22')           → "Mar 22, 2026"
 *   formatDateTime('2026-03-22T14:30') → "Mar 22, 2026 2:30 PM"
 *   relativeTime('2026-03-22T12:00')   → "2 hours ago"
 *   formatDateInput('2026-03-22')      → "2026-03-22" (for <input type="date">)
 */

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Parse a date string or Date object into a Date.
 * Returns null if the input is falsy or invalid.
 */
function parseDate(input) {
    if (!input) return null;
    const d = input instanceof Date ? input : new Date(input);
    return isNaN(d.getTime()) ? null : d;
}

/**
 * Format a date as "Mar 22, 2026"
 * @param {string|Date} input
 * @returns {string}
 */
export function formatDate(input) {
    const d = parseDate(input);
    if (!d) return '—';
    return `${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

/**
 * Format a date + time as "Mar 22, 2026 2:30 PM"
 * @param {string|Date} input
 * @returns {string}
 */
export function formatDateTime(input) {
    const d = parseDate(input);
    if (!d) return '—';
    const hours = d.getHours();
    const minutes = d.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const h = hours % 12 || 12;
    const m = minutes.toString().padStart(2, '0');
    return `${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()} ${h}:${m} ${ampm}`;
}

/**
 * Return a human-readable relative time string.
 *   "Just now", "2 minutes ago", "3 hours ago", "Yesterday", "5 days ago", "Mar 15, 2026"
 * @param {string|Date} input
 * @returns {string}
 */
export function relativeTime(input) {
    const d = parseDate(input);
    if (!d) return '—';
    const now = new Date();
    const diffMs = now - d;
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHr = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHr / 24);

    if (diffSec < 60) return 'Just now';
    if (diffMin < 60) return `${diffMin} minute${diffMin !== 1 ? 's' : ''} ago`;
    if (diffHr < 24) return `${diffHr} hour${diffHr !== 1 ? 's' : ''} ago`;
    if (diffDay === 1) return 'Yesterday';
    if (diffDay < 7) return `${diffDay} days ago`;
    if (diffDay < 30) return `${Math.floor(diffDay / 7)} week${Math.floor(diffDay / 7) !== 1 ? 's' : ''} ago`;
    // Older than a month — use standard date format
    return formatDate(d);
}

/**
 * Format a date for use in <input type="date"> value (YYYY-MM-DD)
 * @param {string|Date} input
 * @returns {string}
 */
export function formatDateInput(input) {
    const d = parseDate(input);
    if (!d) return '';
    const y = d.getFullYear();
    const m = (d.getMonth() + 1).toString().padStart(2, '0');
    const day = d.getDate().toString().padStart(2, '0');
    return `${y}-${m}-${day}`;
}

/**
 * Map a status string to a CSS class name for consistent styling.
 * @param {string} status - The status string (case-insensitive)
 * @returns {string} CSS class like "status-badge status-open"
 */
export function statusClass(status) {
    if (!status) return 'status-badge status-cancelled';
    const s = String(status).toLowerCase().trim();
    if (['open', 'new', 'pending', 'submitted', 'draft'].includes(s)) return 'status-badge status-open';
    if (['in progress', 'active', 'in-progress', 'working', 'assigned', 'investigating', 'in service', 'available', 'scheduled'].includes(s)) return 'status-badge status-active';
    if (['complete', 'completed', 'done', 'closed', 'approved', 'resolved', 'pass', 'passed'].includes(s)) return 'status-badge status-complete';
    if (['overdue', 'urgent', 'critical', 'expired', 'past due', 'repair', 'in shop', 'defective', 'out of service', 'fail', 'failed'].includes(s)) return 'status-badge status-overdue';
    if (['on hold', 'hold', 'paused', 'waiting', 'on-hold', 'waiting for parts', 'checked out', 'adjusted'].includes(s)) return 'status-badge status-hold';
    if (['cancelled', 'canceled', 'void', 'voided', 'rejected', 'denied', 'retired', 'removed', 'scrapped', 'sold', 'inactive'].includes(s)) return 'status-badge status-cancelled';
    return 'status-badge status-open'; // default
}
