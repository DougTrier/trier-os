USE PartEnrichment;
GO

INSERT INTO Manufacturers (Name, Website, LookupPattern, ModelPattern)
VALUES 
('Grundfos', 'https://www.grundfos.com', 'https://product-selection.grundfos.com/search?q={partNumber}', '^[0-9]{8}$'),
('Alfa Laval', 'https://www.alfalaval.com', 'https://www.alfalaval.com/search-results/?query={partNumber}', '^[0-9]{10}$'),
('SPX Flow', 'https://www.spxflow.com', 'https://www.spxflow.com/search?q={partNumber}', '^WCB-[A-Z0-9]+$'),
('Tetra Pak', 'https://www.tetrapak.com', 'https://www.tetrapak.com/search?q={partNumber}', '^TP-[0-9]{6,10}$'),
('Allen-Bradley', 'https://www.rockwellautomation.com', 'https://www.rockwellautomation.com/en-us/products/details.{partNumber}.html', '^[0-9]{4}-[A-Z0-9]+$'),
('Endress+Hauser', 'https://www.endress.com', 'https://www.endress.com/en/product-search?q={partNumber}', '^[A-Z0-9-]{10,20}$'),
('Festo', 'https://www.festo.com', 'https://www.festo.com/us/en/search/?text={partNumber}', '^[0-9]{6,8}$'),
('Krones', 'https://www.krones.com', 'https://www.krones.com/en/search.php?q={partNumber}', '^0-[0-9]{3,}-[0-9]{3,}$');
GO

INSERT INTO MFGMasterCatalog (Category, SubCategory, TypicalManufacturer)
VALUES
('Pumps', 'Centrifugal', 'Grundfos'),
('Pumps', 'Positive Displacement', 'Alfa Laval'),
('Valves', 'Air Operated', 'SPX Flow'),
('Homogenizers', 'MFG High Pressure', 'Tetra Pak'),
('Automation', 'PLC Module', 'Allen-Bradley'),
('Sensors', 'Flow Meter', 'Endress+Hauser'),
('Pneumatics', 'Actuator', 'Festo'),
('Blow Mold', 'Bottle Mold', 'Krones');
GO
