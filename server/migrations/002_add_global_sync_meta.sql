/**
 * 002_add_global_sync_meta.sql
 * Adds columns to support cross-site price tracking and network synchronization.
 */

-- Part Table: Track network pricing and origin
ALTER TABLE "Part" ADD COLUMN NetworkCheapestPrice REAL;
ALTER TABLE "Part" ADD COLUMN NetworkCheapestPlant TEXT;
ALTER TABLE "Part" ADD COLUMN NetworkLastSync DATETIME;
ALTER TABLE "Part" ADD COLUMN GlobalSyncStatus TEXT DEFAULT 'LOCAL_ONLY'; -- LOCAL_ONLY, NETWORK_MATCHED, OUTDATED
