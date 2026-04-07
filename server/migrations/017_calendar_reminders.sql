-- Calendar Reminders - Sticky note style reminders for maintenance techs
CREATE TABLE IF NOT EXISTS calendar_reminders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reminder_date TEXT NOT NULL,
    note TEXT NOT NULL,
    created_by TEXT DEFAULT 'system',
    created_at TEXT DEFAULT (datetime('now')),
    completed INTEGER DEFAULT 0
);
