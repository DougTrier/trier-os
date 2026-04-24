<!-- Copyright © 2026 Trier OS. All Rights Reserved. -->
# Runbook: Authentication (AD/LDAP) Failure

## Symptoms
- New users cannot log in.
- Existing users receive 401/403 errors when attempting safety-critical writes.
- AD sync logs show timeouts.

## Immediate Actions
1. **Verify Active Directory:** IT to confirm domain controllers are reachable from the Trier OS subnet.
2. **Check `auth_db.sqlite`:** Verify local cache integrity if AD is unreachable.

## Recovery
- Ensure existing valid JWTs continue to authorize non-critical operations.
- For safety-critical writes, the Gatekeeper requires live AD validation. 
- **[PLANNED]** If AD is permanently down, initiate the Emergency Override protocol (to be designed and implemented) to authorize the write.
- Once AD is restored, force-sync the LDAP groups (`server/routes/ldap.js`).
