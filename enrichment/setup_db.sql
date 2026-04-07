IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = 'PartEnrichment')
BEGIN
    CREATE DATABASE PartEnrichment;
END
GO

USE PartEnrichment;
GO

-- Manufacturers Table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Manufacturers')
CREATE TABLE Manufacturers (
    ManufID INT PRIMARY KEY IDENTITY(1,1),
    Name NVARCHAR(255) NOT NULL,
    Website NVARCHAR(500),
    LookupPattern NVARCHAR(500),
    ModelPattern NVARCHAR(500),
    IsActive BIT DEFAULT 1
);

-- Manufacturer Sources Table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ManufacturerSources')
CREATE TABLE ManufacturerSources (
    SourceID INT PRIMARY KEY IDENTITY(1,1),
    ManufID INT REFERENCES Manufacturers(ManufID),
    SourceType NVARCHAR(50), -- 'API', 'HTML', 'PDF'
    SourceURL NVARCHAR(500),
    ExtractionRules NVARCHAR(MAX) -- JSON
);

-- Part Enrichment Cache Table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'PartEnrichmentCache')
CREATE TABLE PartEnrichmentCache (
    CacheID INT PRIMARY KEY IDENTITY(1,1),
    PartNumber NVARCHAR(255) NOT NULL,
    ManufID INT REFERENCES Manufacturers(ManufID),
    EnrichedData NVARCHAR(MAX), -- JSON string of attributes
    LastUpdated DATETIME DEFAULT GETDATE(),
    ConfidenceScore FLOAT
);

-- Part Attributes Table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'PartAttributes')
CREATE TABLE PartAttributes (
    AttrID INT PRIMARY KEY IDENTITY(1,1),
    PartNumber NVARCHAR(255),
    AttrName NVARCHAR(100),
    AttrValue NVARCHAR(MAX),
    Unit NVARCHAR(50)
);

-- Part Cross References Table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'PartCrossReferences')
CREATE TABLE PartCrossReferences (
    XRefID INT PRIMARY KEY IDENTITY(1,1),
    OriginalPartNumber NVARCHAR(255),
    EquivalentPartNumber NVARCHAR(255),
    ManufacturerID INT REFERENCES Manufacturers(ManufID),
    CrossType NVARCHAR(50) -- 'Exact', 'Compatible', 'Upgrade'
);

-- MFG Master Catalog Table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'MFGMasterCatalog')
CREATE TABLE MFGMasterCatalog (
    CatalogID INT PRIMARY KEY IDENTITY(1,1),
    Category NVARCHAR(255),
    SubCategory NVARCHAR(255),
    TypicalManufacturer NVARCHAR(255),
    CommonPartNumbers NVARCHAR(MAX)
);
GO
