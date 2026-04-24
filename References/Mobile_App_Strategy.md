# Trier OS Native Mobile App Strategy

## 1. Decision: Capacitor over React Native
The decision to use Capacitor instead of React Native for the Trier OS native mobile application is rooted in maintaining a single, unified codebase. Trier OS is already a production-grade Progressive Web App (PWA) with extensive offline caching, an optimized service worker, and a responsive interface tailored for industrial environments. 

**Rationale:**
- **One Codebase:** By wrapping the existing web application in a native WebView shell, we reuse 100% of the UI and business logic.
- **Speed to Market:** Configuration takes roughly one day, compared to the months required to rebuild every screen and form in React Native.
- **Service Worker Reuse:** The existing network-first and cache-first strategies developed for the PWA work identically inside the Capacitor WebView.

**Tradeoffs:**
- **Performance Ceiling:** The application is bound to the performance characteristics of the native WebView (WKWebView on iOS, Android System WebView on Android), which is slightly slower than native rendering.
- **WebView Dependency:** Bugs in OS-level WebView updates could potentially impact app stability.
- **No Brownfield Integration:** Integrating native OS SDKs that have heavy visual components (like augmented reality overlays) requires writing complex Capacitor plugins rather than direct native view integrations.

## 2. Native Plugin Inventory
To bridge the gap between the web and native hardware capabilities, the following Capacitor plugins will be utilized:

| Plugin Name | NPM Package | Platform | Purpose |
|-------------|-------------|----------|---------|
| Push Notifications | @capacitor/push-notifications | iOS, Android | Background alerts for WO assignments, LOTO expirations, and safety broadcasts. Uses FCM (Android) and APNs (iOS). |
| Camera | @capacitor/camera | iOS, Android | QR/Barcode scan acceleration and fast image capture with OCR snap-to-add for nameplates and schematics. |
| Biometric Auth | @capacitor-community/biometric-auth | iOS, Android | Face ID, Touch ID, or fingerprint scanning for fast, passwordless re-authentication on the shop floor. |
| DataWedge Bridge | capacitor-plugin-datawedge (or custom) | Android | Direct integration with Zebra hardware scanners via intent listeners to capture barcode scans reliably. |
| Splash Screen | @capacitor/splash-screen | iOS, Android | Provides a branded, seamless launch screen while the WebView and service worker initialize. |

## 3. App ID and Bundle Config
The application identity is standardized to ensure seamless MDM deployment and deep-linking integration:
- **App ID (Bundle Identifier):** com.trieros.app
- **Web Directory:** dist
- **Android Scheme:** https (Required to prevent mixed content and CORS issues inside the Android WebView).

## 4. MDM Distribution
Trier OS will not be submitted to the public Apple App Store or Google Play Store. It is strictly for enterprise distribution to enrolled corporate devices.

**iOS Deployment:**
- Deployed via Apple Business Manager (ABM) using Custom App Distribution.
- Requires an active Apple Developer Enterprise Program membership.
- The IPA is signed with an enterprise provisioning profile and pushed via the corporate MDM.

**Android Deployment:**
- Distributed via Android Enterprise Work Profile.
- The APK or AAB is signed with a secure release keystore.
- Distributed via the chosen corporate MDM platform (e.g., Microsoft Intune, SOTI MobiControl, VMware Workspace ONE).
- For Zebra rugged devices, initial enrollment and application staging can be accelerated using StageNow barcode scanning.

## 5. Build Pipeline
The build process compiles the React web application and synchronizes the assets into the native platform projects.

- **Step 1:** Run `npm run build` to generate the Vite production build in the `dist` directory.
- **Step 2:** Run `npx cap sync` to copy the `dist` assets to the native projects and synchronize plugin dependencies.
- **Step 3 (iOS):** Run `npx cap open ios` to launch Xcode. From Xcode, archive the build and export it using the enterprise provisioning profile. (Requires a macOS build runner).
- **Step 4 (Android):** Run `npx cap open android` to launch Android Studio and generate the signed APK/AAB. (Can run on Linux, Windows, or macOS runners).

## 6. Zebra DataWedge Integration
To fully support ruggedized warehouse and plant floor hardware, the application integrates with Zebra DataWedge.
- **DataWedge Profile Config:** 
  - Intent Action: com.trieros.ACTION
  - Intent Category: android.intent.category.DEFAULT
  - Intent Delivery: foreground
- **Web Layer Integration:** The web application listens for scan events via `window.addEventListener('DataWedge', ...)` or through a dedicated Capacitor plugin bridge, bypassing the need for a software keyboard wedge and ensuring reliable background scanning.

## 7. Service Worker Compatibility
Capacitor runs the existing `sw.js` seamlessly inside the native WebView. The cache-first app shell strategy ensures the application loads instantly even in offline or dead-zone scenarios within the plant, while network-first API calls seamlessly intercept data requests and queue them during offline operation.

## 8. Outstanding Prerequisites
Before the native build pipeline can be executed and tested, the following administrative and configuration steps must be completed:
1. **Install Packages:** Run `npm install @capacitor/core @capacitor/cli @capacitor/ios @capacitor/android` to pull down the core frameworks.
2. **Initialize Capacitor:** Run `npx cap init` to bootstrap the configuration (already defined in `capacitor.config.ts`).
3. **Add Platforms:** Run `npx cap add ios android` to generate the native platform directories (these will be gitignored).
4. **Apple Developer Enterprise:** Ensure the organization is enrolled in the Apple Developer Enterprise Program to generate the correct provisioning profiles.
5. **Android Keystore:** Generate the Android release keystore to sign the production APKs.
