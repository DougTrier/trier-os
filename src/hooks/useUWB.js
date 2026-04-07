// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */

/**
 * useUWB — Real-Time UWB Position WebSocket Hook
 * ================================================
 * React hook that manages the WebSocket connection to the UWB broker
 * (/ws/uwb) and exposes live position data and safety alerts to components.
 * Used by FloorPlanView (overlay dots) and SafetyView MusteringTab (personnel grid).
 *
 * USAGE:
 *   const { positions, alerts, connected } = useUWB({ plantId, floorId });
 *
 * RETURN VALUES:
 *   positions  {Object}  — Map of tagId → { x, y, z, quality, ts, label, entityType }
 *   alerts     {Array}   — Last MAX_ALERTS safety alerts from the broker
 *   connected  {boolean} — Current WebSocket connection state
 *
 * WEBSOCKET PROTOCOL:
 *   URL:  ws://{host}/ws/uwb?plantId={plantId}&floorId={floorId}
 *   Server pushes: { type: 'positions', positions: { [tagId]: { x, y, ... } } }
 *   Server pushes: { type: 'alert', tagId, alertType, detail, ts }
 *
 * SIDE EFFECTS:
 *   - Dispatches 'trier-uwb-positions' CustomEvent on window with the positions map
 *     so other components (FloorPlanView canvas) can subscribe without prop-drilling
 *   - Automatically reconnects with exponential backoff (3s → 30s max, 10 retries)
 *   - Cleans up WebSocket and reconnect timer on unmount or when enabled=false
 *
 * RECONNECTION STRATEGY:
 *   Base delay: BASE_RECONNECT_DELAY_MS = 3000ms
 *   Max delay:  MAX_RECONNECT_DELAY_MS = 30000ms
 *   Max retries: MAX_RETRIES = 10 (after which the hook gives up quietly)
 *   Formula: delay = min(base * 2^retryCount, maxDelay)
 *
 * @param {string}  plantId        — Plant ID to subscribe to (e.g. 'Demo_Plant_1')
 * @param {string}  floorId        — Floor plan ID to filter positions (e.g. '27')
 * @param {boolean} [enabled=true] — Set false to disable WebSocket (e.g. tab hidden)
 * @returns {{ positions: Object, alerts: Array, connected: boolean }}
 */
import { useState, useEffect, useRef, useCallback } from 'react';

const MAX_ALERTS = 20;
const BASE_RECONNECT_DELAY_MS = 3000;
const MAX_RECONNECT_DELAY_MS = 30000;
const MAX_RETRIES = 10;

export default function useUWB({ plantId, floorId, enabled = true }) {
  const [positions, setPositions] = useState({});
  const [alerts, setAlerts] = useState([]);
  const [connected, setConnected] = useState(false);

  const wsRef = useRef(null);
  const retryCountRef = useRef(0);
  const reconnectTimerRef = useRef(null);
  const intentionalCloseRef = useRef(false);

  const buildUrl = useCallback(() => {
    const { hostname, port } = window.location;
    const portSegment = port ? `:${port}` : '';
    return `ws://${hostname}${portSegment}/ws/uwb?plantId=${plantId}&floorId=${floorId}`;
  }, [plantId, floorId]);

  const dispatchPositionsEvent = useCallback((newPositionsMap) => {
    window.dispatchEvent(
      new CustomEvent('trier-uwb-positions', { detail: { positions: newPositionsMap } })
    );
  }, []);

  const handleMessage = useCallback((event) => {
    let msg;
    try {
      msg = JSON.parse(event.data);
    } catch {
      return;
    }

    const { type } = msg;

    if (type === 'uwb_position') {
      const { tagId, x, y, z, entityType, entityId, label, quality, ts, floorId: msgFloorId } = msg;
      setPositions((prev) => {
        const next = { ...prev, [tagId]: { x, y, z, entityType, entityId, label, quality, ts, floorId: msgFloorId } };
        dispatchPositionsEvent(next);
        return next;
      });
    } else if (type === 'uwb_positions_snapshot') {
      const snapshot = msg.positions || {};
      setPositions((prev) => {
        const next = { ...prev };
        for (const [tagId, data] of Object.entries(snapshot)) {
          next[tagId] = data;
        }
        dispatchPositionsEvent(next);
        return next;
      });
    } else if (type === 'uwb_alert') {
      const alert = { ...msg, alertType: msg.alertType || 'alert', receivedAt: Date.now() };
      setAlerts((prev) => [alert, ...prev].slice(0, MAX_ALERTS));
    } else if (type === 'uwb_lone_worker') {
      const alert = { ...msg, type: 'lone_worker', receivedAt: Date.now() };
      setAlerts((prev) => [alert, ...prev].slice(0, MAX_ALERTS));
    } else if (type === 'uwb_collision_warning') {
      const alert = { ...msg, type: 'collision', receivedAt: Date.now() };
      setAlerts((prev) => [alert, ...prev].slice(0, MAX_ALERTS));
    }
  }, [dispatchPositionsEvent]);

  const disconnect = useCallback(() => {
    intentionalCloseRef.current = true;
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setConnected(false);
  }, []);

  const connect = useCallback(() => {
    if (!enabled || !plantId) return;
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) return;

    intentionalCloseRef.current = false;

    let ws;
    try {
      ws = new WebSocket(buildUrl());
    } catch {
      return;
    }

    wsRef.current = ws;

    ws.onopen = () => {
      retryCountRef.current = 0;
      setConnected(true);
    };

    ws.onmessage = handleMessage;

    ws.onerror = () => {
      // errors are handled via onclose
    };

    ws.onclose = () => {
      wsRef.current = null;
      setConnected(false);

      if (intentionalCloseRef.current) return;
      if (retryCountRef.current >= MAX_RETRIES) return;

      const delay = Math.min(
        BASE_RECONNECT_DELAY_MS * Math.pow(2, retryCountRef.current),
        MAX_RECONNECT_DELAY_MS
      );
      retryCountRef.current += 1;

      reconnectTimerRef.current = setTimeout(() => {
        reconnectTimerRef.current = null;
        connect();
      }, delay);
    };
  }, [enabled, plantId, buildUrl, handleMessage]);

  useEffect(() => {
    if (!enabled || !plantId) return;

    retryCountRef.current = 0;
    connect();

    return () => {
      intentionalCloseRef.current = true;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      setConnected(false);
    };
  }, [enabled, plantId, floorId]); // eslint-disable-line react-hooks/exhaustive-deps

  const acknowledge = useCallback(async (alertId) => {
    try {
      await fetch(`/api/uwb/alerts/${alertId}/acknowledge`, { method: 'PUT' });
      setAlerts((prev) => prev.filter((a) => a.alertId !== alertId && a.id !== alertId));
    } catch {
      // graceful failure — alert remains in list
    }
  }, []);

  const checkin = useCallback(async () => {
    const tagId = localStorage.getItem('uwbTagId') || null;
    if (!tagId) return;
    try {
      await fetch('/api/uwb/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tagId }),
      });
    } catch {
      // graceful failure
    }
  }, []);

  return {
    positions,
    alerts,
    connected,
    connect,
    disconnect,
    acknowledge,
    checkin,
  };
}
