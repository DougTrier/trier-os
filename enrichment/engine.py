import requests
import json
import time
import random
import re
import sys
import pyodbc
from datetime import datetime

# CONFIGURATION
USE_PROXY = True  # Toggle for Phase 6
DB_CONFIG = "DRIVER={ODBC Driver 17 for SQL Server};SERVER=(localdb)\\MSSQLLocalDB;DATABASE=PartEnrichment;Trusted_Connection=yes;"

# Proxy Configuration
PROXY_URL = "http://spw25u1t8d:WRCu3us1ecwClt2_d0@gate.decodo.com:10001"
PROXIES = {
    "http": PROXY_URL,
    "https": PROXY_URL
} if USE_PROXY else None

# Rate Limiting
MIN_SECONDS_BETWEEN_REQUESTS = 3
DOMAIN_COOLDOWNS = {}

def get_db_connection():
    return pyodbc.connect(DB_CONFIG)

def controlled_get(url):
    domain = re.search(r"https?://([^/]+)", url).group(1) if re.search(r"https?://([^/]+)", url) else "unknown"
    now = time.time()
    if domain in DOMAIN_COOLDOWNS:
        elapsed = now - DOMAIN_COOLDOWNS[domain]
        if elapsed < MIN_SECONDS_BETWEEN_REQUESTS:
            time.sleep(MIN_SECONDS_BETWEEN_REQUESTS - elapsed + random.uniform(0.3, 0.9))
    try:
        # Use PROXIES only if USE_PROXY is True
        response = requests.get(url, proxies=PROXIES, timeout=15)
        DOMAIN_COOLDOWNS[domain] = time.time()
        return response
    except Exception as e:
        return None

def enrich_and_cache(part_number, manufacturer=None, current_data=None):
    """
    Enriches a part and identifies conflicts with current_data (dict with local 'manuf', 'category', etc.)
    """
    try:
        # Normalize part number for lookup (strip brackets, dashes, etc.)
        lookup_number = re.sub(r'[^a-zA-Z0-9]', '', part_number)
        
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # 1. Check Cache (using normalized number)
        cursor.execute("SELECT EnrichedData FROM PartEnrichmentCache WHERE PartNumber = ?", (lookup_number,))
        row = cursor.fetchone()
        if row:
            data = json.loads(row[0])
            data["from_cache"] = True
            return data

        # 2. Simulated Lookup Logic (Discovery Phase)
        # MISSION: Only flag REAL mismatches. Empty vs Value is not a conflict.
        
        # Pull category from catalog if we have a manufacturer
        network_category = None
        if manufacturer:
            cursor.execute("SELECT Category FROM DairyMasterCatalog WHERE TypicalManufacturer = ?", (manufacturer,))
            cat_row = cursor.fetchone()
            if cat_row:
                network_category = cat_row[0]

        enriched_data = {
            "part_number": part_number,
            "manufacturer": manufacturer,
            "status": "enriched",
            "attributes": {
                "Industry": "Dairy / Food Grade",
                "LastVerified": datetime.now().strftime("%Y-%m-%d")
            }
        }
        if network_category:
            enriched_data["attributes"]["Category"] = network_category
        
        needs_review = 0
        if current_data:
            local_manuf = (current_data.get('manufacturer') or '').strip()
            network_manuf = (manufacturer or '').strip()
            
            # Conflict only if BOTH exist and are DIFFERENT
            if local_manuf and network_manuf and local_manuf.lower() != network_manuf.lower():
                needs_review = 1
                enriched_data["conflict"] = f"Manufacturer mismatch: Local '{local_manuf}' vs Network '{network_manuf}'"

            # Check Category conflict
            local_cat = (current_data.get('category') or '').strip()
            if local_cat and network_category and local_cat.lower() != network_category.lower():
                # We only escalate to review if we have a high-confidence manufacturer match
                if not local_manuf or local_manuf.lower() == network_manuf.lower():
                    needs_review = 1
                    enriched_data["conflict"] = f"Category mismatch: Local '{local_cat}' vs Network '{network_category}'"

        # 3. Save to Cache
        cursor.execute("SELECT ManufID FROM Manufacturers WHERE Name = ?", (manufacturer,))
        manuf_row = cursor.fetchone()
        manuf_id = manuf_row[0] if manuf_row else None
        
        # Check if exists to avoid primary key violation
        cursor.execute("SELECT 1 FROM PartEnrichmentCache WHERE PartNumber = ?", (lookup_number,))
        if cursor.fetchone():
            cursor.execute("""
                UPDATE PartEnrichmentCache 
                SET ManufID = ?, EnrichedData = ?, LastUpdated = CURRENT_TIMESTAMP, NeedsReview = ?
                WHERE PartNumber = ?
            """, (manuf_id, json.dumps(enriched_data), needs_review, lookup_number))
        else:
            cursor.execute("""
                INSERT INTO PartEnrichmentCache (PartNumber, ManufID, EnrichedData, NeedsReview)
                VALUES (?, ?, ?, ?)
            """, (lookup_number, manuf_id, json.dumps(enriched_data), needs_review))
        
        conn.commit()
        conn.close()
        return enriched_data
    except Exception as e:
        return {"error": str(e)}

if __name__ == "__main__":
    if len(sys.argv) > 1:
        cmd = sys.argv[1]
        if cmd == "enrich":
            pn = sys.argv[2]
            manuf = sys.argv[3] if len(sys.argv) > 3 else None
            current_json = sys.argv[4] if len(sys.argv) > 4 else None
            current_data = json.loads(current_json) if current_json else None
            print(json.dumps(enrich_and_cache(pn, manuf, current_data)))
        elif cmd == "manuf_list":
            try:
                conn = get_db_connection()
                cursor = conn.cursor()
                cursor.execute("SELECT Name FROM Manufacturers WHERE IsActive = 1 ORDER BY Name")
                names = [row[0] for row in cursor.fetchall()]
                print(json.dumps(names))
                conn.close()
            except Exception as e:
                print(json.dumps([]))
