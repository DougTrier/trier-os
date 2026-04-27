const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../src/i18n/zh.json');
const raw = fs.readFileSync(filePath, 'utf8');
const bom = raw.startsWith('﻿') ? '﻿' : '';
const parsed = JSON.parse(raw.replace(/^﻿/, ''));

const fixes = {
    'contractors.contractorProgramStats': '承包商计划统计',
    'corpAnalytics.fleetReplacementCandidates': '机队替代候选者',
    'enterpriseIntel.noDowntimeDataRecordedTip': '没有记录停机数据',
    'login.authenticateAndEnterTheSystemTip': '认证并进入系统',
    'photoAssembly.addMorePhotosTip': '添加更多照片',
    'vendorPortal.quotedTotal': '引用总数：',
    'warranty.partsmaterialAvoided': '避免使用的零件/材料',
};

for (const [key, val] of Object.entries(fixes)) {
    parsed[key] = val;
    console.log(`Fixed: ${key} → ${val}`);
}

const out = bom + JSON.stringify(parsed, null, 2);
JSON.parse(out.replace(/^﻿/, '')); // validate
fs.writeFileSync(filePath, out, 'utf8');
console.log('\nzh.json saved — all 7 pre-existing corruptions fixed');
