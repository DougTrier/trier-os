// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS — Hardware Scanner Wedge Hook
 * =======================================
 * Detects barcode input from hardware scanners (Zebra, Honeywell, etc.)
 * that operate in keyboard wedge mode. These devices inject characters
 * at ~50–200 chars/second, far faster than human typing (~10–15 chars/sec).
 *
 * How it works:
 * 1. Listens for global keypress events (character accumulation)
 *    AND keydown events (Enter/Tab flush detection)
 * 2. Accumulates characters that arrive within CHAR_INTERVAL_MS of each other
 * 3. When Enter is pressed and the accumulated string is ≥ MIN_LENGTH chars
 *    that arrived within the time threshold, it's treated as a scanner input
 * 4. Human typing is far too slow to trigger this — no interference
 *
 * WHY keypress for characters, keydown for Enter/Tab:
 *   Android Chrome + Zebra DataWedge keyboard-wedge emits keydown events with
 *   e.key = 'Unidentified' AND e.keyCode = 0 for injected characters — both
 *   fields are unreliable. The keypress event always carries the correct
 *   e.key / e.charCode on Android Chrome, so character accumulation uses that.
 *   Enter/Tab don't need character data so keydown is fine for those.
 *
 * Supports: Zebra TC-series, MC-series, DS-series; Honeywell; Datalogic;
 *           any scanner in USB HID / keyboard wedge mode.
 */
import { useEffect, useRef, useCallback } from 'react';

const CHAR_INTERVAL_MS = 100;  // Max ms between characters for scanner detection
const MIN_LENGTH = 4;          // Minimum barcode length to trigger

export default function useHardwareScanner(onScan, enabled = true) {
    const bufferRef = useRef('');
    const lastKeyTimeRef = useRef(0);
    const firstKeyTimeRef = useRef(0);
    const timerRef = useRef(null);

    const flush = useCallback((e) => {
        if (bufferRef.current.length >= MIN_LENGTH) {
            if (e) { e.preventDefault(); e.stopPropagation(); }
            const scannedValue = bufferRef.current.trim();
            bufferRef.current = '';
            lastKeyTimeRef.current = 0;
            firstKeyTimeRef.current = 0;
            if (timerRef.current) clearTimeout(timerRef.current);
            if (navigator.vibrate) navigator.vibrate(100);
            onScan(scannedValue);
        } else {
            bufferRef.current = '';
        }
    }, [onScan]);

    // keydown: ONLY used to detect Enter / Tab (the DataWedge suffix key).
    // Do NOT accumulate characters here — on Android Chrome, keydown events
    // from DataWedge have e.key = 'Unidentified' and e.keyCode = 0.
    const handleKeyDown = useCallback((e) => {
        if (!enabled) return;
        if (e.key === 'Enter' || e.key === 'Tab') {
            flush(e);
        }
    }, [enabled, flush]);

    // keypress: character accumulation. Unlike keydown, keypress always carries
    // the correct character on Android Chrome even when DataWedge is the source.
    // e.key is the character; e.charCode is the fallback for older Android WebViews.
    const handleKeyPress = useCallback((e) => {
        if (!enabled) return;

        const now = Date.now();
        const timeSinceLastKey = now - lastKeyTimeRef.current;

        // Resolve the character — prefer e.key, fall back to e.charCode
        let char = e.key;
        if (!char || char.length !== 1) {
            if (e.charCode >= 32 && e.charCode <= 126) {
                char = String.fromCharCode(e.charCode);
            } else {
                return;
            }
        }

        // If too much time has passed since last character, start a fresh burst
        if (lastKeyTimeRef.current > 0 && timeSinceLastKey > CHAR_INTERVAL_MS) {
            bufferRef.current = '';
            firstKeyTimeRef.current = 0;
        }

        if (bufferRef.current.length === 0) firstKeyTimeRef.current = now;
        bufferRef.current += char;
        lastKeyTimeRef.current = now;

        // Safety auto-flush: handles scanners with no suffix key configured
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
            if (bufferRef.current.length >= MIN_LENGTH) {
                const elapsed = Date.now() - firstKeyTimeRef.current;
                const avgInterval = elapsed / bufferRef.current.length;
                if (avgInterval <= CHAR_INTERVAL_MS) {
                    if (navigator.vibrate) navigator.vibrate(100);
                    onScan(bufferRef.current.trim());
                }
            }
            bufferRef.current = '';
            firstKeyTimeRef.current = 0;
        }, 500);
    }, [onScan, enabled]);

    useEffect(() => {
        if (!enabled) return;

        // Capture phase so we intercept before any focused input element
        document.addEventListener('keydown', handleKeyDown, true);
        document.addEventListener('keypress', handleKeyPress, true);
        return () => {
            document.removeEventListener('keydown', handleKeyDown, true);
            document.removeEventListener('keypress', handleKeyPress, true);
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, [handleKeyDown, handleKeyPress, enabled]);
}
