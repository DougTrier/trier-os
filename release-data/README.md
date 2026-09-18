# Distribution seed inputs

These gzip archives are intentional demonstration/reference inputs, not live installation databases. `manifest.json` records SHA-256 and byte size for compressed and expanded files. Builds verify both forms and materialize them only into a new staging directory outside the source tree.

The demonstration databases derive from the previously tracked repository seeds. Distribution-only preparation removed credential/configuration tables, test grants and the known stale dummy artifact; operational demonstration rows remain. Historical migrations and trigger definitions were not rewritten. Existing production databases are never passed through this preparation.

The required manufacturing catalog is included byte-for-byte as a reference archive, with no sanitization, reseeding or catalog-row changes. Its previously ignored local-only status prevented a clean checkout from reproducing the intended distribution.

Live `data/*.db` files are no longer tracked or read by release builds. Keep the retained data directory and backups outside Git. Changing these archives requires explicit seed/reference review, new checksums and isolated package validation; they must never be extracted over initialized customer storage.
