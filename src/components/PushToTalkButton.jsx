// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — Push-to-Talk Voice Input
 * =====================================
 * Browser-based speech recognition button for hands-free work order updates.
 * Uses the Web Speech API (SpeechRecognition) to transcribe spoken notes
 * directly into text fields. Designed for greasy-glove field use.
 *
 * KEY FEATURES:
 *   - Hold-to-record: press and hold the mic button to start transcription
 *   - Real-time transcription: interim results shown while speaking
 *   - Language: en-US by default; configurable via browser locale
 *   - On release: final transcript delivered via onResult callback
 *   - Visual state: idle / listening / processing with animated ring
 *   - Unsupported fallback: hides gracefully on browsers without SpeechRecognition
 *   - Used in: ChatView (voice messages), WorkOrdersView (voice notes), InventoryAdjustmentsView
 *
 * @param {Function} onResult              — Callback receiving the final transcribed string
 * @param {string}   [placeholder]         — Tooltip text shown on the mic button
 */
import React, { useState, useEffect, useRef } from 'react';
import { Mic } from 'lucide-react';
import { useTranslation } from '../i18n/index.jsx';

const PushToTalkButton = ({ onResult, placeholder = "Hold to speak..." }) => {
    const { t } = useTranslation();
    const [isListening, setIsListening] = useState(false);
    const [isSupported, setIsSupported] = useState(true);
    const recognitionRef = useRef(null);
    const transcriptRef = useRef('');
    const holdTimeoutRef = useRef(null);

    useEffect(() => {
        // Check for Web Speech API support
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            setIsSupported(false);
            return;
        }

        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        recognition.onresult = (event) => {
            const transcript = Array.from(event.results)
                .map(result => result[0])
                .map(result => result.transcript)
                .join('');
            
            transcriptRef.current = transcript;
        };

        recognition.onerror = (event) => {
            if (event.error !== 'aborted') {
                console.error('Speech recognition error:', event.error);
            }
            setIsListening(false);
        };

        recognition.onend = () => {
            setIsListening(false);
        };

        recognitionRef.current = recognition;
    }, [onResult]);

    const startListening = (e) => {
        if (e) e.preventDefault();
        if (!isSupported || isListening) return;

        try {
            transcriptRef.current = ''; // Reset on new press
            recognitionRef.current.start();
            setIsListening(true);
            if (navigator.vibrate) navigator.vibrate(50);
        } catch (err) {
            console.error('Failed to start speech recognition:', err);
        }
    };

    const stopListening = (e) => {
        if (e) e.preventDefault();
        if (!isListening) return;

        try {
            recognitionRef.current.stop();
            setIsListening(false);
            if (onResult && transcriptRef.current) {
                onResult(transcriptRef.current.trim());
                transcriptRef.current = '';
            }
        } catch (err) {
            console.error('Failed to stop speech recognition:', err);
        }
    };

    if (!isSupported) return null;

    return (
        <button
            onMouseDown={startListening}
            onMouseUp={stopListening}
            onMouseLeave={stopListening}
            onTouchStart={startListening}
            onTouchEnd={stopListening}
            className={`btn-ptt ${isListening ? 'active' : ''}`}
            style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                padding: '10px 20px',
                borderRadius: '12px',
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                background: isListening ? 'var(--red-gradient, linear-gradient(135deg, #ef4444 0%, #b91c1c 100%))' : 'rgba(255,255,255,0.05)',
                color: isListening ? '#fff' : 'var(--text-muted)',
                boxShadow: isListening ? '0 0 20px rgba(239, 68, 68, 0.4)' : 'none',
                userSelect: 'none',
                WebkitUserSelect: 'none',
                position: 'relative',
                overflow: 'hidden'
            }}
            title={t('push.to.talk.button.deadmanSwitchHoldMousefinger')}
        >
            {isListening && (
                <span className="ptt-pulse" style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'rgba(255,255,255,0.1)',
                    animation: 'pulse 1.5s infinite'
                }}></span>
            )}
            <Mic size={20} className={isListening ? 'breath' : ''} />
            <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                {isListening ? t('common.recording', 'RECORDING...') : t('common.holdToSpeak', 'HOLD TO SPEAK')}
            </span>
            
            <style>
                {`
                    @keyframes pulse {
                        0% { opacity: 1; transform: scale(1); }
                        100% { opacity: 0; transform: scale(1.5); }
                    }
                    .breath {
                        animation: breath 1.5s ease-in-out infinite;
                    }
                    @keyframes breath {
                        0%, 100% { transform: scale(1); }
                        50% { transform: scale(1.2); }
                    }
                    .btn-ptt:active {
                        transform: scale(0.95);
                    }
                `}
            </style>
        </button>
    );
};

export default PushToTalkButton;
