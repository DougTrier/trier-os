<!-- Copyright © 2026 Trier OS. All Rights Reserved. -->
# Trier OS: Operator Quick-Start & Troubleshooting Guide

## Basic Usage
- **Scanning:** Tap your mobile device to an equipment NFC tag or scan the QR code. The Work Order contextual menu will open instantly.
- **Zero-Keystroke:** The interface requires zero typing. Use the pre-populated symptom checkboxes and single-tap submission.
- **Offline Mode:** If the connection drops, the UI will turn orange. Keep working. Your scans are saved locally to the LAN Hub and will automatically sync when connection is restored.

## Troubleshooting
- **Cannot Write/Control Equipment:** Check if the system is in "Advisory-Only" mode. This means the Gatekeeper has deliberately disabled write access (usually a deliberate administrative action, such as pending safety recertification, and is not a side effect of network or ERP outages).
- **Scanner Not Responding:** Ensure your device is on the "Plant_OT_Secure" Wi-Fi network.
- **Missing Parts in BOM:** If a child component is missing, tap the "Digital Twin" pin on the schematic to auto-populate its exact sub-assembly.
