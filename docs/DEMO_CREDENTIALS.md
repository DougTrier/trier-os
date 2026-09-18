# Trier OS demo and first-login accounts

## Creator first login

A fresh `trier_auth.db` creates `creator` with a random password and writes `first_login.txt` into the resolved data directory (normally `data/` in source installs). Existing creator credentials are not regenerated on each boot. Protect the file, change the password at first login and securely remove the file afterward. Creator is a privileged cross-plant identity; its credentials are private.

If the password is lost, use an existing authorized administrator/account recovery process and secured backups. **Do not delete `trier_auth.db` as a password reset:** that destroys identities, role assignments and token-version state. Restore/recovery must be planned with the installation administrator and Doug Trier.

## Intentionally public demo accounts

| Username | Public password | Seeded role |
|---|---|---|
| `demo_tech` | `TrierDemo2026!` | technician |
| `demo_operator` | `TrierDemo2026!` | operator |
| `demo_maint_mgr` | `TrierDemo2026!` | maintenance_manager |
| `demo_plant_mgr` | `TrierDemo2026!` | plant_manager |

These are deliberately low-trust identities. Server authorization confines them to `examples`, rejects foreign/all-sites selectors in header/query/body and checks actual shared floorplan/nested-object ownership. Some demo actions write demonstration state; `examples` is not universally read-only. Do not put real plant information in it. UI restrictions are not the security boundary.

Public demos are seeded outside the `NODE_ENV` production conditional. Production mode does not remove them; deletion can be followed by recreation at subsequent startup. Installation administrators must review public identity handling and verify it after restart, rather than assuming `NODE_ENV=production` is an account-removal policy.

## Ghost / automated test accounts

`ghost_tech`, `ghost_admin` and `ghost_exec` are development/test fixtures, not public demonstration identities. Their seeding is conditional on non-production mode. Switching an existing auth database to production does not delete previously created ghost accounts. Review and remove/disable them before production. Disposable Playwright credential configuration is separate; no private test or creator password belongs in public documentation.

Explore Mission Control, assets, work orders, parts, safety and SOPs using the role-appropriate tiles. Staff corporate analytics is intentionally broader than public demo access. Live Studio is an optional development tool; disable it in production. See [demo data](DEMO_DATA.md), [security policy](../SECURITY.md) and [demo script](DEMO_SCRIPT.md).
