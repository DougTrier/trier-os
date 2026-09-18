// Copyright © 2026 Doug Trier
// SPDX-License-Identifier: MIT
// Licensed under the MIT License. See LICENSE in the repository root.

/**
 * Portable initialization uses the same verified lifecycle as EXE/MSI. Data is
 * retained in a stable per-user store indexed by installation path. Code-only ZIP
 * overlays contain seed-data, so they cannot overwrite legacy data/ databases.
 * CLI entry point; no API routes. Stops on unfinished installations.
 */
const path = require('node:path');
const root = path.resolve(__dirname, '..');
process.env.DATA_DIR = require('./storage').resolveDeployment(root);
require('../server/index');
