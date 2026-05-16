// plugins/ssh.js
// SSH accounts + V2Ray VMess links for HTTP Custom / V2RayNG / NapsternetV
// Commands: .ssh  .airtel  .freenet  .ugconfig  .hcsetup  .ehi  .getssh

// ── Airtel Uganda bug hosts ──────────────────────────────────────────────────
const BUGS = [
    { name: 'WhatsApp WS',    host: 'web.whatsapp.com',     tls: '' },
    { name: 'WhatsApp CDN',   host: 'mmg.whatsapp.net',     tls: '' },
    { name: 'WhatsApp P2P',   host: 'v.whatsapp.net',       tls: '' },
    { name: 'Google Free',    host: 'clients3.google.com',  tls: '' },
    { name: 'Facebook Zero',  host: '0.facebook.com',       tls: '' },
    { name: 'Airtel Portal',  host: 'airtelafrica.com',     tls: '' },
    { name: 'WA Secure',      host: 'web.whatsapp.com',     tls: 'tls' },
];

// ── Free VMess providers ─────────────────────────────────────────────────────
const VMESS_PROVIDERS = [
    {
        name: 'VPNJantit',
        servers: [
            { id: 'sg1.vpnjantit.com', region: 'Singapore', defaultPort: 80, path: '/vpnjantit-com' },
            { id: 'us1.vpnjantit.com', region: 'USA',       defaultPort: 80, path: '/vpnjantit-com' },
        ],
        createUrl: s => `https://www.vpnjantit.com/create-free-vmess`,
        serverField: s => s.id,
        parseUUID: html => html.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)?.[0],
        parseHost: (html, sid) => {
            const ip = html.match(/(?:Host|Server|IP)[^\d]*((?:\d{1,3}\.){3}\d{1,3})/i)?.[1];
            return ip || sid;
        },
        parsePath: html => html.match(/(?:Path|path)[^\w]*(\/[\w\-\/]*)/i)?.[1] || '/vpnjantit-com',
        parsePort: html => parseInt(html.match(/(?:Port|port)[^\d]*(\d{2,5})/i)?.[1] || '80'),
    },
    {
        name: 'SSHKitty',
        servers: [
            { id: 'sg-1.sshkitty.com', region: 'Singapore', defaultPort: 80, path: '/sshkitty' },
        ],
        createUrl: s => `https://www.sshkitty.com/create-vmess`,
        serverField: s => s.id,
        parseUUID: html => html.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)?.[0],
        parseHost: (html, sid) => html.match(/((?:\d{1,3}\.){3}\d{1,3})/)?.[0] || sid,
        parsePath: html => html.match(/path[^\w]*(\/[\w\-\/]+)/i)?.[1] || '/sshkitty',
        parsePort: html => parseInt(html.match(/port[^\d]*(\d{2,5})/i)?.[1] || '80'),
    },
];

// ── Free SSH providers ───────────────────────────────────────────────────────
const SSH_PROVIDERS = [
    {
        name: 'FastSSH',
        servers: [
            { id: 'sg1-fastssh', region: 'Singapore' },
            { id: 'us1-fastssh', region: 'USA' },
        ],
        createUrl: s => `https://www.fastssh.com/page/create-ssh-account/server/${s}/`,
        body: (u, p) => `username=${u}&password=${p}&repassword=${p}`,
        parseHost: html => html.match(/((?:\d{1,3}\.){3}\d{1,3})/)?.[0],
        parsePort: html => html.match(/Port.*?(\d{2,5})/)?.[1] || '22',
        parseWs:   html => html.match(/WebSocket.*?(80|443|8080|8880)/i)?.[1] || '80',
    },
    {
        name: 'SpeedSSH',
        servers: [{ id: 'sg1.speedssh.com', region: 'Singapore' }],
        createUrl: s => `https://www.speedssh.com/create-ssh/${s}/`,
        body: (u, p) => `username=${u}&password=${p}&repassword=${p}`,
        parseHost: html => html.match(/((?:\d{1,3}\.){3}\d{1,3})/)?.[0],
        parsePort: html => html.match(/Port.*?(\d{2,5})/)?.[1] || '22',
        parseWs:   html => html.match(/WebSocket.*?(80|443|8080|8880)/i)?.[1] || '80',
    },
];

function rnd(len, chars = 'abcdefghijklmnopqrstuvwxyz0123456789') {
    return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

const HEADERS = {
    'Content-Type': 'application/x-www-form-urlencoded',
    'User-Agent': 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
    'Connection': 'keep-alive',
};

// ── Fetch free VMess account ─────────────────────────────────────────────────
async function fetchVmess(provider, serverObj) {
    try {
        const user = 'jam' + rnd(6), pass = rnd(8) + 'A1!';
        const ctrl = new AbortController();
        const tid  = setTimeout(() => ctrl.abort(), 25000);
        const res  = await fetch(provider.createUrl(serverObj.id), {
            method: 'POST', signal: ctrl.signal,
            headers: { ...HEADERS, Referer: provider.createUrl(serverObj.id) },
            body: new URLSearchParams({
                username: user, password: pass, repassword: pass,
                server: provider.serverField(serverObj),
            }).toString(),
        });
        clearTimeout(tid);
        if (!res.ok) return null;
        const html = await res.text();
        const uuid = provider.parseUUID(html);
        if (!uuid) return null;
        return {
            source: provider.name, region: serverObj.region,
            host: provider.parseHost(html, serverObj.id),
            port: provider.parsePort(html) || serverObj.defaultPort,
            uuid, path: provider.parsePath(html) || serverObj.path,
        };
    } catch { return null; }
}

// ── Fetch free SSH account ───────────────────────────────────────────────────
async function fetchSsh(provider, serverObj) {
    try {
        const user = 'jam' + rnd(6), pass = rnd(8) + 'A1!';
        const ctrl = new AbortController();
        const tid  = setTimeout(() => ctrl.abort(), 20000);
        const res  = await fetch(provider.createUrl(serverObj.id), {
            method: 'POST', signal: ctrl.signal,
            headers: { ...HEADERS, Referer: provider.createUrl(serverObj.id) },
            body: provider.body(user, pass),
        });
        clearTimeout(tid);
        if (!res.ok) return null;
        const html = await res.text();
        if (!html.includes(user) && !html.match(/((?:\d{1,3}\.){3}\d{1,3})/)) return null;
        const host = provider.parseHost(html);
        if (!host) return null;
        return {
            source: provider.name, region: serverObj.region,
            host, port: provider.parsePort(html),
            wsPort: provider.parseWs(html),
            username: user, password: pass, expiry: '7 days',
        };
    } catch { return null; }
}

// ── Build vmess:// URI ───────────────────────────────────────────────────────
function vmessUri(acc, bug) {
    const config = {
        v: '2',
        ps: `JAM-MD | ${acc.region} | ${bug.name}`,
        add: acc.host,
        port: String(acc.port),
        id: acc.uuid,
        aid: '0',
        net: 'ws',
        type: 'none',
        host: bug.host,
        path: acc.path,
        tls: bug.tls,
        sni: bug.tls ? bug.host : '',
    };
    return 'vmess://' + Buffer.from(JSON.stringify(config)).toString('base64');
}

// ── Build HTTP Injector .ehi (ZIP) for SSH ──────────────────────────────────
function crc32(buf) {
    let c = 0xFFFFFFFF;
    for (const b of buf) { c ^= b; for (let j = 0; j < 8; j++) c = (c & 1) ? (c >>> 1) ^ 0xEDB88320 : c >>> 1; }
    return (c ^ 0xFFFFFFFF) >>> 0;
}
function buildEhi(acc) {
    const PAYLOAD_TEMPLATES = BUGS.slice(0, 3).map(b => b.host);
    const payload = `GET / HTTP/1.1[crlf]Host: ${PAYLOAD_TEMPLATES[0]}[crlf]Upgrade: websocket[crlf][crlf]`;
    const json = Buffer.from(JSON.stringify({
        SSH: { SSHHost: acc.host, SSHPort: acc.wsPort, SSHUsername: acc.username, SSHPassword: acc.password, SSHNote: `JAM-MD [${acc.source} ${acc.region}]` },
        Payload: { Payload: payload, PayloadNote: 'WhatsApp SNI - Airtel Uganda' },
        DNS: { DNSHost: '8.8.8.8', DNSPort: '53' },
    }, null, 2), 'utf8');
    const { time, date } = (() => {
        const d = new Date();
        return { time: ((d.getHours()<<11)|(d.getMinutes()<<5)|(d.getSeconds()>>1))&0xFFFF, date: (((d.getFullYear()-1980)<<9)|((d.getMonth()+1)<<5)|d.getDate())&0xFFFF };
    })();
    const name = Buffer.from('config.json', 'utf8');
    const crc = crc32(json);
    const lh = Buffer.alloc(30 + name.length);
    lh.writeUInt32LE(0x04034B50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0, 6);
    lh.writeUInt16LE(0, 8); lh.writeUInt16LE(time, 10); lh.writeUInt16LE(date, 12);
    lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(json.length, 18); lh.writeUInt32LE(json.length, 22);
    lh.writeUInt16LE(name.length, 26); lh.writeUInt16LE(0, 28); name.copy(lh, 30);
    const cd = Buffer.alloc(46 + name.length);
    cd.writeUInt32LE(0x02014B50, 0); cd.writeUInt16LE(20, 4); cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(0, 8); cd.writeUInt16LE(0, 10); cd.writeUInt16LE(time, 12);
    cd.writeUInt16LE(date, 14); cd.writeUInt32LE(crc, 16); cd.writeUInt32LE(json.length, 20);
    cd.writeUInt32LE(json.length, 24); cd.writeUInt16LE(name.length, 28); cd.writeUInt16LE(0, 30);
    cd.writeUInt16LE(0, 32); cd.writeUInt16LE(0, 34); cd.writeUInt16LE(0, 36);
    cd.writeUInt32LE(0, 38); cd.writeUInt32LE(0, 42); name.copy(cd, 46);
    const cdBuf = cd;
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054B50, 0); eocd.writeUInt16LE(0, 4); eocd.writeUInt16LE(0, 6);
    eocd.writeUInt16LE(1, 8); eocd.writeUInt16LE(1, 10);
    eocd.writeUInt32LE(cdBuf.length, 12); eocd.writeUInt32LE(lh.length + json.length, 16); eocd.writeUInt16LE(0, 20);
    return Buffer.concat([lh, json, cdBuf, eocd]);
}

// ── Build the shareable text file ─────────────────────────────────────────────
function buildConfigTxt({ vmessLinks, vmessAccounts, sshAccounts, date }) {
    const L = [
        `╔══════════════════════════════════════════╗`,
        `║   JAM-MD Bot — Airtel Uganda Configs    ║`,
        `║   Generated: ${date.padEnd(26)}║`,
        `╚══════════════════════════════════════════╝`,
        ``,
        `━━━ HOW TO IMPORT INTO HTTP CUSTOM ━━━`,
        `1. Open HTTP Custom app`,
        `2. Tap  +  →  Import Config  →  VMess`,
        `3. Paste any vmess:// link below`,
        `4. Tap Connect — try each until one works`,
        ``,
        `━━━ HOW TO IMPORT INTO V2RayNG ━━━`,
        `1. Open V2RayNG → tap + at top right`,
        `2. Choose "Import config from clipboard"`,
        `3. Paste any vmess:// line below`,
        ``,
        `━━━ VMESS LINKS (copy one at a time) ━━━`,
        ``,
    ];

    if (vmessLinks.length > 0) {
        vmessLinks.forEach((link, i) => {
            const meta = vmessAccounts[Math.floor(i / BUGS.length)];
            const bug  = BUGS[i % BUGS.length];
            L.push(`# ${i + 1}. ${meta?.region || '?'} | ${bug.name}${bug.tls ? ' [TLS]' : ''}`);
            L.push(link);
            L.push('');
        });
    } else {
        L.push(`# Auto-fetch blocked. Get a free VMess account from:`);
        L.push(`# → vpnjantit.com  (choose VMess → Singapore server)`);
        L.push(`# Then enter details manually in HTTP Custom → V2Ray`);
        L.push(``);
    }

    L.push(`━━━ AIRTEL UGANDA BUGS / SNI HOSTS ━━━`);
    BUGS.forEach((b, i) => {
        L.push(`${i + 1}. ${b.name}: ${b.host}${b.tls ? '  [TLS/SSL]' : ''}`);
    });

    if (sshAccounts.length > 0) {
        L.push(``);
        L.push(`━━━ SSH ACCOUNTS (HTTP Injector) ━━━`);
        L.push(`(Use the .ehi file sent above — or enter manually)`);
        sshAccounts.forEach((a, i) => {
            L.push(`#${i+1} ${a.source} [${a.region}]`);
            L.push(`  Host:     ${a.host}`);
            L.push(`  Port:     ${a.wsPort}  (WebSocket)`);
            L.push(`  User:     ${a.username}`);
            L.push(`  Pass:     ${a.password}`);
            L.push(`  Expires:  ${a.expiry}`);
            L.push(``);
        });
    }

    L.push(`━━━ MANUAL V2RAY ENTRY IN HTTP CUSTOM ━━━`);
    L.push(`Protocol: VMess`);
    L.push(`Transport: WebSocket (WS)`);
    L.push(`Port: 80  or  443`);
    L.push(`Bug/Host: web.whatsapp.com  or  v.whatsapp.net`);
    L.push(`Path: (see link above or use /)`);
    L.push(`AlterID: 0`);
    L.push(``);
    L.push(`━━━ Generated by JAM-MD Bot ━━━`);

    return L.join('\n');
}

export default {
    command: 'ssh',
    aliases: ['getssh', 'sshaccount', 'freessh', 'airtel', 'ugconfig', 'hcsetup', 'ehi', 'vmess', 'v2ray', 'freenet'],
    category: 'tools',
    description: 'Free SSH + V2Ray VMess configs for Airtel Uganda — importable in HTTP Custom & V2RayNG',
    usage: '.ssh',
    async handler(sock, message, args, context) {
        const chatId = context.chatId || message.key.remoteJid;
        const date   = new Date().toISOString().split('T')[0];

        await sock.sendMessage(chatId, {
            text: '⏳ Fetching free V2Ray + SSH accounts...\n_Up to 30 seconds — please wait_',
        }, { quoted: message });

        try {
            await sock.presenceSubscribe(chatId);
            await sock.sendPresenceUpdate('composing', chatId);
        } catch { }

        // Fetch VMess + SSH in parallel
        const vmessResults = await Promise.all(
            VMESS_PROVIDERS.flatMap(p => p.servers.map(s => fetchVmess(p, s)))
        );
        const sshResults = await Promise.all(
            SSH_PROVIDERS.flatMap(p => p.servers.map(s => fetchSsh(p, s)))
        );

        // Deduplicate
        const vmessAccounts = vmessResults.filter(Boolean).filter((r, i, a) => a.findIndex(x => x.uuid === r.uuid) === i);
        const sshAccounts   = sshResults.filter(Boolean).filter((r, i, a) => a.findIndex(x => x.host === r.host) === i);

        const hasVmess = vmessAccounts.length > 0;
        const hasSsh   = sshAccounts.length > 0;

        // Status message
        const parts = [];
        if (hasVmess) parts.push(`✅ ${vmessAccounts.length} VMess server(s)`);
        if (hasSsh)   parts.push(`✅ ${sshAccounts.length} SSH account(s)`);
        if (!hasVmess && !hasSsh) parts.push(`⚠️ Auto-fetch blocked — sending payloads + setup guide`);

        await sock.sendMessage(chatId, {
            text: parts.join('\n'),
        }, { quoted: message });

        // Build vmess:// links (each account × each bug)
        const vmessLinks = vmessAccounts.flatMap(acc => BUGS.map(bug => vmessUri(acc, bug)));

        // Build and send the main config text file
        const txt = buildConfigTxt({ vmessLinks, vmessAccounts, sshAccounts, date });
        await sock.sendMessage(chatId, {
            document: Buffer.from(txt, 'utf8'),
            fileName: `airtel-ug-v2ray-configs-${date}.txt`,
            mimetype: 'text/plain',
            caption: [
                `📋 *Airtel Uganda V2Ray Configs — ${date}*`,
                ``,
                hasVmess
                    ? `Contains *${vmessLinks.length} vmess:// links* across ${BUGS.length} bug hosts.\nTry each link — first one that connects wins.`
                    : `Contains bug hosts + setup guide for manual entry.`,
                ``,
                `*HTTP Custom:* Import → VMess → paste link`,
                `*V2RayNG:* + → Import from clipboard`,
                `*NapsternetV:* Config → Add → VMess`,
            ].join('\n'),
        }, { quoted: message });

        // Send .ehi file for HTTP Injector users if we got SSH accounts
        if (hasSsh) {
            const acc = sshAccounts[0];
            try {
                const ehi = buildEhi(acc);
                await sock.sendMessage(chatId, {
                    document: ehi,
                    fileName: `airtel-ug-ssh-injector-${date}.ehi`,
                    mimetype: 'application/zip',
                    caption: [
                        `🔐 *HTTP Injector Config* (.ehi)`,
                        ``,
                        `For *HTTP Injector app*:`,
                        `Menu → Import Config → pick this file → Connect`,
                        ``,
                        `SSH: ${acc.host}:${acc.wsPort}`,
                        `User: ${acc.username} | Pass: ${acc.password}`,
                    ].join('\n'),
                }, { quoted: message });
            } catch { }
        }

        // If we got vmess links, also send them as individual messages for easy copy
        if (hasVmess && vmessLinks.length > 0) {
            await sock.sendMessage(chatId, {
                text: [
                    `📡 *Quick Copy — Top VMess Links:*`,
                    ``,
                    ...vmessLinks.slice(0, 3).map((l, i) => `*${i+1}.* ${l}`),
                    ``,
                    `_Paste any link into HTTP Custom → Import → VMess_`,
                ].join('\n'),
            }, { quoted: message });
        }
    },
};
