// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * Trier OS — Web NFC Hook
 * =======================
 * Wraps the browser Web NFC API (NDEFReader) for reading and writing NFC tags.
 *
 * Platform support:
 *   - Android Chrome 89+ with NFC enabled in device settings
 *   - NOT supported: iOS Safari (WebKit has not implemented Web NFC)
 *   - NOT supported: Desktop browsers
 *
 * Important: scan() and write() must be triggered from a user gesture (button
 * click). They cannot be called automatically on page/component mount.
 *
 * Usage:
 *   const { startScanning, stopScanning, writeTag, isActive, isSupported, error } = useNFC(onScan);
 *   // Call startScanning() from a button's onClick handler.
 *   // Call writeTag(text) from a button's onClick handler.
 */
import { useRef, useState, useCallback } from 'react';

const NFC_SUPPORTED = typeof window !== 'undefined' && 'NDEFReader' in window;

export default function useNFC(onScan) {
    const abortRef = useRef(null);
    const [isActive, setIsActive] = useState(false);
    const [error, setError] = useState(null);

    const startScanning = useCallback(async () => {
        if (!NFC_SUPPORTED) {
            setError('Web NFC is not available. Use Android with Chrome and NFC enabled.');
            return;
        }
        setError(null);

        // Abort any previous scan session before starting a new one
        if (abortRef.current) abortRef.current.abort();
        abortRef.current = new AbortController();
        const { signal } = abortRef.current;

        try {
            const reader = new NDEFReader(); // eslint-disable-line no-undef
            await reader.scan({ signal });
            setIsActive(true);

            reader.addEventListener('reading', ({ message }) => {
                for (const record of message.records) {
                    let payload = null;

                    if (record.recordType === 'text') {
                        const decoder = new TextDecoder(record.encoding || 'utf-8');
                        payload = decoder.decode(record.data);
                    } else if (record.recordType === 'url') {
                        const decoder = new TextDecoder();
                        const url = decoder.decode(record.data);
                        // Unwrap Trier OS deep links encoded as URLs: https://host/?scan=ASSET-ID
                        try {
                            const u = new URL(url);
                            payload = u.searchParams.get('scan') || url;
                        } catch {
                            payload = url;
                        }
                    }

                    if (payload) {
                        if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
                        onScan(payload);
                        break;
                    }
                }
            }, { signal });

            reader.addEventListener('readingerror', () => {
                setError('Could not read the NFC tag. Hold device steady and try again.');
            }, { signal });

        } catch (err) {
            if (err.name === 'AbortError') return;
            setIsActive(false);
            if (err.name === 'NotAllowedError') {
                setError('NFC permission denied. Check browser and OS settings.');
            } else if (err.name === 'NotSupportedError') {
                setError('NFC not available. Ensure NFC is enabled in your device settings.');
            } else {
                setError('NFC failed to start. Enable NFC and try again.');
            }
        }
    }, [onScan]);

    const stopScanning = useCallback(() => {
        if (abortRef.current) {
            abortRef.current.abort();
            abortRef.current = null;
        }
        setIsActive(false);
        setError(null);
    }, []);

    /**
     * Write a plain-text payload to an NFC tag.
     * Must be called from a user gesture (button click).
     * @param {string} text — The ID or code to burn onto the tag.
     * @returns {{ ok: boolean, error?: string }}
     */
    const writeTag = useCallback(async (text) => {
        if (!NFC_SUPPORTED) {
            return { ok: false, error: 'Web NFC is not supported on this device.' };
        }
        try {
            const writer = new NDEFReader(); // eslint-disable-line no-undef
            await writer.write({ records: [{ recordType: 'text', data: text }] });
            if (navigator.vibrate) navigator.vibrate([50, 30, 50]);
            return { ok: true };
        } catch (err) {
            if (err.name === 'NotAllowedError') {
                return { ok: false, error: 'NFC permission denied.' };
            }
            return { ok: false, error: 'Write failed. Hold device firmly over the tag and try again.' };
        }
    }, []);

    return { startScanning, stopScanning, writeTag, isActive, isSupported: NFC_SUPPORTED, error };
}
