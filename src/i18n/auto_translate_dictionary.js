// Copyright © 2026 Trier OS. All Rights Reserved.

const fs = require('fs');
const path = require('path');
const translate = require('google-translate-api-x');

const langsToProcess = process.argv.slice(2);
if (langsToProcess.length === 0) {
  console.log("Provide languages to process.");
  process.exit(1);
}

const enFile = path.join(__dirname, 'en.json');
const enDict = JSON.parse(fs.readFileSync(enFile, 'utf8'));

const langMap = {
  zh: 'zh-CN', es: 'es', fr: 'fr', ar: 'ar', hi: 'hi', ja: 'ja', de: 'de', pt: 'pt', tr: 'tr', ko: 'ko'
};

async function processLang(lang) {
  const code = langMap[lang];
  if (!code) return;
  const filePath = path.join(__dirname, `${lang}.json`);
  if (!fs.existsSync(filePath)) return;
  
  const dict = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const keysToFix = [];

  // STRUCTURAL INJECTION: Ensure full parity with en.json before semantic analysis
  for (const enKey of Object.keys(enDict)) {
    if (dict[enKey] === undefined) {
      dict[enKey] = enDict[enKey]; // Inject English fallback
    }
  }

  // English words and vendor names that are gracefully allowed in non-Latin translations without triggering corruption
  const allowedEnglish = [
    'Trier', 'Fiix', 'UpKeep', 'Limble', 'MaintainX', 'eMaint', 'SAP', 'IBM', 'Maximo', 'Oracle', 'Db2', 'Hexagon', 'SaaS', 'AWS', 'Azure',
    'MTBF', 'MTTR', 'OEE', 'LOTO', 'DVIR', 'CDL', 'FMEA', 'ECN', 'RCA', 'PM', 'WO', 'SOP', 'BOM', 'OSHA', 'DOT',
    'SCADA', 'PLC', 'LDAP', 'ERP', 'HTTP', 'REST', 'IP', 'MAC', 'PWA', 'IoT', 'OPC-UA', 'Tetra', 'Pak', 'QR', 'OCR', 'HA', 'UI', 'UX',
    'PMC', 'MP2', 'Access', 'SQL', 'API', 'IT', 'VM', 'DBA', 'FTE', 'KPI', 'RBAC', 'Slack', 'Teams', 'Discord',
    'JSON', 'IDE', 'React', 'Router', 'URL', 'SHA', 'ES6', 'EdgeAgent', 'Nodes', 'DHCP', 'TCP', 'Modbus', 'OT',
    // New common IT/File extension exceptions
    'AI', 'ID', 'OS', 'Doug', 'txt', 'md', 'pdf', 'png', 'jpg', 'jpeg', 'csv', 'Power', 'BI', 'cURL', 'YOUR', 'TOKEN', 'POST', 'GET', 'PUT', 'DELETE', 'auth',
    'A', 'B', 'C', 'X', 'Y', 'Z'
  ];
  for (const [key, value] of Object.entries(dict)) {
    // If the translated string is completely identical to the English original, it may be a failed API translation
    // UNLESS the total string perfectly matches an approved global IT acronym (like "HTTP" or "OEE")
    const isCorrupted = (dict[key] === enDict[key]); 
    const exactMatchSafe = allowedEnglish.some(w => w.toLowerCase() === value.trim().toLowerCase());

    if (isCorrupted && !exactMatchSafe) {
      keysToFix.push(key);
    }
  }

  console.log(`[${lang}] Found ${keysToFix.length} corrupted entries. Translating to ${code}...`);

  const batchSize = 100;
  for (let i = 0; i < keysToFix.length; i += batchSize) {
    const batchKeys = keysToFix.slice(i, i + batchSize);
    const engValues = batchKeys.map(k => enDict[k]);

    try {
      const res = await translate(engValues, { to: code, rejectOnPartialFail: false });
      const translatedArray = Array.isArray(res) ? res : [res];

      for (let j = 0; j < batchKeys.length; j++) {
        if (translatedArray[j] && translatedArray[j].text) {
          dict[batchKeys[j]] = translatedArray[j].text;
        }
      }
      process.stdout.write(`.`); 
    } catch (e) {
      console.error(`\n[${lang}] Error translate API batch ${i}:`, e.message);
      await new Promise(r => setTimeout(r, 2000));
    }
    await new Promise(r => setTimeout(r, 1000));
  }
  
  fs.writeFileSync(filePath, JSON.stringify(dict, null, 2), 'utf8');
  console.log(`\n[${lang}] Fully rebuilt! Saved to ${lang}.json`);
}

async function main() {
  for (const lang of langsToProcess) {
    await processLang(lang);
  }
}

main();
