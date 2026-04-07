// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Trier OS. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS - Corporate Master Data Seeder
 * ==================================================
 * Seeds the corporate_master.db with initial PlantStats entries for all
 * registered plants. Run once during initial deployment to bootstrap the
 * Master Index before the first crawl cycle completes.
 */
const fs = require('fs');
const path = require('path');

const dataDir = require('./resolve_data_dir');
const leadershipFile = path.join(dataDir, 'corporate_leadership.json');

const corporateData = [
    { "ID": 101, "Name": "Jane Doe", "Title": "Senior Vice President Operations", "Email": "svp@trier-os.local", "Phone": "555-010-0001" },
    { "ID": 102, "Name": "John Smith", "Position": "Vice President Engineering", "Email": "vp@trier-os.local", "Phone": "555-010-0002" },
    { "ID": 103, "Name": "Alice Roe", "Position": "Corporate Engineer", "Email": "c_eng1@trier-os.local", "Phone": "555-010-0003" },
    { "ID": 104, "Name": "Bob Trent", "Position": "Project Engineer", "Email": "p_eng2@trier-os.local", "Phone": "555-010-0004" }
];

fs.writeFileSync(leadershipFile, JSON.stringify(corporateData, null, 2));
console.log(`Created ${leadershipFile}`);
