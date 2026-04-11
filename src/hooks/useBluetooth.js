// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — Web Bluetooth Hook
 * ==============================
 * Wraps the Web Bluetooth API for BLE beacon proximity detection,
 * device pairing, and GATT sensor characteristic reads/notifications.
 *
 * Platform support:
 *   - Chrome / Edge on Android, Windows, macOS, ChromeOS
 *   - NOT supported: iOS Safari (WebKit has not implemented Web Bluetooth)
 *   - NOT supported: Firefox
 *   - Requires HTTPS (or localhost)
 *   - All user-gesture requirements satisfied by scan/connect buttons
 *
 * Trier OS BLE UUIDs:
 *   Asset beacon service  6e4c0001-b5a3-f393-e0a9-e50e24dcca9e
 *   Asset ID char         6e4c0002-b5a3-f393-e0a9-e50e24dcca9e  (read — ASCII string)
 *   Sensor service        6e4c0010-b5a3-f393-e0a9-e50e24dcca9e
 *   Temperature char      6e4c0011-b5a3-f393-e0a9-e50e24dcca9e  (notify — float32 °C)
 *   Vibration char        6e4c0012-b5a3-f393-e0a9-e50e24dcca9e  (notify — float32 mm/s RMS)
 *   Pressure char         6e4c0013-b5a3-f393-e0a9-e50e24dcca9e  (notify — float32 bar)
 */
import { useRef, useState, useCallback, useEffect } from 'react';
import { bleTrilaterate } from '../utils/bleTrilaterate';

export const TRIER_ASSET_SERVICE  = '6e4c0001-b5a3-f393-e0a9-e50e24dcca9e';
export const TRIER_ASSET_ID_CHAR  = '6e4c0002-b5a3-f393-e0a9-e50e24dcca9e';
export const TRIER_SENSOR_SERVICE = '6e4c0010-b5a3-f393-e0a9-e50e24dcca9e';
export const TRIER_TEMP_CHAR      = '6e4c0011-b5a3-f393-e0a9-e50e24dcca9e';
export const TRIER_VIBRATION_CHAR = '6e4c0012-b5a3-f393-e0a9-e50e24dcca9e';
export const TRIER_PRESSURE_CHAR  = '6e4c0013-b5a3-f393-e0a9-e50e24dcca9e';

const BLE_SUPPORTED  = typeof navigator !== 'undefined' && 'bluetooth' in navigator;
const SCAN_SUPPORTED = BLE_SUPPORTED && typeof navigator.bluetooth?.requestLEScan === 'function';

// RSSI → distance (metres) using log-distance path loss model
// d = 10 ^ ((TxPower − RSSI) / (10 × n))  n=2 (free space)
function rssiToMetres(rssi, txPower = -59) {
    if (rssi === 0) return -1;
    const ratio = rssi / txPower;
    if (ratio < 1.0) return Math.pow(ratio, 10);
    return 0.89976 * Math.pow(ratio, 7.7095) + 0.111;
}

/**
 * useBluetooth — BLE device discovery, pairing, GATT reads, and trilateration.
 *
 * @param {function} onBeaconDetected  Called with assetId when a known beacon is arm's-length close.
 * @returns {object} { isSupported, isScanSupported, isScanning, connectedDevice, nearbyDevices,
 *                     sensorReadings, error, scanForDevices, stopScan, connectToDevice,
 *                     disconnect, readCharacteristic, startSensorNotifications }
 */
export default function useBluetooth(onBeaconDetected) {
    const [isScanning,      setIsScanning]      = useState(false);
    const [connectedDevice, setConnectedDevice] = useState(null); // { device, server, assetId, name }
    const [nearbyDevices,   setNearbyDevices]   = useState([]);   // [{ id, name, rssi, distanceM }]
    const [sensorReadings,  setSensorReadings]  = useState({});   // { temperature, vibration, pressure }
    const [error,           setError]           = useState(null);

    const leScanRef       = useRef(null);  // AbortController for requestLEScan
    const notifyCleanups  = useRef([]);    // cleanup fns from startSensorNotifications
    const deviceMapRef    = useRef({});    // mac → { name, rssi, lastSeen }
    const beaconMacsRef   = useRef({});    // mac → assetId  (cached from server)
    const anchorsRef      = useRef([]);    // [{ mac, x, y }] from /api/ble/anchors

    // Load known beacon MACs from backend once on mount (for proximity auto-populate)
    useEffect(() => {
        const plantId = localStorage.getItem('selectedPlantId') || 'Demo_Plant_1';
        fetch(`/api/ble/beacons?plantId=${plantId}`)
            .then(r => r.ok ? r.json() : [])
            .then(beacons => {
                const map = {};
                (beacons || []).forEach(b => { if (b.Mac) map[b.Mac.toLowerCase()] = b.AssetID; });
                beaconMacsRef.current = map;
            })
            .catch(() => {});

        fetch(`/api/ble/anchors?plantId=${plantId}`)
            .then(r => r.ok ? r.json() : [])
            .then(data => { anchorsRef.current = Array.isArray(data) ? data : []; })
            .catch(() => {});
    }, []);

    // ── Scan for nearby BLE devices ────────────────────────────────────────────
    /**
     * scanForDevices — Start BLE scanning.
     * Uses requestLEScan (experimental, Chrome flag) when available for passive
     * background scanning with RSSI. Falls back to requestDevice (standard, one
     * device at a time via browser chooser dialog) on platforms without it.
     */
    const scanForDevices = useCallback(async () => {
        if (!BLE_SUPPORTED) {
            setError('Web Bluetooth is not available. Use Chrome on Android, Windows, or macOS.');
            return;
        }
        setError(null);
        setIsScanning(true);
        deviceMapRef.current = {};

        if (SCAN_SUPPORTED) {
            // ── Experimental: passive background scan ──
            leScanRef.current = new AbortController();
            try {
                const scan = await navigator.bluetooth.requestLEScan({
                    filters: [{ services: [TRIER_ASSET_SERVICE] }],
                    keepRepeatedDevices: true,
                });
                leScanRef.current._scan = scan;

                navigator.bluetooth.addEventListener('advertisementreceived', (event) => {
                    const mac = event.device.id;
                    const rssi = event.rssi;
                    const dist = rssiToMetres(rssi);
                    deviceMapRef.current[mac] = { id: mac, name: event.device.name || 'Unknown', rssi, distanceM: dist, lastSeen: Date.now() };
                    setNearbyDevices(Object.values(deviceMapRef.current).sort((a, b) => b.rssi - a.rssi));

                    // Proximity auto-populate: fire callback when within arm's reach (< 0.5m)
                    const assetId = beaconMacsRef.current[mac.toLowerCase()];
                    if (assetId && dist >= 0 && dist < 0.5 && onBeaconDetected) {
                        onBeaconDetected(assetId);
                    }

                    // Trilateration: if we have 3+ anchors with recent RSSI readings
                    const anchors = anchorsRef.current;
                    if (anchors.length >= 3) {
                        const readings = anchors
                            .map(a => ({ ...a, rssi: deviceMapRef.current[a.mac.toLowerCase()]?.rssi }))
                            .filter(a => a.rssi !== undefined);
                        if (readings.length >= 3) {
                            const pos = bleTrilaterate(readings);
                            if (pos) {
                                window.dispatchEvent(new CustomEvent('trier-ble-position', { detail: pos }));
                            }
                        }
                    }
                });

                // Prune stale devices every 5s
                const pruneTimer = setInterval(() => {
                    const now = Date.now();
                    Object.keys(deviceMapRef.current).forEach(k => {
                        if (now - deviceMapRef.current[k].lastSeen > 10000) delete deviceMapRef.current[k];
                    });
                    setNearbyDevices(Object.values(deviceMapRef.current).sort((a, b) => b.rssi - a.rssi));
                }, 5000);

                leScanRef.current._pruneTimer = pruneTimer;

            } catch (err) {
                setIsScanning(false);
                if (err.name === 'NotAllowedError') setError('Bluetooth permission denied. Check browser settings.');
                else if (err.name === 'NotSupportedError') setError('Enable the chrome://flags/#enable-experimental-web-platform-features flag to use passive BLE scanning.');
                else setError('BLE scan failed: ' + err.message);
            }
        } else {
            // ── Standard: user-initiated device chooser ──
            // requestDevice pops a browser dialog to choose one device.
            try {
                const device = await navigator.bluetooth.requestDevice({
                    filters: [{ services: [TRIER_ASSET_SERVICE] }],
                    optionalServices: [TRIER_SENSOR_SERVICE],
                });
                setIsScanning(false);
                // Auto-connect after selection
                await connectToDevice(device);
            } catch (err) {
                setIsScanning(false);
                if (err.name !== 'NotFoundError') { // NotFoundError = user cancelled chooser
                    if (err.name === 'NotAllowedError') setError('Bluetooth permission denied.');
                    else setError('Could not scan for devices: ' + err.message);
                }
            }
        }
    }, [onBeaconDetected]); // eslint-disable-line react-hooks/exhaustive-deps

    const stopScan = useCallback(() => {
        if (leScanRef.current) {
            try { leScanRef.current._scan?.stop(); } catch { /* ignore */ }
            clearInterval(leScanRef.current._pruneTimer);
            leScanRef.current = null;
        }
        setIsScanning(false);
        setNearbyDevices([]);
        deviceMapRef.current = {};
        window.dispatchEvent(new CustomEvent('trier-ble-position', { detail: null }));
    }, []);

    // ── Connect to a specific device ──────────────────────────────────────────
    const connectToDevice = useCallback(async (device) => {
        setError(null);
        try {
            const server = await device.gatt.connect();

            // Try to read the Trier OS asset ID characteristic
            let assetId = null;
            try {
                const service = await server.getPrimaryService(TRIER_ASSET_SERVICE);
                const char    = await service.getCharacteristic(TRIER_ASSET_ID_CHAR);
                const value   = await char.readValue();
                assetId = new TextDecoder().decode(value).trim();
            } catch { /* beacon doesn't implement Trier UUID — that's OK */ }

            const connected = { device, server, assetId, name: device.name || 'BLE Device' };
            setConnectedDevice(connected);

            // Handle unexpected disconnection
            device.addEventListener('gattserverdisconnected', () => {
                setConnectedDevice(null);
                notifyCleanups.current.forEach(fn => { try { fn(); } catch { /**/ } });
                notifyCleanups.current = [];
                setSensorReadings({});
            });

            return connected;
        } catch (err) {
            setError('Connection failed: ' + err.message);
            return null;
        }
    }, []);

    const disconnect = useCallback(() => {
        if (connectedDevice?.device?.gatt?.connected) {
            connectedDevice.device.gatt.disconnect();
        }
        notifyCleanups.current.forEach(fn => { try { fn(); } catch { /**/ } });
        notifyCleanups.current = [];
        setConnectedDevice(null);
        setSensorReadings({});
    }, [connectedDevice]);

    // ── GATT read ──────────────────────────────────────────────────────────────
    /**
     * readCharacteristic — One-shot GATT read.
     * Returns a DataView. Caller parses the bytes per the Trier OS sensor protocol.
     */
    const readCharacteristic = useCallback(async (serviceUuid, charUuid) => {
        if (!connectedDevice?.server) {
            throw new Error('No connected device');
        }
        const service = await connectedDevice.server.getPrimaryService(serviceUuid);
        const char    = await service.getCharacteristic(charUuid);
        return await char.readValue();
    }, [connectedDevice]);

    // ── GATT notifications ────────────────────────────────────────────────────
    /**
     * startSensorNotifications — Subscribe to a GATT notify characteristic.
     * Each value change calls `callback(DataView)`. Returns a cleanup function.
     */
    const startSensorNotifications = useCallback(async (serviceUuid, charUuid, callback) => {
        if (!connectedDevice?.server) throw new Error('No connected device');

        const service = await connectedDevice.server.getPrimaryService(serviceUuid);
        const char    = await service.getCharacteristic(charUuid);
        await char.startNotifications();

        const handler = (event) => callback(event.target.value);
        char.addEventListener('characteristicvaluechanged', handler);

        const cleanup = () => {
            char.removeEventListener('characteristicvaluechanged', handler);
            char.stopNotifications().catch(() => {});
        };
        notifyCleanups.current.push(cleanup);
        return cleanup;
    }, [connectedDevice]);

    /**
     * startAllSensorNotifications — Convenience: subscribe to all three Trier
     * sensor characteristics and keep sensorReadings state up to date.
     */
    const startAllSensorNotifications = useCallback(async () => {
        if (!connectedDevice?.server) return;

        const parseFloat32 = (dv) => dv.getFloat32(0, true); // little-endian

        const pairs = [
            { uuid: TRIER_TEMP_CHAR,      key: 'temperature', unit: '°C' },
            { uuid: TRIER_VIBRATION_CHAR, key: 'vibration',   unit: 'mm/s' },
            { uuid: TRIER_PRESSURE_CHAR,  key: 'pressure',    unit: 'bar' },
        ];

        for (const { uuid, key, unit } of pairs) {
            try {
                await startSensorNotifications(TRIER_SENSOR_SERVICE, uuid, (dv) => {
                    const value = parseFloat32(dv);
                    setSensorReadings(prev => ({ ...prev, [key]: { value: value.toFixed(2), unit, ts: new Date().toLocaleTimeString() } }));
                });
            } catch { /* sensor characteristic not exposed on this device */ }
        }
    }, [connectedDevice, startSensorNotifications]);

    // Auto-start sensor notifications when device connects
    useEffect(() => {
        if (connectedDevice?.server) {
            startAllSensorNotifications();
        }
    }, [connectedDevice]); // eslint-disable-line react-hooks/exhaustive-deps

    return {
        isSupported: BLE_SUPPORTED,
        isScanSupported: SCAN_SUPPORTED,
        isScanning,
        connectedDevice,
        nearbyDevices,
        sensorReadings,
        error,
        scanForDevices,
        stopScan,
        connectToDevice,
        disconnect,
        readCharacteristic,
        startSensorNotifications,
        startAllSensorNotifications,
    };
}
