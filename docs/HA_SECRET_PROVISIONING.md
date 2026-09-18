# HA secret provisioning and rotation

The [published v3.7.2 release](https://github.com/DougTrier/trier-os/releases/tag/v3.7.2) removes the repository-shipped HA credential. These security changes were committed and verified before publication; do not assume an existing 3.7.1 download includes them.
Existing installations using that credential must rotate it; deleting the current
source file does not revoke copies in Git history or published portable archives.
The audited published v3.7.1 ZIP contains it. The v3.7.1 EXE/MSI file inventories
do not contain a `.sync_key` filename; that is not a blanket proof that the installers contain no other secrets. Local portable folders must still be checked.

Use a new random 32-byte secret represented as 64 hexadecimal characters and
provision the same secret on the paired corporate servers. Never copy the old
repository key. Do not put the new value in source, support reports or logs.

Provision either through the existing authenticated HA configuration screen
(generate on the primary, import securely on the secondary), or explicitly set
`HA_SYNC_KEY` in each server's protected environment. Environment configuration
takes precedence; when present, change it there and restart both peers rather
than using the screen to overwrite an inactive local key file.

The local `.sync_key` file in the resolved data directory (normally `data/.sync_key`) is installation configuration, excluded from Git
and distribution builds. Protect its filesystem permissions like .env and keep
it only in secure operational backups. Missing, unreadable, invalid or retired
keys deny peer authentication. No fallback key is generated during requests.

Sync-key authentication is limited to GET /api/ha/health,
GET /api/ha/consistency and POST /api/sync/replicate. Other HA administration uses
the existing authenticated administrator session. Verify peer health and normal
replication after coordinated rotation. Retain operational backups until both
peers are confirmed; do not restore the retired credential as a trust workaround.

Published artifacts and history have not been rewritten. Doug must separately
decide how to notify existing installations and handle prior downloadable ZIPs.

HA secret provisioning establishes peer authentication, not proof of ordered/exactly-once replication or safe paired-server recovery. Ordering/deduplication and rollback connection lifecycle remain deferred. See [validation limits](SECURITY_MAINTENANCE_VALIDATION.md).
