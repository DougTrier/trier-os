const db = require('better-sqlite3')('data/Demo_Plant_1.db');
db.prepare("INSERT OR REPLACE INTO Procedures (ID, Descript, ProcedureCode, SOPAcknowledgmentRequired) VALUES ('PROC-TEST-1', 'Test Procedure', 'SOP-001', 0)").run();
db.prepare("INSERT OR REPLACE INTO Asset (ID, Description) VALUES ('AST-TEST-1', 'Test Asset')").run();
db.prepare("INSERT OR REPLACE INTO ProcObj (ProcID, ObjID) VALUES ('PROC-TEST-1', 'AST-TEST-1')").run();
