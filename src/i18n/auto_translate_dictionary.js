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

  for (const [key, value] of Object.entries(dict)) {
    let cleaned = value.replace(/\{\{[^}]+\}\}/g, '').replace(/<[^>]+>/g, '').replace(/https?:\/\/[^\s]+/g, '');
    
    // Non-Latin: Any english letters is corruption
    // Latin: Exact match with English dictionary is an untranslated phrase
    const isCorrupted = (['zh', 'ar', 'hi', 'ja', 'tr', 'ko'].includes(lang)) ? 
         /[a-zA-Z]/.test(cleaned) : 
         (dict[key] === enDict[key] && /[a-zA-Z]/.test(cleaned)); 

    // Specific acronyms to bypass translation corruption loops if they are identical
    const safeAcronyms = ['MTBF', 'MTTR', 'OEE', 'LOTO', 'DVIR', 'CDL', 'FMEA', 'ECN', 'RCA', 'PM', 'WO', 'SOP', 'BOM', 'OSHA', 'DOT'];
    const exactMatchSafe = safeAcronyms.includes(value.trim());

    if (isCorrupted && enDict[key] && !exactMatchSafe) {
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
