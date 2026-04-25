const db = require('better-sqlite3')('data/Demo_Plant_1.db');
// Reset ALL procedures so no stale re-ack flags from prior runs interfere
db.prepare("UPDATE Procedures SET SOPAcknowledgmentRequired = 0").run();
// Delete any existing ghost_admin SOP acknowledgments so the pending query starts clean
db.prepare("DELETE FROM SOPAcknowledgments WHERE TechID = 'ghost_admin'").run();
db.prepare("INSERT OR REPLACE INTO Procedures (ID, Descript, ProcedureCode, SOPAcknowledgmentRequired) VALUES ('PROC-TEST-1', 'Test Procedure', 'SOP-001', 0)").run();
db.prepare("INSERT OR REPLACE INTO Asset (ID, Description) VALUES ('AST-TEST-1', 'Test Asset')").run();
db.prepare("INSERT OR REPLACE INTO ProcObj (ProcID, ObjID) VALUES ('PROC-TEST-1', 'AST-TEST-1')").run();
// Explicitly close so the WAL checkpoint completes before the server's next access
db.close();
