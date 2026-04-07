// Copyright © 2026 Trier OS. All Rights Reserved.

function getSeedData(modelName) {
    if (modelName === 'Bakery / Confectionery') {
        const units = [
            { name: 'Flour Silo 1', type: 'Storage', desc: 'Bulk flour storage. 50,000 lbs capacity.', capacity: 50000, cunit: 'lbs', sqft: 400, crit: 'A', sort: 1 },
            { name: 'Flour Silo 2', type: 'Storage', desc: 'Bulk flour storage. 50,000 lbs capacity.', capacity: 50000, cunit: 'lbs', sqft: 400, crit: 'A', sort: 2 },
            { name: 'Sugar Silo', type: 'Storage', desc: 'Bulk sugar storage. 25,000 lbs capacity.', capacity: 25000, cunit: 'lbs', sqft: 300, crit: 'B', sort: 3 },
            { name: 'Mixer 1 - Dough', type: 'Processing', desc: 'Industrial dough mixer. 1,000 lbs batch.', capacity: 1000, cunit: 'lbs/batch', sqft: 500, crit: 'A', sort: 4 },
            { name: 'Mixer 2 - Batter', type: 'Processing', desc: 'Industrial batter mixer.', capacity: 800, cunit: 'lbs/batch', sqft: 500, crit: 'A', sort: 5 },
            { name: 'Oven Line 1', type: 'Processing', desc: 'Continuous tunnel oven. 100ft long.', capacity: 5000, cunit: 'lbs/hr', sqft: 3000, crit: 'A', sort: 6 },
            { name: 'Oven Line 2', type: 'Processing', desc: 'Rack oven bank.', capacity: 2000, cunit: 'lbs/hr', sqft: 1500, crit: 'B', sort: 7 },
            { name: 'Cooling Spiral', type: 'Processing', desc: 'Ambient cooling spiral conveyor.', capacity: 5000, cunit: 'lbs/hr', sqft: 2000, crit: 'A', sort: 8 },
            { name: 'Packaging Line 1 - Loaves', type: 'Packaging', desc: 'Sliced bread bagging and tagging.', capacity: 70, cunit: 'loaves/min', sqft: 1200, crit: 'A', sort: 9 },
            { name: 'Packaging Line 2 - Buns', type: 'Packaging', desc: 'Clamshell and bag filler for buns/rolls.', capacity: 120, cunit: 'packs/min', sqft: 1200, crit: 'A', sort: 10 },
            { name: 'Finished Goods Warehouse', type: 'Storage', desc: 'Ambient bakery staging area.', capacity: 50000, cunit: 'cases', sqft: 8000, crit: 'B', sort: 11 }
        ];

        let totalProducts = 0;
        const products = [
            { sku: 'WHTBRD-20OZ', name: 'Classic White Bread - 20oz', family: 'Bread', label: 'Trier Bakery', sz: '20OZ', oz: 20, fat: 2, seq: 1, co: 'none', qty: 5000, hqty: 6000, uom: 'loaves' },
            { sku: 'WHTBRD-24OZ', name: 'Classic White Bread - 24oz', family: 'Bread', label: 'Trier Bakery', sz: '24OZ', oz: 24, fat: 2, seq: 2, co: 'none', qty: 3000, hqty: 3500, uom: 'loaves' },
            { sku: 'WHTBRD-16OZ', name: 'Classic White Bread - 16oz', family: 'Bread', label: 'Value Line', sz: '16OZ', oz: 16, fat: 1.5, seq: 3, co: 'none', qty: 2000, hqty: 2500, uom: 'loaves' },
            { sku: 'WHTBRD-20OZ-PL', name: 'Classic White Bread - 20oz', family: 'Bread', label: 'Private Label', sz: '20OZ', oz: 20, fat: 2, seq: 4, co: 'none', qty: 4000, hqty: 4500, uom: 'loaves' },
            { sku: 'WHTBRD-24OZ-PL', name: 'Classic White Bread - 24oz', family: 'Bread', label: 'Private Label', sz: '24OZ', oz: 24, fat: 2, seq: 5, co: 'none', qty: 2500, hqty: 3000, uom: 'loaves' },
            { sku: 'WHWHT-20OZ', name: '100% Whole Wheat Bread', family: 'Bread', label: 'Trier Bakery', sz: '20OZ', oz: 20, fat: 3, seq: 6, co: 'sweep', qty: 4000, hqty: 4500, uom: 'loaves' },
            { sku: 'WHWHT-20OZ-PL', name: '100% Whole Wheat Bread', family: 'Bread', label: 'Private Label', sz: '20OZ', oz: 20, fat: 3, seq: 7, co: 'none', qty: 3000, hqty: 3500, uom: 'loaves' },
            { sku: 'HNYWHT-20OZ', name: 'Honey Wheat Bread', family: 'Bread', label: 'Trier Bakery', sz: '20OZ', oz: 20, fat: 2.5, seq: 8, co: 'none', qty: 2500, hqty: 3000, uom: 'loaves' },
            { sku: 'MLTGRN-24OZ', name: 'Multigrain Artisan Bread', family: 'Bread', label: 'Trier Bakery', sz: '24OZ', oz: 24, fat: 4, seq: 9, co: 'sweep', qty: 1500, hqty: 2000, uom: 'loaves' },
            { sku: 'SDRGH-24OZ', name: 'San Francisco Sourdough', family: 'Bread', label: 'Trier Bakery', sz: '24OZ', oz: 24, fat: 1, seq: 10, co: 'wash', qty: 2000, hqty: 2500, uom: 'loaves' },
            { sku: 'SDRGH-RND-16OZ', name: 'Sourdough Round', family: 'Bread', label: 'Trier Bakery', sz: '16OZ', oz: 16, fat: 1, seq: 11, co: 'none', qty: 1000, hqty: 1200, uom: 'loaves' },
            { sku: 'HBUN-8CT', name: 'Hamburger Buns - 8ct', family: 'Buns', label: 'Trier Bakery', sz: '8CT', oz: 16, fat: 3, seq: 12, co: 'wash', qty: 6000, hqty: 15000, uom: 'packs' },
            { sku: 'HBUN-8CT-PL', name: 'Hamburger Buns - 8ct', family: 'Buns', label: 'Private Label', sz: '8CT', oz: 16, fat: 3, seq: 13, co: 'none', qty: 8000, hqty: 20000, uom: 'packs' },
            { sku: 'HBUN-12CT', name: 'Hamburger Buns - 12ct', family: 'Buns', label: 'Trier Bakery', sz: '12CT', oz: 24, fat: 3, seq: 14, co: 'none', qty: 3000, hqty: 8000, uom: 'packs' },
            { sku: 'HDBUN-8CT', name: 'Hot Dog Buns - 8ct', family: 'Buns', label: 'Trier Bakery', sz: '8CT', oz: 12, fat: 3, seq: 15, co: 'none', qty: 5000, hqty: 12000, uom: 'packs' },
            { sku: 'HDBUN-8CT-PL', name: 'Hot Dog Buns - 8ct', family: 'Buns', label: 'Private Label', sz: '8CT', oz: 12, fat: 3, seq: 16, co: 'none', qty: 7000, hqty: 18000, uom: 'packs' },
            { sku: 'BRBUN-6CT', name: 'Brioche Burger Buns - 6ct', family: 'Buns', label: 'Premium Bakery', sz: '6CT', oz: 14, fat: 8, seq: 17, co: 'wash', qty: 2000, hqty: 4000, uom: 'packs' },
            { sku: 'SLDR-12CT', name: 'Slider Buns - 12ct', family: 'Buns', label: 'Trier Bakery', sz: '12CT', oz: 14, fat: 3, seq: 18, co: 'none', qty: 1500, hqty: 3000, uom: 'packs' },
            { sku: 'EGG-6CT', name: 'English Muffins - 6ct', family: 'Breakfast', label: 'Trier Bakery', sz: '6CT', oz: 12, fat: 1, seq: 19, co: 'wash', qty: 4000, hqty: 4500, uom: 'packs' },
            { sku: 'BGL-PLN-6CT', name: 'Plain Bagels - 6ct', family: 'Breakfast', label: 'Trier Bakery', sz: '6CT', oz: 20, fat: 1, seq: 20, co: 'none', qty: 3000, hqty: 3500, uom: 'packs' },
            { sku: 'BGL-EVE-6CT', name: 'Everything Bagels - 6ct', family: 'Breakfast', label: 'Trier Bakery', sz: '6CT', oz: 20, fat: 2, seq: 21, co: 'none', qty: 2500, hqty: 3000, uom: 'packs' },
            { sku: 'BGL-CIN-6CT', name: 'Cinnamon Raisin Bagels', family: 'Breakfast', label: 'Trier Bakery', sz: '6CT', oz: 20, fat: 1.5, seq: 22, co: 'sweep', qty: 2000, hqty: 2500, uom: 'packs' },
            { sku: 'DONUT-GLZ-12', name: 'Glazed Yeast Donuts - 12ct', family: 'Sweet Goods', label: 'Trier Bakery', sz: '12CT', oz: 24, fat: 15, seq: 23, co: 'wash', qty: 1500, hqty: 1800, uom: 'packs' },
            { sku: 'DONUT-CHOC-6', name: 'Chocolate Frosted Donuts - 6ct', family: 'Sweet Goods', label: 'Trier Bakery', sz: '6CT', oz: 15, fat: 18, seq: 24, co: 'none', qty: 1000, hqty: 1200, uom: 'packs' },
            { sku: 'MINI-MUFF-24', name: 'Mini Blueberry Muffins - 24ct', family: 'Sweet Goods', label: 'Trier Bakery', sz: '24CT', oz: 12, fat: 12, seq: 25, co: 'line-clean', qty: 1200, hqty: 1500, uom: 'packs' },
            { sku: 'CROIS-4CT', name: 'Butter Croissants - 4ct', family: 'Pastry', label: 'Premium Bakery', sz: '4CT', oz: 10, fat: 25, seq: 26, co: 'wash', qty: 800, hqty: 1200, uom: 'packs' },
            { sku: 'COOK-CHOC-12', name: 'Chocolate Chip Cookies - 12ct', family: 'Sweet Goods', label: 'Trier Bakery', sz: '12CT', oz: 16, fat: 22, seq: 27, co: 'none', qty: 2500, hqty: 3500, uom: 'packs' },
            { sku: 'COOK-OAT-12', name: 'Oatmeal Raisin Cookies - 12ct', family: 'Sweet Goods', label: 'Trier Bakery', sz: '12CT', oz: 16, fat: 18, seq: 28, co: 'sweep', qty: 1500, hqty: 2000, uom: 'packs' }
        ];

        return { units, products };
    } 
    
    if (modelName === 'Warehouse / Distribution') {
        const units = [
            { name: 'Receiving Dock 1-4', type: 'Receiving', desc: 'Inbound LTL and FTL receiving.', capacity: 10, cunit: 'trucks/hr', sqft: 5000, crit: 'A', sort: 1 },
            { name: 'Receiving Dock 5-8', type: 'Receiving', desc: 'Inbound LTL and FTL receiving.', capacity: 10, cunit: 'trucks/hr', sqft: 5000, crit: 'A', sort: 2 },
            { name: 'Bulk Storage A', type: 'Storage', desc: 'Deep reserve pallet storage racks.', capacity: 5000, cunit: 'pallets', sqft: 40000, crit: 'B', sort: 3 },
            { name: 'Bulk Storage B', type: 'Storage', desc: 'Reserve pallet storage.', capacity: 5000, cunit: 'pallets', sqft: 40000, crit: 'B', sort: 4 },
            { name: 'Active Pick Area 1', type: 'Storage', desc: 'Case and piece picking flow racks.', capacity: 2000, cunit: 'SKUs', sqft: 20000, crit: 'A', sort: 5 },
            { name: 'Active Pick Area 2', type: 'Storage', desc: 'Case picking floor level.', capacity: 1500, cunit: 'SKUs', sqft: 15000, crit: 'A', sort: 6 },
            { name: 'Cold Cube / Temp Controlled', type: 'Storage', desc: 'Refrigerated section for perishable goods.', capacity: 500, cunit: 'pallets', sqft: 8000, crit: 'A', sort: 7 },
            { name: 'Value Add Services (VAS)', type: 'Processing', desc: 'Kitting, repacking, labeling station.', capacity: 500, cunit: 'cases/hr', sqft: 3000, crit: 'C', sort: 8 },
            { name: 'Sortation Sorter 1', type: 'Processing', desc: 'Shoe sorter for outbound routing.', capacity: 3000, cunit: 'cartons/hr', sqft: 5000, crit: 'A', sort: 9 },
            { name: 'Shipping Dock 9-16', type: 'Receiving', desc: 'Outbound truck loading.', capacity: 20, cunit: 'trucks/hr', sqft: 8000, crit: 'A', sort: 10 }
        ];

        const products = [
            { sku: 'BAT-AA-24', name: 'Energizer AA Batteries - 24 Pack', family: 'Electronics', label: 'Energizer', sz: '24PK', oz: 12, fat: 0, seq: 1, co: 'none', qty: 500, hqty: 800, uom: 'cases' },
            { sku: 'BAT-AAA-24', name: 'Energizer AAA Batteries - 24 Pack', family: 'Electronics', label: 'Energizer', sz: '24PK', oz: 10, fat: 0, seq: 2, co: 'none', qty: 450, hqty: 700, uom: 'cases' },
            { sku: 'BAT-9V-4', name: 'Energizer 9V Batteries - 4 Pack', family: 'Electronics', label: 'Energizer', sz: '4PK', oz: 8, fat: 0, seq: 3, co: 'none', qty: 200, hqty: 250, uom: 'cases' },
            { sku: 'USB-C-6FT', name: 'USB-C Charging Cable - 6ft', family: 'Accessories', label: 'Anker', sz: '1EA', oz: 4, fat: 0, seq: 4, co: 'none', qty: 1200, hqty: 2000, uom: 'eaches' },
            { sku: 'LTNG-6FT', name: 'Lightning Charging Cable - 6ft', family: 'Accessories', label: 'Anker', sz: '1EA', oz: 4, fat: 0, seq: 5, co: 'none', qty: 1500, hqty: 2500, uom: 'eaches' },
            { sku: 'CHG-WALL-20W', name: '20W USB-C Wall Charger', family: 'Accessories', label: 'Anker', sz: '1EA', oz: 6, fat: 0, seq: 6, co: 'none', qty: 800, hqty: 1200, uom: 'eaches' },
            { sku: 'PWR-BANK-10K', name: '10000mAh Power Bank', family: 'Electronics', label: 'Anker', sz: '1EA', oz: 12, fat: 0, seq: 7, co: 'none', qty: 400, hqty: 600, uom: 'eaches' },
            { sku: 'PAPER-COPY-10REAM', name: 'Copy Paper 8.5x11 - 10 Ream Case', family: 'Office', label: 'Hammermill', sz: '10RM', oz: 800, fat: 0, seq: 8, co: 'none', qty: 300, hqty: 400, uom: 'cases' },
            { sku: 'PENS-BLK-12', name: 'Bic Round Stic Pens Black - 12ct', family: 'Office', label: 'Bic', sz: '12PK', oz: 3, fat: 0, seq: 9, co: 'none', qty: 800, hqty: 1000, uom: 'packs' },
            { sku: 'PENS-BLU-12', name: 'Bic Round Stic Pens Blue - 12ct', family: 'Office', label: 'Bic', sz: '12PK', oz: 3, fat: 0, seq: 10, co: 'none', qty: 600, hqty: 800, uom: 'packs' },
            { sku: 'SHARPIE-BLK-12', name: 'Sharpie Permanent Marker Black - 12ct', family: 'Office', label: 'Sharpie', sz: '12PK', oz: 5, fat: 0, seq: 11, co: 'none', qty: 500, hqty: 700, uom: 'packs' },
            { sku: 'SHARPIE-AST-12', name: 'Sharpie Markers Assorted - 12ct', family: 'Office', label: 'Sharpie', sz: '12PK', oz: 5, fat: 0, seq: 12, co: 'none', qty: 400, hqty: 600, uom: 'packs' },
            { sku: 'POSTIT-3X3-12', name: 'Post-it Notes 3x3 Yellow - 12 Pads', family: 'Office', label: 'Post-it', sz: '12PK', oz: 10, fat: 0, seq: 13, co: 'none', qty: 700, hqty: 900, uom: 'packs' },
            { sku: 'STAPLER-BLK', name: 'Swingline Standard Stapler', family: 'Office', label: 'Swingline', sz: '1EA', oz: 14, fat: 0, seq: 14, co: 'none', qty: 150, hqty: 200, uom: 'eaches' },
            { sku: 'STAPLES-5K', name: 'Standard Staples - 5000ct', family: 'Office', label: 'Swingline', sz: '5000CT', oz: 6, fat: 0, seq: 15, co: 'none', qty: 400, hqty: 500, uom: 'box' },
            { sku: 'TAPE-CLR-6', name: 'Scotch Transparent Tape - 6 Rolls', family: 'Office', label: 'Scotch', sz: '6RL', oz: 8, fat: 0, seq: 16, co: 'none', qty: 600, hqty: 800, uom: 'packs' },
            { sku: 'TP-24RL', name: 'Bath Tissue 2-Ply - 24 Rolls', family: 'Janitorial', label: 'Scott', sz: '24RL', oz: 96, fat: 0, seq: 17, co: 'none', qty: 250, hqty: 300, uom: 'cases' },
            { sku: 'PTC-12RL', name: 'Paper Towels - 12 Rolls', family: 'Janitorial', label: 'Bounty', sz: '12RL', oz: 84, fat: 0, seq: 18, co: 'none', qty: 300, hqty: 350, uom: 'cases' },
            { sku: 'TRASHBAG-13G-120', name: 'Tall Kitchen Bags 13 Gal - 120ct', family: 'Janitorial', label: 'Glad', sz: '120CT', oz: 48, fat: 0, seq: 19, co: 'none', qty: 400, hqty: 500, uom: 'box' },
            { sku: 'TRASHBAG-33G-90', name: 'Large Trash Bags 33 Gal - 90ct', family: 'Janitorial', label: 'Glad', sz: '90CT', oz: 60, fat: 0, seq: 20, co: 'none', qty: 200, hqty: 250, uom: 'box' },
            { sku: 'WINDEX-32OZ', name: 'Windex Glass Cleaner - 32oz', family: 'Janitorial', label: 'Windex', sz: '32OZ', oz: 34, fat: 0, seq: 21, co: 'none', qty: 350, hqty: 400, uom: 'bottles' },
            { sku: 'CLOROX-WIPES-3', name: 'Clorox Disinfecting Wipes - 3 Pack', family: 'Janitorial', label: 'Clorox', sz: '3PK', oz: 40, fat: 0, seq: 22, co: 'none', qty: 800, hqty: 1500, uom: 'packs' },
            { sku: 'COFFEE-KCUPS-72', name: 'Keurig K-Cups Medium Roast - 72ct', family: 'Breakroom', label: 'Green Mountain', sz: '72CT', oz: 32, fat: 0, seq: 23, co: 'none', qty: 600, hqty: 800, uom: 'box' },
            { sku: 'WATER-16OZ-35', name: 'Spring Water 16.9oz - 35 Pack', family: 'Breakroom', label: 'Kirkland', sz: '35PK', oz: 600, fat: 0, seq: 24, co: 'none', qty: 1000, hqty: 1200, uom: 'cases' }
        ];

        return { units, products };
    }

    if (modelName === 'Beverage / Bottling') {
        const units = [
            { name: 'Water Treatment System', type: 'Utilities', desc: 'RO/DI water purification system for beverage base.', capacity: 15000, cunit: 'gal/hr', sqft: 1200, crit: 'A', sort: 1 },
            { name: 'Syrup Mixing Tank 1', type: 'Processing', desc: '5,000 gal jacketed mixing tank for flavored syrups.', capacity: 5000, cunit: 'gal', sqft: 800, crit: 'A', sort: 2 },
            { name: 'Syrup Mixing Tank 2', type: 'Processing', desc: '5,000 gal jacketed mixing tank.', capacity: 5000, cunit: 'gal', sqft: 800, crit: 'B', sort: 3 },
            { name: 'Carbonator Duo', type: 'Processing', desc: 'Inline CO2 infusion system.', capacity: 12000, cunit: 'gal/hr', sqft: 600, crit: 'A', sort: 4 },
            { name: 'PET Blow Molder 1', type: 'Packaging', desc: 'In-line blow molding from preforms to bottles.', capacity: 600, cunit: 'bpm', sqft: 2000, crit: 'A', sort: 5 },
            { name: 'Filler Line 1 - Carbonated', type: 'Packaging', desc: 'High speed rotary filler for CSDs (Carbonated Soft Drinks).', capacity: 600, cunit: 'bpm', sqft: 3500, crit: 'A', sort: 6 },
            { name: 'Filler Line 2 - Still Liquids', type: 'Packaging', desc: 'Hot-fill capable rotary filler for juices/teas.', capacity: 400, cunit: 'bpm', sqft: 3000, crit: 'B', sort: 7 },
            { name: 'Canning Line 1', type: 'Packaging', desc: '12oz and 16oz sleek cans. Seamer attached.', capacity: 1000, cunit: 'cpm', sqft: 4000, crit: 'A', sort: 8 },
            { name: 'Packer / Shrink Wrapper 1', type: 'Packaging', desc: 'End of line packout to 12-packs and 24-pack trays.', capacity: 60, cunit: 'cases/min', sqft: 1500, crit: 'A', sort: 9 },
            { name: 'Robotic Palletizer 1', type: 'Packaging', desc: 'Automated end-of-line palletizing and stretch wrapping.', capacity: 100, cunit: 'pallets/hr', sqft: 2500, crit: 'A', sort: 10 },
            { name: 'Finished Goods Warehouse', type: 'Storage', desc: 'Ambient warehouse staging.', capacity: 20000, cunit: 'pallets', sqft: 50000, crit: 'B', sort: 11 }
        ];

        const products = [
            { sku: 'COLA-12-12OZ', name: 'Cola Classic - 12oz Cans 12-Pack', family: 'CSD', label: 'Trier Cola', sz: '12PK', oz: 144, fat: 0, seq: 1, co: 'none', qty: 5000, hqty: 6500, uom: 'cases' },
            { sku: 'COLA-2L', name: 'Cola Classic - 2L PET', family: 'CSD', label: 'Trier Cola', sz: '2L', oz: 67.6, fat: 0, seq: 2, co: 'none', qty: 3000, hqty: 4000, uom: 'bottles' },
            { sku: 'COLA-20OZ-24', name: 'Cola Classic - 20oz PET 24-Pack', family: 'CSD', label: 'Trier Cola', sz: '24PK', oz: 480, fat: 0, seq: 3, co: 'none', qty: 2500, hqty: 3200, uom: 'cases' },
            { sku: 'DIET-COLA-12-12OZ', name: 'Diet Cola - 12oz Cans 12-Pack', family: 'CSD', label: 'Trier Cola', sz: '12PK', oz: 144, fat: 0, seq: 4, co: 'water-rinse', qty: 3500, hqty: 4500, uom: 'cases' },
            { sku: 'DIET-COLA-2L', name: 'Diet Cola - 2L PET', family: 'CSD', label: 'Trier Cola', sz: '2L', oz: 67.6, fat: 0, seq: 5, co: 'none', qty: 2000, hqty: 2500, uom: 'bottles' },
            { sku: 'DIET-COLA-20OZ-24', name: 'Diet Cola - 20oz PET 24-Pack', family: 'CSD', label: 'Trier Cola', sz: '24PK', oz: 480, fat: 0, seq: 6, co: 'none', qty: 1800, hqty: 2300, uom: 'cases' },
            { sku: 'LEMON-LIME-12-12OZ', name: 'Lemon-Lime Soda - 12oz Cans 12-Pack', family: 'CSD', label: 'CitrusFizz', sz: '12PK', oz: 144, fat: 0, seq: 7, co: 'water-rinse', qty: 2800, hqty: 3500, uom: 'cases' },
            { sku: 'LEMON-LIME-2L', name: 'Lemon-Lime Soda - 2L PET', family: 'CSD', label: 'CitrusFizz', sz: '2L', oz: 67.6, fat: 0, seq: 8, co: 'none', qty: 1500, hqty: 2000, uom: 'bottles' },
            { sku: 'ORG-SODA-12-12OZ', name: 'Orange Soda - 12oz Cans 12-Pack', family: 'CSD', label: 'OrangeCrush', sz: '12PK', oz: 144, fat: 0, seq: 9, co: 'flavor-rinse', qty: 1200, hqty: 1800, uom: 'cases' },
            { sku: 'ORG-SODA-2L', name: 'Orange Soda - 2L PET', family: 'CSD', label: 'OrangeCrush', sz: '2L', oz: 67.6, fat: 0, seq: 10, co: 'none', qty: 800, hqty: 1200, uom: 'bottles' },
            { sku: 'GINGER-ALE-12-12OZ', name: 'Ginger Ale - 12oz Cans 12-Pack', family: 'CSD', label: 'GingerSnap', sz: '12PK', oz: 144, fat: 0, seq: 11, co: 'water-rinse', qty: 1500, hqty: 2200, uom: 'cases' },
            { sku: 'GINGER-ALE-2L', name: 'Ginger Ale - 2L PET', family: 'CSD', label: 'GingerSnap', sz: '2L', oz: 67.6, fat: 0, seq: 12, co: 'none', qty: 900, hqty: 1300, uom: 'bottles' },
            { sku: 'WATER-PUR-24-16OZ', name: 'Purified Water - 16.9oz 24-Pack', family: 'Water', label: 'AquaPure', sz: '24PK', oz: 405.6, fat: 0, seq: 13, co: 'full-cip', qty: 8000, hqty: 10000, uom: 'cases' },
            { sku: 'WATER-PUR-40-16OZ', name: 'Purified Water - 16.9oz 40-Pack', family: 'Water', label: 'AquaPure', sz: '40PK', oz: 676, fat: 0, seq: 14, co: 'none', qty: 4000, hqty: 5500, uom: 'cases' },
            { sku: 'WATER-SPR-24-16OZ', name: 'Spring Water - 16.9oz 24-Pack', family: 'Water', label: 'MountainSpring', sz: '24PK', oz: 405.6, fat: 0, seq: 15, co: 'none', qty: 3000, hqty: 3800, uom: 'cases' },
            { sku: 'ICED-TEA-SWEET-1GAL', name: 'Sweet Iced Tea - 1 Gallon', family: 'Tea', label: 'SouthernLeaf', sz: '1GAL', oz: 128, fat: 0, seq: 16, co: 'hot-rinse', qty: 1200, hqty: 1800, uom: 'bottles' },
            { sku: 'ICED-TEA-UNSW-1GAL', name: 'Unsweet Iced Tea - 1 Gallon', family: 'Tea', label: 'SouthernLeaf', sz: '1GAL', oz: 128, fat: 0, seq: 17, co: 'hot-rinse', qty: 800, hqty: 1000, uom: 'bottles' },
            { sku: 'SPORT-FRUIT-8-20OZ', name: 'Sports Drink Fruit Punch - 20oz 8-Pack', family: 'Isotonics', label: 'ElectroCharge', sz: '8PK', oz: 160, fat: 0, seq: 18, co: 'flavor-rinse', qty: 2000, hqty: 3000, uom: 'cases' },
            { sku: 'SPORT-BLU-8-20OZ', name: 'Sports Drink Blue Raspberry - 20oz 8-Pack', family: 'Isotonics', label: 'ElectroCharge', sz: '8PK', oz: 160, fat: 0, seq: 19, co: 'flavor-rinse', qty: 1800, hqty: 2800, uom: 'cases' },
            { sku: 'SPORT-LMN-8-20OZ', name: 'Sports Drink Lemon-Lime - 20oz 8-Pack', family: 'Isotonics', label: 'ElectroCharge', sz: '8PK', oz: 160, fat: 0, seq: 20, co: 'flavor-rinse', qty: 1500, hqty: 2200, uom: 'cases' }
        ];

        return { units, products };
    }

    // Default to Food Manufacturing/Other generic
    const units = [
        { name: 'Receiving Silo', type: 'Receiving', desc: 'Bulk dry ingredient receiving.', capacity: 100000, cunit: 'lbs', sqft: 1000, crit: 'A', sort: 1 },
        { name: 'Mixing Vat A', type: 'Processing', desc: 'Primary mixing.', capacity: 5000, cunit: 'gal', sqft: 800, crit: 'A', sort: 2 },
        { name: 'Extruder Line 1', type: 'Processing', desc: 'Forming and shaping.', capacity: 2000, cunit: 'lbs/hr', sqft: 2000, crit: 'A', sort: 3 },
        { name: 'Packaging Line 1', type: 'Packaging', desc: 'Primary bagging.', capacity: 80, cunit: 'bpm', sqft: 1200, crit: 'A', sort: 4 }
    ];

    const products = [
        { sku: 'PROD-A-1', name: 'Product A - Standard', family: 'Alpha', label: 'Trier', sz: '1LB', oz: 16, fat: 0, seq: 1, co: 'none', qty: 1000, hqty: 1200, uom: 'cases' },
        { sku: 'PROD-A-2', name: 'Product A - Large', family: 'Alpha', label: 'Trier', sz: '5LB', oz: 80, fat: 0, seq: 2, co: 'none', qty: 500, hqty: 600, uom: 'cases' },
        { sku: 'PROD-B-1', name: 'Product B - Standard', family: 'Beta', label: 'Trier', sz: '1LB', oz: 16, fat: 0, seq: 3, co: 'sweep', qty: 800, hqty: 1000, uom: 'cases' }
    ];

    return { units, products };
}

module.exports = { getSeedData };
