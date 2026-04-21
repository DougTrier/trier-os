'use strict';
const fs   = require('fs');
const path = require('path');

const KEY = 'plantNetwork.cacheStale';

const translations = {
    en: 'Offline data last updated {{age}}',
    zh: '离线数据上次更新于 {{age}}',
    es: 'Datos sin conexión actualizados hace {{age}}',
    fr: 'Données hors ligne mises à jour il y a {{age}}',
    de: 'Offline-Daten zuletzt aktualisiert vor {{age}}',
    pt: 'Dados offline atualizados há {{age}}',
    ja: 'オフラインデータの最終更新: {{age}}',
    ko: '오프라인 데이터 마지막 업데이트: {{age}} 전',
    ar: 'آخر تحديث للبيانات غير المتصلة: {{age}}',
    hi: 'ऑफलाइन डेटा आखिरी बार {{age}} पहले अपडेट किया गया',
    tr: 'Çevrimdışı veriler {{age}} önce güncellendi',
};

const dir = path.join(__dirname, '..', 'src', 'i18n');

for (const [lang, value] of Object.entries(translations)) {
    const file = path.join(dir, `${lang}.json`);
    if (!fs.existsSync(file)) { console.warn(`Missing: ${file}`); continue; }

    const obj = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (obj[KEY]) { console.log(`${lang}: already has key, skipping`); continue; }

    obj[KEY] = value;
    fs.writeFileSync(file, JSON.stringify(obj, null, 2), 'utf8');
    console.log(`${lang}: added "${KEY}"`);
}

console.log('Done.');
