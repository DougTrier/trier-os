# Mobile App Strategy
**Status:** Decided NO-GO for Native Wrappers (Capacitor / React Native)
**Date:** April 24, 2026

## Rationale
Trier OS deliberately relies exclusively on its Progressive Web App (PWA) architecture for mobile deployments. After a full scoping session, the decision was made to **not** pursue a Native Mobile App (via Capacitor wrappers or React Native rebuilds) due to the specific constraints and requirements of an airgapped industrial environment.

### PWA vs. Native Tradeoffs for Trier OS
| Capability | PWA | Native App |
| :--- | :--- | :--- |
| **Works on any device** | **Yes** — runs instantly in browser. | Requires artifact install. |
| **QR/Camera Scanning** | **Yes** — fully supported via `getUserMedia` (Zebra DataWedge compatible). | Same hardware capabilities, more setup. |
| **Offline Operation** | **Yes** — Service Workers + LAN Hub sync fully support offline job flows. | Yes |
| **MDM Distribution** | **Yes** — Pushed to home screen as a Web Clip via MDM. Zero code signing needed. | Requires IPA/APK artifact management, enterprise certs, and Apple/Google dev accounts. |
| **Deployments & Updates** | **Instant**. Every device on the LAN updates immediately when the server updates. | Requires MDM administrators to push new binary builds to fleets. |
| **Push Notifications** | **Yes** — Web Push supported on iOS 16.4+ and all Android versions. | Marginally better for older iOS versions. |
| **App Store Dependency**| **None**. Crucial for airgapped networks. | Even with Enterprise certificates, requires maintaining a build pipeline (Xcode/Android Studio). |

## Conclusion
A native build pipeline introduces immense overhead (Xcode licenses, Android Studio, enterprise signing certs, version-locked builds, mandatory IT intervention for every feature push) with zero functional benefit for our specific use case. 

Since any industrial MDM fleet being provisioned today runs iOS 16.4+ or modern Android, the only historical gap (Push Notifications) is entirely closed. The PWA is strictly superior for Trier OS's deployment model.
