/**
 * Adds plantNetwork.* translation keys to all language files.
 * Safe: only appends new keys — never modifies or deletes existing ones.
 * Run: node scripts/add-plant-network-i18n.js
 */

const fs   = require('fs');
const path = require('path');

const I18N_DIR = path.join(__dirname, '..', 'src', 'i18n');

const KEYS = {
    en: {
        'plantNetwork.title':            'Plant Network',
        'plantNetwork.centralServer':    'Central Server',
        'plantNetwork.lanHub':           'LAN Hub',
        'plantNetwork.checking':         'Checking…',
        'plantNetwork.online':           'Online',
        'plantNetwork.unreachable':      'Unreachable',
        'plantNetwork.hubConnected':     'Connected · port {{port}}',
        'plantNetwork.hubRunning':       'Running · port {{port}}',
        'plantNetwork.hubNotRunning':    'Not running',
        'plantNetwork.devices':          'Devices',
        'plantNetwork.devicesConnected': '{{n}} connected',
        'plantNetwork.refresh':          'Refresh',
        'plantNetwork.deviceUser':       'User {{id}}',
        'plantNetwork.device':           'Device',
    },
    zh: {
        'plantNetwork.title':            '工厂网络',
        'plantNetwork.centralServer':    '中央服务器',
        'plantNetwork.lanHub':           '局域网中枢',
        'plantNetwork.checking':         '检查中…',
        'plantNetwork.online':           '在线',
        'plantNetwork.unreachable':      '无法访问',
        'plantNetwork.hubConnected':     '已连接 · 端口 {{port}}',
        'plantNetwork.hubRunning':       '运行中 · 端口 {{port}}',
        'plantNetwork.hubNotRunning':    '未运行',
        'plantNetwork.devices':          '设备',
        'plantNetwork.devicesConnected': '{{n}} 台已连接',
        'plantNetwork.refresh':          '刷新',
        'plantNetwork.deviceUser':       '用户 {{id}}',
        'plantNetwork.device':           '设备',
    },
    es: {
        'plantNetwork.title':            'Red de Planta',
        'plantNetwork.centralServer':    'Servidor Central',
        'plantNetwork.lanHub':           'Hub LAN',
        'plantNetwork.checking':         'Verificando…',
        'plantNetwork.online':           'En línea',
        'plantNetwork.unreachable':      'Sin conexión',
        'plantNetwork.hubConnected':     'Conectado · puerto {{port}}',
        'plantNetwork.hubRunning':       'Activo · puerto {{port}}',
        'plantNetwork.hubNotRunning':    'No activo',
        'plantNetwork.devices':          'Dispositivos',
        'plantNetwork.devicesConnected': '{{n}} conectados',
        'plantNetwork.refresh':          'Actualizar',
        'plantNetwork.deviceUser':       'Usuario {{id}}',
        'plantNetwork.device':           'Dispositivo',
    },
    fr: {
        'plantNetwork.title':            'Réseau Usine',
        'plantNetwork.centralServer':    'Serveur Central',
        'plantNetwork.lanHub':           'Hub LAN',
        'plantNetwork.checking':         'Vérification…',
        'plantNetwork.online':           'En ligne',
        'plantNetwork.unreachable':      'Inaccessible',
        'plantNetwork.hubConnected':     'Connecté · port {{port}}',
        'plantNetwork.hubRunning':       'Actif · port {{port}}',
        'plantNetwork.hubNotRunning':    'Inactif',
        'plantNetwork.devices':          'Appareils',
        'plantNetwork.devicesConnected': '{{n}} connectés',
        'plantNetwork.refresh':          'Actualiser',
        'plantNetwork.deviceUser':       'Utilisateur {{id}}',
        'plantNetwork.device':           'Appareil',
    },
    de: {
        'plantNetwork.title':            'Werknetzwerk',
        'plantNetwork.centralServer':    'Zentralserver',
        'plantNetwork.lanHub':           'LAN-Hub',
        'plantNetwork.checking':         'Prüfen…',
        'plantNetwork.online':           'Online',
        'plantNetwork.unreachable':      'Nicht erreichbar',
        'plantNetwork.hubConnected':     'Verbunden · Port {{port}}',
        'plantNetwork.hubRunning':       'Aktiv · Port {{port}}',
        'plantNetwork.hubNotRunning':    'Inaktiv',
        'plantNetwork.devices':          'Geräte',
        'plantNetwork.devicesConnected': '{{n}} verbunden',
        'plantNetwork.refresh':          'Aktualisieren',
        'plantNetwork.deviceUser':       'Benutzer {{id}}',
        'plantNetwork.device':           'Gerät',
    },
    pt: {
        'plantNetwork.title':            'Rede da Planta',
        'plantNetwork.centralServer':    'Servidor Central',
        'plantNetwork.lanHub':           'Hub LAN',
        'plantNetwork.checking':         'Verificando…',
        'plantNetwork.online':           'Online',
        'plantNetwork.unreachable':      'Inacessível',
        'plantNetwork.hubConnected':     'Conectado · porta {{port}}',
        'plantNetwork.hubRunning':       'Ativo · porta {{port}}',
        'plantNetwork.hubNotRunning':    'Inativo',
        'plantNetwork.devices':          'Dispositivos',
        'plantNetwork.devicesConnected': '{{n}} conectados',
        'plantNetwork.refresh':          'Atualizar',
        'plantNetwork.deviceUser':       'Usuário {{id}}',
        'plantNetwork.device':           'Dispositivo',
    },
    ja: {
        'plantNetwork.title':            '工場ネットワーク',
        'plantNetwork.centralServer':    '中央サーバー',
        'plantNetwork.lanHub':           'LANハブ',
        'plantNetwork.checking':         '確認中…',
        'plantNetwork.online':           'オンライン',
        'plantNetwork.unreachable':      '接続不可',
        'plantNetwork.hubConnected':     '接続済み · ポート {{port}}',
        'plantNetwork.hubRunning':       '稼働中 · ポート {{port}}',
        'plantNetwork.hubNotRunning':    '停止中',
        'plantNetwork.devices':          'デバイス',
        'plantNetwork.devicesConnected': '{{n}} 台接続中',
        'plantNetwork.refresh':          '更新',
        'plantNetwork.deviceUser':       'ユーザー {{id}}',
        'plantNetwork.device':           'デバイス',
    },
    ko: {
        'plantNetwork.title':            '공장 네트워크',
        'plantNetwork.centralServer':    '중앙 서버',
        'plantNetwork.lanHub':           'LAN 허브',
        'plantNetwork.checking':         '확인 중…',
        'plantNetwork.online':           '온라인',
        'plantNetwork.unreachable':      '연결 불가',
        'plantNetwork.hubConnected':     '연결됨 · 포트 {{port}}',
        'plantNetwork.hubRunning':       '실행 중 · 포트 {{port}}',
        'plantNetwork.hubNotRunning':    '실행 안 됨',
        'plantNetwork.devices':          '장치',
        'plantNetwork.devicesConnected': '{{n}}개 연결됨',
        'plantNetwork.refresh':          '새로 고침',
        'plantNetwork.deviceUser':       '사용자 {{id}}',
        'plantNetwork.device':           '장치',
    },
    ar: {
        'plantNetwork.title':            'شبكة المصنع',
        'plantNetwork.centralServer':    'الخادم المركزي',
        'plantNetwork.lanHub':           'مركز الشبكة',
        'plantNetwork.checking':         'جارٍ التحقق…',
        'plantNetwork.online':           'متصل',
        'plantNetwork.unreachable':      'غير متاح',
        'plantNetwork.hubConnected':     'متصل · المنفذ {{port}}',
        'plantNetwork.hubRunning':       'يعمل · المنفذ {{port}}',
        'plantNetwork.hubNotRunning':    'غير نشط',
        'plantNetwork.devices':          'الأجهزة',
        'plantNetwork.devicesConnected': '{{n}} متصل',
        'plantNetwork.refresh':          'تحديث',
        'plantNetwork.deviceUser':       'مستخدم {{id}}',
        'plantNetwork.device':           'جهاز',
    },
    hi: {
        'plantNetwork.title':            'प्लांट नेटवर्क',
        'plantNetwork.centralServer':    'केंद्रीय सर्वर',
        'plantNetwork.lanHub':           'LAN हब',
        'plantNetwork.checking':         'जाँच हो रही है…',
        'plantNetwork.online':           'ऑनलाइन',
        'plantNetwork.unreachable':      'अनुपलब्ध',
        'plantNetwork.hubConnected':     'कनेक्टेड · पोर्ट {{port}}',
        'plantNetwork.hubRunning':       'चालू · पोर्ट {{port}}',
        'plantNetwork.hubNotRunning':    'बंद है',
        'plantNetwork.devices':          'डिवाइस',
        'plantNetwork.devicesConnected': '{{n}} कनेक्टेड',
        'plantNetwork.refresh':          'रिफ्रेश',
        'plantNetwork.deviceUser':       'उपयोगकर्ता {{id}}',
        'plantNetwork.device':           'डिवाइस',
    },
    tr: {
        'plantNetwork.title':            'Tesis Ağı',
        'plantNetwork.centralServer':    'Merkezi Sunucu',
        'plantNetwork.lanHub':           'LAN Hub',
        'plantNetwork.checking':         'Kontrol ediliyor…',
        'plantNetwork.online':           'Çevrimici',
        'plantNetwork.unreachable':      'Erişilemiyor',
        'plantNetwork.hubConnected':     'Bağlı · port {{port}}',
        'plantNetwork.hubRunning':       'Çalışıyor · port {{port}}',
        'plantNetwork.hubNotRunning':    'Çalışmıyor',
        'plantNetwork.devices':          'Cihazlar',
        'plantNetwork.devicesConnected': '{{n}} bağlı',
        'plantNetwork.refresh':          'Yenile',
        'plantNetwork.deviceUser':       'Kullanıcı {{id}}',
        'plantNetwork.device':           'Cihaz',
    },
};

let errors = 0;
for (const [lang, newKeys] of Object.entries(KEYS)) {
    const filePath = path.join(I18N_DIR, lang + '.json');
    if (!fs.existsSync(filePath)) {
        console.log('  SKIP  ' + lang + '.json (not found)');
        continue;
    }
    try {
        const raw     = fs.readFileSync(filePath, 'utf8');
        const obj     = JSON.parse(raw);
        let   added   = 0;
        for (const [k, v] of Object.entries(newKeys)) {
            if (!obj[k]) { obj[k] = v; added++; }
        }
        fs.writeFileSync(filePath, JSON.stringify(obj, null, 2), 'utf8');
        console.log('  OK    ' + lang + '.json  (+' + added + ' keys)');
    } catch (err) {
        console.error('  ERROR ' + lang + '.json: ' + err.message);
        errors++;
    }
}

if (errors) {
    console.error('\n  ' + errors + ' file(s) failed — check above.');
    process.exit(1);
} else {
    console.log('\n  All language files updated successfully.');
}
