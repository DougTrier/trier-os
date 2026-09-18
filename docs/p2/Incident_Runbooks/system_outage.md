# Runbook: corporate Trier OS outage

Use the installation's approved incident/escalation plan. Preserve queues and data; avoid repeated restarts before recording the failure.

## Diagnose before restarting

1. Check the configured corporate URL and `GET /api/ping`. Normal HTTPS is port 1938; HTTP API defaults to 1937. Vite 5173 is a development UI, and portable HTTP may be configured as 3000. Check `ready`, not only whether a page loads.
2. Confirm the expected service/Node/Electron process, listener, disk space and access to the resolved data directory. Check startup logs for failed secrets, DB access, port conflicts or module errors.
3. Record the first error and distinguish server failure from client certificate, LAN, WAN or proxy failure. Do not kill an unrelated process merely because it uses a port.

## Controlled restart

Use the configured corporate service manager or the installed Trier OS shortcut. For a configured source service in PowerShell:

```powershell
$env:NODE_ENV = 'production'
$env:DISABLE_LIVE_STUDIO = 'true'
npm run start:cluster
```

For Linux source service startup, use `NODE_ENV=production DISABLE_LIVE_STUDIO=true npm run start:cluster` or the approved service manager. Existing protected secrets/configuration must already be provisioned. Do not use a nonexistent preview script or development mode to bypass production checks.

If a DB is missing/corrupt, stop and use the approved consistent backup/recovery plan. Do not create an empty replacement or delete `trier_auth.db` to regain access. [Deployment and rollback](../Deployment_and_Rollback.md).

## After recovery

Verify readiness, trusted HTTPS, authorized login and the affected operational workflow. Review pending/failed scan and integration items individually; HTTP 200 alone is not acceptance. Record outage/recovery times and root cause. Physical outage/restart and every hub replay path are not fully validated by the existing browser suite; use controlled reconciliation rather than assuming the queue is complete. [Validation limits](../../SECURITY_MAINTENANCE_VALIDATION.md).
