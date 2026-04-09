// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS - Internationalization (i18n) Module
 * ======================================================
 * Provides multi-language support for the Trier OS frontend.
 * Uses a React Context-based translation system with:
 *   - useTranslation() hook for component-level translations
 *   - Language auto-detection from browser settings
 *   - Lazy-loaded language packs to minimize bundle size
 *   - Support for English (default) and Spanish
 *
 * Translation keys follow dot-notation (e.g., "dashboard.title").
 * Missing translations fall back to the English default.
 */
import React, { createContext, useContext, useState, useCallback, useMemo, useEffect } from 'react';
import en from './en.json';
import es from './es.json';
import fr from './fr.json';
import de from './de.json';
import zh from './zh.json';
import pt from './pt.json';
import ja from './ja.json';
import ko from './ko.json';
import ar from './ar.json';
import hi from './hi.json';
import tr from './tr.json';

const translations = { en, es, fr, de, zh, pt, ja, ko, ar, hi, tr };

const LANGUAGES = [
    { code: 'en', label: 'English', flag: '🇺🇸', dateFormat: 'MM/DD/YYYY' },
    { code: 'es', label: 'Español', flag: '🇲🇽', dateFormat: 'DD/MM/YYYY' },
    { code: 'fr', label: 'Français', flag: '🇫🇷', dateFormat: 'DD/MM/YYYY' },
    { code: 'de', label: 'Deutsch', flag: '🇩🇪', dateFormat: 'DD.MM.YYYY' },
    { code: 'zh', label: '中文', flag: '🇨🇳', dateFormat: 'YYYY/MM/DD' },
    { code: 'pt', label: 'Português', flag: '🇧🇷', dateFormat: 'DD/MM/YYYY' },
    { code: 'ja', label: '日本語', flag: '🇯🇵', dateFormat: 'YYYY/MM/DD' },
    { code: 'ko', label: '한국어', flag: '🇰🇷', dateFormat: 'YYYY.MM.DD' },
    { code: 'ar', label: 'العربية', flag: '🇸🇦', dateFormat: 'DD/MM/YYYY' },
    { code: 'hi', label: 'हिन्दी', flag: '🇮🇳', dateFormat: 'DD/MM/YYYY' },
    { code: 'tr', label: 'Türkçe', flag: '🇹🇷', dateFormat: 'DD.MM.YYYY' }
];

const I18nContext = createContext();

const SUPPORTED_CODES = new Set(['en', 'es', 'fr', 'de', 'zh', 'pt', 'ja', 'ko', 'ar', 'hi', 'tr']);

function detectBrowserLang() {
    // Already chosen by user — respect it
    const saved = localStorage.getItem('PM_LANGUAGE');
    if (saved && SUPPORTED_CODES.has(saved)) return saved;
    // First visit — match browser/OS language to supported locales
    const browserLangs = navigator.languages || [navigator.language || 'en'];
    for (const bl of browserLangs) {
        const code = bl.split('-')[0].toLowerCase(); // 'zh-CN' → 'zh'
        if (SUPPORTED_CODES.has(code)) return code;
    }
    return 'en';
}

export function I18nProvider({ children }) {
    const [lang, setLang] = useState(detectBrowserLang);

    const changeLang = useCallback((code) => {
        setLang(code);
        localStorage.setItem('PM_LANGUAGE', code);
        // Notify service worker to prep the per-language translation cache
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
            navigator.serviceWorker.controller.postMessage({ type: 'XLAT_LANG_SWITCH', lang: code });
        }
    }, []);

    const t = useCallback((key, fallback) => {
        const dict = translations[lang] || translations.en;
        
        // Helper to resolve dot-notation paths (e.g., 'app.status.open') in nested objects
        const resolvePath = (obj, path) => path.split('.').reduce((o, i) => o ? o[i] : undefined, obj);
        
        // 1. Check flat key first
        // 2. Check nested path in dictionary
        // 3. Check nested path in English fallback
        // 4. Return developer fallback string or native key
        return dict[key] || 
               resolvePath(dict, key) || 
               translations.en[key] || 
               resolvePath(translations.en, key) || 
               fallback || 
               key;
    }, [lang]);

    const formatDate = useCallback((dateStr) => {
        if (!dateStr) return '--';
        try {
            const d = new Date(dateStr);
            if (isNaN(d.getTime())) return dateStr;
            const langInfo = LANGUAGES.find(l => l.code === lang) || LANGUAGES[0];
            if (langInfo.dateFormat === 'DD/MM/YYYY') {
                return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
            }
            return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`;
        } catch { return dateStr; }
    }, [lang]);

    const formatNumber = useCallback((num) => {
        if (num === null || num === undefined) return '--';
        try {
            const locale = lang === 'es' ? 'es-MX' : lang === 'fr' ? 'fr-FR' : lang === 'de' ? 'de-DE' : lang === 'zh' ? 'zh-CN' : lang === 'pt' ? 'pt-BR' : lang === 'ja' ? 'ja-JP' : lang === 'ko' ? 'ko-KR' : lang === 'ar' ? 'ar-SA' : lang === 'hi' ? 'hi-IN' : lang === 'tr' ? 'tr-TR' : 'en-US';
            return new Intl.NumberFormat(locale).format(num);
        } catch { return String(num); }
    }, [lang]);

    const value = useMemo(() => ({
        lang, setLang: changeLang, t, formatDate, formatNumber, LANGUAGES
    }), [lang, changeLang, t, formatDate, formatNumber]);

    return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useTranslation() {
    const ctx = useContext(I18nContext);
    if (!ctx) {
        // Fallback if not wrapped in provider
        return {
            lang: 'en',
            setLang: () => {},
            t: (key) => translations.en[key] || key,
            formatDate: (d) => d || '--',
            formatNumber: (n) => String(n ?? '--'),
            LANGUAGES
        };
    }
    return ctx;
}

export { LANGUAGES };
export default I18nProvider;
