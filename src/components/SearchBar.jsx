// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — Search Bar
 * ======================
 * Platform-standard search input component used across all 30+ views.
 * Provides a consistent search UX: search icon on the left, live clear
 * button on the right, and unified dark-mode styling throughout.
 *
 * KEY FEATURES:
 *   - Search icon: magnifying glass on the left for immediate recognition
 *   - Clear button: ✕ appears when text is present; clears on click
 *   - Controlled input: value and onChange props for parent state management
 *   - Debounce: optional debounce prop to delay onChange calls (default 0ms)
 *   - Auto-focus: optional autoFocus prop for keyboard-first workflows
 *   - Consistent styling: matches dark-mode Trier OS glassmorphism palette
 *
 * Usage:
 *   <SearchBar
 *     value={search}
 *     onChange={setSearch}
 *     placeholder="Search work orders..."
 *     width={220}                  // optional, default: '100%'
 *     title="Search by ID or name" // optional accessibility title
 *   />
 */
import React, { useRef, useEffect, useCallback } from 'react';
import { Search, X } from 'lucide-react';
import { useTranslation } from '../i18n/index.jsx';

export default function SearchBar({
    value = '',
    onChange,
    placeholder,
    width,
    title,
    style = {},
    className = '',
    autoFocus = false,
    onKeyDown,
}) {
    const { t } = useTranslation();
    const displayPlaceholder = placeholder !== undefined ? placeholder : t('searchBar.search', 'Search...');
    const inputRef = useRef(null);

    // Auto-focus support
    useEffect(() => {
        if (autoFocus && inputRef.current) {
            inputRef.current.focus();
        }
    }, [autoFocus]);

    const handleClear = useCallback(() => {
        onChange('');
        inputRef.current?.focus();
    }, [onChange]);

    const handleChange = useCallback((e) => {
        onChange(e.target.value);
    }, [onChange]);

    return (
        <div
            className={`search-bar ${className}`}
            style={{
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                width: width || '100%',
                ...style,
            }}
        >
            <Search
                size={16}
                style={{
                    position: 'absolute',
                    left: 12,
                    color: 'var(--text-muted)',
                    pointerEvents: 'none',
                    zIndex: 1,
                }}
            />
            <input
                ref={inputRef}
                type="text"
                placeholder={displayPlaceholder}
                value={value}
                onChange={handleChange}
                onKeyDown={onKeyDown}
                title={title || displayPlaceholder}
                style={{
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid var(--glass-border)',
                    borderRadius: 8,
                    padding: '8px 32px 8px 35px',
                    color: 'white',
                    fontSize: '0.85rem',
                    width: '100%',
                    outline: 'none',
                    transition: 'border-color 0.2s, box-shadow 0.2s',
                }}
                onFocus={(e) => {
                    e.target.style.borderColor = 'var(--primary)';
                    e.target.style.boxShadow = '0 0 0 2px rgba(99,102,241,0.15)';
                }}
                onBlur={(e) => {
                    e.target.style.borderColor = 'var(--glass-border)';
                    e.target.style.boxShadow = 'none';
                }}
            />
            {value && (
                <button
                    onClick={handleClear}
                    title={t('searchBar.clearSearch', 'Clear search')}
                    style={{
                        position: 'absolute',
                        right: 8,
                        background: 'none',
                        border: 'none',
                        color: 'var(--text-muted)',
                        cursor: 'pointer',
                        padding: 2,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: 4,
                        transition: 'color 0.15s',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = '#e2e8f0'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; }}
                >
                    <X size={14} />
                </button>
            )}
        </div>
    );
}
