# Native Mobile App — Spec
> Trier OS P6 · iOS & Android shell via Capacitor

---

## Current State: PWA

Trier OS is already a Progressive Web App (PWA). The service worker (`public/sw.js`) caches the app shell and provides offline capability. The offline scan queue (`src/utils/OfflineDB.js`) buffers writes when disconnected and replays on reconnect.

On most plant Wi-Fi environments, the PWA provides a near-native experience. For pilot deployments, the PWA is the recommended delivery mechanism — no app store required.

---

## Why a Native Shell Adds Value

| Capability | PWA | Native Shell |
|---|---|---|
| Push notifications | Web Push (limited iOS support) | Full APNs / FCM |
| Barcode / QR scanning | WebRTC camera (works) | Native scanner SDK (faster, more reliable) |
| BLE beacon ranging | Web Bluetooth (limited) | Full BLE access |
| Enterprise MDM distribution | Not supported | Full MDM support (Jamf, Intune, etc.) |
| Background sync | Limited by browser | Full background task support |
| Biometric auth (FaceID/TouchID) | Web Authentication API | Native biometric SDK |

---

## Recommended Approach: Capacitor

[Capacitor](https://capacitorjs.com/) wraps the existing React app in a native WebView shell with no code changes required to the frontend.

### Setup

```bash
npm install @capacitor/core @capacitor/cli
npm install @capacitor/ios @capacitor/android
npx cap init "Trier OS" "com.trieros.app"
npx cap add ios
npx cap add android
```

### Build Flow

```
npm run build          # Vite build → dist/
npx cap copy           # Copies dist/ into iOS/Android projects
npx cap open ios       # Opens Xcode
npx cap open android   # Opens Android Studio
```

### Plugins to Add

| Plugin | Purpose |
|---|---|
| `@capacitor/push-notifications` | APNs / FCM push for WO assignments, overdue alerts |
| `@capacitor/barcode-scanner` | Native QR/barcode scan (faster than WebRTC) |
| `@capacitor/local-notifications` | On-device alarms (shift start, PM due) |
| `@capacitor/biometric-auth` | FaceID / TouchID login |
| `@capacitor/network` | Network status (supplements OfflineDB monitor) |
| `@capacitor/filesystem` | Export reports to device Downloads |

---

## MDM Distribution

For enterprise deployments:
- **iOS**: Distribute via Apple Business Manager (ABM) + Jamf Pro — no App Store listing required
- **Android**: Distribute via Android Enterprise / Google Play Managed — no public Play Store listing required

Both paths allow silent install, config push, and remote wipe.

---

## Code Change Scope

The Capacitor shell requires **zero changes** to the React app logic. Changes needed:
1. `capacitor.config.ts` — server URL, app ID
2. Push notification permission request in `src/main.jsx` (platform check)
3. Replace `<input type="file" capture>` QR scanner with Capacitor barcode scanner (optional enhancement)
4. Add `@capacitor/status-bar` + `@capacitor/splash-screen` for polish

---

## Build Prerequisites

- macOS required for iOS build (Xcode)
- Android Studio required for Android build
- Apple Developer Program ($99/yr) for iOS distribution
- Google Play Console or Android Enterprise for Android distribution
