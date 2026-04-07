-- Record Locking: Prevents two users from editing the same record simultaneously
-- Locks auto-expire after 15 minutes (checked by application logic)
CREATE TABLE IF NOT EXISTS record_locks (
    record_type TEXT NOT NULL,        -- 'work_order', 'asset', etc.
    record_id   TEXT NOT NULL,        -- The ID of the locked record
    locked_by   TEXT NOT NULL,        -- Username of the person holding the lock
    locked_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at  DATETIME NOT NULL,    -- Auto-release after this time
    PRIMARY KEY (record_type, record_id)
);
