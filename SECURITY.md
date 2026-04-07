# Security Policy

## Supported Versions
Security updates are strictly provided for the latest major version of Trier OS.

| Version | Supported          |
| ------- | ------------------ |
| 3.3.0+  | :white_check_mark: |
| < 3.3.0 | :x:                |

## Reporting a Vulnerability

**DO NOT OPEN A PUBLIC ISSUE FOR A SECURITY VULNERABILITY.**

Trier OS is an enterprise-grade Industrial Operating System governing physical manufacturing assets. Public disclosure of a zero-day exploit places real-world industrial infrastructure at immediate risk of failure or attack.

If you discover a vulnerability, please adhere strictly to the following protocol:

1. **Open a Private Advisory:** Go to [https://github.com/DougTrier/trier-os/security/advisories/new](https://github.com/DougTrier/trier-os/security/advisories/new) and submit a private security advisory. Only you and the reporter can see it.
2. **Details Required:** Please provide explicitly detailed steps to reproduce the exploit within the Trier OS Sandbox (`npm run dev:full`), the specific file path of the vulnerability, and (if applicable) a suggested architectural mitigation.
3. **Response SLA:** The Core Engineering Team will acknowledge receipt of your vulnerability report within 48 hours and outline an expected timeline for deploying a patch.

We take the security of manufacturing networks seriously and appreciate your responsible disclosure to keep the industrial sector safe.
