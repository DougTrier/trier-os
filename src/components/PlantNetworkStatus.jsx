// Copyright © 2026 Trier OS. All Rights Reserved.

import React, { useState, useEffect, useRef } from 'react';
import { Server, Wifi, WifiOff, Monitor, Smartphone, RefreshCw } from 'lucide-react';
import LanHub from '../utils/LanHub.js';
import OfflineDB from '../utils/OfflineDB.js';
import { useTranslation } from '../i18n/index.jsx';

// Threshold after which offline cache data is considered stale enough to warn
// managers — 30 min is aggressive enough to matter but not so tight that a
// brief server hiccup floods the panel with warnings.
const STALE_MS = 30 * 60 * 1000;

// Converts an ISO timestamp to a human-readable age string (e.g. "2h 15m ago").
// Used in the staleness badge so managers can judge whether cached WO data is
// safe to act on without waiting for the server to come back.
function formatAge(ts) {
    const diffMs = Date.now() - new Date(ts).getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    // Only include minutes component when non-zero to keep the string concise
    return `${hrs}h${mins % 60 ? ` ${mins % 60}m` : ''} ago`;
}

const POLL_MS = 10_000;

function Dot({ online, muted }) {
    const color = muted ? '#475569' : online ? '#22c55e' : '#ef4444';
    return (
        <span style={{
            display: 'inline-block', width: 7, height: 7, borderRadius: '50%',
            background: color, flexShrink: 0,
            boxShadow: muted ? 'none' : `0 0 6px ${color}99`,
        }} />
    );
}

function DeviceBadge({ device }) {
    const { t } = useTranslation();
    const label = device.deviceId
        || (device.userId ? t('plantNetwork.deviceUser', 'User {{id}}').replace('{{id}}', device.userId) : t('plantNetwork.device', 'Device'));
    const since = device.connectedAt
        ? new Date(device.connectedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : null;

    return (
        <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)',
            borderRadius: 8, padding: '4px 10px',
        }}>
            <Smartphone size={11} color="#818cf8" />
            <span style={{ color: '#c7d2fe', fontSize: 11, fontWeight: 600 }}>{label}</span>
            {since && <span style={{ color: '#475569', fontSize: 10 }}>· {since}</span>}
        </div>
    );
}

function StatusChip({ icon: Icon, label, value, online, muted }) {
    const textColor = muted ? '#475569' : online ? '#22c55e' : '#ef4444';
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <Icon size={13} color="#475569" />
            <span style={{ color: '#64748b', fontSize: 12 }}>{label}</span>
            <Dot online={online} muted={muted} />
            <span style={{ fontSize: 12, fontWeight: 600, color: textColor }}>{value}</span>
        </div>
    );
}

const DIVIDER = (
    <div style={{ width: 1, background: 'rgba(255,255,255,0.06)', alignSelf: 'stretch', flexShrink: 0 }} />
);

export default function PlantNetworkStatus({ plantId }) {
    const { t } = useTranslation();

    const [serverOnline, setServerOnline]       = useState(null);
    const [hubStatus, setHubStatus]             = useState(null);
    const [hubConnected, setHubConnected]       = useState(LanHub.isConnected());
    const [liveDevices, setLiveDevices]         = useState([]);
    const [lastPoll, setLastPoll]               = useState(null);
    const [polling, setPolling]                 = useState(false);
    // Timestamp of the last successful fullCacheRefresh, read from IndexedDB meta.
    // Only populated when the server is unreachable so the staleness badge appears
    // only when it is actionable (i.e. the tech cannot simply refresh from server).
    const [lastCacheRefresh, setLastCacheRefresh] = useState(null);
    const timerRef = useRef(null);

    const loadCacheAge = () => {
        OfflineDB.getMeta('lastSync')
            .then(ts => { if (ts) setLastCacheRefresh(ts); })
            .catch(() => {});
    };

    const poll = () => {
        setPolling(true);
        fetch('/api/hub/status')
            .then(r => r.ok ? r.json() : Promise.reject())
            .then(data => {
                setServerOnline(true);
                setHubStatus(data);
                setLastPoll(new Date());
            })
            .catch(() => {
                setServerOnline(false);
                setHubStatus(null);
                loadCacheAge();
            })
            .finally(() => setPolling(false));
    };

    useEffect(() => {
        loadCacheAge();
        poll();
        timerRef.current = setInterval(poll, POLL_MS);
        return () => clearInterval(timerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [plantId]);

    useEffect(() => {
        LanHub.onStatusChange(setHubConnected);
        LanHub.onDeviceList(setLiveDevices);
    }, []);

    const devices = hubConnected && liveDevices.length ? liveDevices : (hubStatus?.devices ?? []);

    const centralLabel = serverOnline === null
        ? t('plantNetwork.checking', 'Checking…')
        : serverOnline
            ? t('plantNetwork.online', 'Online')
            : t('plantNetwork.unreachable', 'Unreachable');

    const hubRunning = hubConnected || hubStatus?.running;
    const hubLabel   = hubConnected
        ? t('plantNetwork.hubConnected', 'Connected · port {{port}}').replace('{{port}}', LanHub.HUB_PORT)
        : hubStatus?.running
            ? t('plantNetwork.hubRunning', 'Running · port {{port}}').replace('{{port}}', hubStatus.port)
            : t('plantNetwork.hubNotRunning', 'Not running');

    const devicesLabel = t('plantNetwork.devicesConnected', '{{n}} connected').replace('{{n}}', devices.length);

    return (
        <div style={{ maxWidth: 1400, margin: '0 auto 20px', padding: '0 16px' }}>
            <div style={{
                background: 'rgba(255,255,255,0.03)',
                backdropFilter: 'blur(12px)',
                border: '1px solid rgba(255,255,255,0.07)',
                borderRadius: 14,
                padding: '14px 20px',
            }}>
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <Server size={14} color="#6366f1" />
                    <span style={{ color: '#f1f5f9', fontWeight: 700, fontSize: 13 }}>
                        {t('plantNetwork.title', 'Plant Network')}
                    </span>
                    <button
                        onClick={poll}
                        disabled={polling}
                        title={t('plantNetwork.refresh', 'Refresh')}
                        style={{
                            marginLeft: 4, background: 'none', border: 'none',
                            color: '#334155', cursor: 'pointer', padding: 2, lineHeight: 0,
                        }}
                    >
                        <RefreshCw size={12} style={{ animation: polling ? 'spin 1s linear infinite' : 'none' }} />
                    </button>
                    {lastPoll && (
                        <span style={{ marginLeft: 'auto', color: '#334155', fontSize: 11 }}>
                            {lastPoll.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </span>
                    )}
                    {/* Staleness badge — only visible when server is down AND the
                        last successful cache refresh was more than STALE_MS ago.
                        This gives plant managers a signal that the WO / asset data
                        on-screen may not reflect recent changes made from another
                        workstation that was still online. */}
                    {serverOnline === false && lastCacheRefresh && (Date.now() - new Date(lastCacheRefresh).getTime()) > STALE_MS && (
                        <span style={{
                            marginLeft: lastPoll ? 8 : 'auto',
                            background: 'rgba(245,158,11,0.12)',
                            border: '1px solid rgba(245,158,11,0.25)',
                            borderRadius: 6,
                            padding: '2px 8px',
                            fontSize: 11,
                            color: '#f59e0b',
                            fontWeight: 600,
                            whiteSpace: 'nowrap',
                        }}>
                            ⏱ {t('plantNetwork.cacheStale', 'Offline data last updated {{age}}').replace('{{age}}', formatAge(lastCacheRefresh))}
                        </span>
                    )}
                </div>

                {/* Status row */}
                <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center', marginBottom: devices.length ? 12 : 0 }}>
                    <StatusChip
                        icon={Server}
                        label={t('plantNetwork.centralServer', 'Central Server')}
                        value={centralLabel}
                        online={serverOnline === true}
                        muted={serverOnline === null}
                    />

                    {DIVIDER}

                    <StatusChip
                        icon={hubConnected ? Wifi : WifiOff}
                        label={t('plantNetwork.lanHub', 'LAN Hub')}
                        value={hubLabel}
                        online={!!hubRunning}
                        muted={false}
                    />

                    {devices.length > 0 && DIVIDER}

                    {devices.length > 0 && (
                        <StatusChip
                            icon={Monitor}
                            label={t('plantNetwork.devices', 'Devices')}
                            value={devicesLabel}
                            online={true}
                            muted={false}
                        />
                    )}
                </div>

                {/* Device badges */}
                {devices.length > 0 && (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {devices.map((d, i) => (
                            <DeviceBadge key={d.deviceId || i} device={d} />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
