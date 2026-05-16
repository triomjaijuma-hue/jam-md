// plugins/ssh.js — V2Ray + SSH configs for Airtel Uganda
// Sends QR code images users scan directly in HTTP Custom / V2RayNG / NapsternetV
// Commands: .ssh  .airtel  .freenet  .ugconfig  .vmess  .v2ray

// ── Airtel Uganda bug hosts ──────────────────────────────────────────────────
const BUGS = [
    { name: 'WhatsApp WS',   host: 'web.whatsapp.com',    tls: '' },
    { name: 'WhatsApp CDN',  host: 'mmg.whatsapp.net',    tls: '' },
    { name: 'WhatsApp P2P',  host: 'v.whatsapp.net',      tls: '' },
    { name: 'Google Free',   host: 'clients3.google.com', tls: '' },
    { name: 'Facebook Zero', host: '0.facebook.com',      tls: '' },
    { name: 'Airtel Portal', host: 'airtelafrica.com',    tls: '' },
    { name: 'WA Secure',     host: 'web.whatsapp.com',    tls: 'tls' },
];

// ── Free VMess providers ─────────────────────────────────────────────────────
const VMESS_PROVIDERS = [
    {
        name: 'VPNJantit',
        servers: [
            { id: 'sg1.vpnjantit.com', region: 'Singapore', port: 80, path: '/vpnjantit-com' },
            { id: 'us1.vpnjantit.com', region: 'USA',       port: 80, path: '/vpnjantit-com' },
            { id: 'de1.vpnjantit.com', region: 'Germany',   port: 80, path: '/vpnjantit-com' },
        ],
    },
    {
        name: 'SSHKitty',
        servers: [
            { id: 'sg-1.sshkitty.com', region: 'Singapore', port: 80, path: '/sshkitty' },
        ],
    },
    {
        name: 'SSHOcean',
        servers: [
            { id: 'sg1', region: 'Singapore', port: 80, path: '/sshocean' },
        ],
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
        url: s => `https://www.fastssh.com/page/create-ssh-account/server/${s}/`,
        parseHost: h => h.match(/((?:\d{1,3}\.){3}\d{1,3})/)?.[0],
        parsePort: h => h.match(/Port.*?(\d{2,5})/)?.[1] || '22',
        parseWs:   h => h.match(/WebSocket.*?(80|443|8080|8880)/i)?.[1] || '80',
    },
    {
        name: 'SpeedSSH',
        servers: [{ id: 'sg1.speedssh.com', region: 'Singapore' }],
        url: s => `https://www.speedssh.com/create-ssh/${s}/`,
        parseHost: h => h.match(/((?:\d{1,3}\.){3}\d{1,3})/)?.[0],
        parsePort: h => h.match(/Port.*?(\d{2,5})/)?.[1] || '22',
        parseWs:   h => h.match(/WebSocket.*?(80|443|8080|8880)/i)?.[1] || '80',
    },
];

const UA = {
    'Content-Type': 'application/x-www-form-urlencoded',
    'User-Agent':   'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36',
    'Accept':       'text/html,*/*;q=0.8',
};

function rnd(n) {
    return Array.from({ length: n }, () => 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)]).join('');
}

// ── Fetch VMess account ──────────────────────────────────────────────────────
async function fetchVmess(providerName, srv) {
    const urls = {
        VPNJantit: () => 'https://www.vpnjantit.com/create-free-vmess',
        SSHKitty:  () => 'https://www.sshkitty.com/create-vmess',
        SSHOcean:  () => `https://www.sshocean.com/create-vmess/${srv.id}/`,
    };
    const url = urls[providerName]?.();
    if (!url) return null;
    try {
        const ctrl = new AbortController();
        const tid  = setTimeout(() => ctrl.abort(), 25000);
        const u = 'jam' + rnd(6), p = rnd(8) + 'Aa1!';
        const res = await fetch(url, {
            method: 'POST', signal: ctrl.signal,
            headers: { ...UA, Referer: url },
            body: new URLSearchParams({ username: u, password: p, repassword: p, server: srv.id }).toString(),
        });
        clearTimeout(tid);
        if (!res.ok) return null;
        const html = await res.text();
        const uuid = html.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)?.[0];
        if (!uuid) return null;
        const host = html.match(/(?:Host|Server|IP)\D*((?:\d{1,3}\.){3}\d{1,3})/i)?.[1] || srv.id;
        const path = html.match(/[Pp]ath\D*(\/[\w\-/]+)/)?.[1] || srv.path;
        const port = parseInt(html.match(/[Pp]ort\D*(\d{2,5})/)?.[1] || srv.port);
        return { source: providerName, region: srv.region, host, port, uuid, path };
    } catch { return null; }
}

// ── Fetch SSH account ────────────────────────────────────────────────────────
async function fetchSsh(prov, srv) {
    try {
        const ctrl = new AbortController();
        const tid  = setTimeout(() => ctrl.abort(), 20000);
        const u = 'jam' + rnd(6), p = rnd(8) + 'Aa1!';
        const res = await fetch(prov.url(srv.id), {
            method: 'POST', signal: ctrl.signal,
            headers: { ...UA, Referer: prov.url(srv.id) },
            body: `username=${u}&password=${p}&repassword=${p}`,
        });
        clearTimeout(tid);
        if (!res.ok) return null;
        const html = await res.text();
        const host = prov.parseHost(html);
        if (!host || !html.includes(u)) return null;
        return { source: prov.name, region: srv.region, host, port: prov.parsePort(html), wsPort: prov.parseWs(html), user: u, pass: p };
    } catch { return null; }
}

// ── Build vmess:// URI ───────────────────────────────────────────────────────
function vmessUri(acc, bug) {
    return 'vmess://' + Buffer.from(JSON.stringify({
        v: '2', ps: `JAM-MD|${acc.region}|${bug.name}`,
        add: acc.host, port: String(acc.port),
        id: acc.uuid, aid: '0',
        net: 'ws', type: 'none',
        host: bug.host, path: acc.path,
        tls: bug.tls, sni: bug.tls ? bug.host : '',
    })).toString('base64');
}

// ── Fetch QR code image as Buffer (Google Charts — free, no key needed) ─────
async function fetchQr(link) {
    const url = `https://chart.googleapis.com/chart?chs=512x512&cht=qr&choe=UTF-8&chl=${encodeURIComponent(link)}`;
    try {
        const ctrl = new AbortController();
        setTimeout(() => ctrl.abort(), 15000);
        const res = await fetch(url, { signal: ctrl.signal });
        if (!res.ok) return null;
        const ab = await res.arrayBuffer();
        return Buffer.from(ab);
    } catch { return null; }
}

// ── Build HTTP Injector .ehi ZIP for SSH ─────────────────────────────────────
function crc32(buf) {
    let c = 0xFFFFFFFF;
    for (const b of buf) { c ^= b; for (let j = 0; j < 8; j++) c = (c & 1) ? (c >>> 1) ^ 0xEDB88320 : c >>> 1; }
    return (c ^ 0xFFFFFFFF) >>> 0;
}
function buildEhi(acc) {
    const cfgJson = Buffer.from(JSON.stringify({
        SSH: { SSHHost: acc.host, SSHPort: acc.wsPort, SSHUsername: acc.user, SSHPassword: acc.pass, SSHNote: `JAM-MD [${acc.source} ${acc.region}]` },
        Payload: { Payload: 'GET / HTTP/1.1[crlf]Host: web.whatsapp.com[crlf]Upgrade: websocket[crlf][crlf]', PayloadNote: 'WhatsApp SNI' },
        DNS: { DNSHost: '8.8.8.8', DNSPort: '53' },
    }, null, 2), 'utf8');
    const d = new Date();
    const time = ((d.getHours()<<11)|(d.getMinutes()<<5)|(d.getSeconds()>>1))&0xFFFF;
    const date = (((d.getFullYear()-1980)<<9)|((d.getMonth()+1)<<5)|d.getDate())&0xFFFF;
    const nm = Buffer.from('config.json');
    const crc = crc32(cfgJson);
    const lh = Buffer.alloc(30+nm.length);
    lh.writeUInt32LE(0x04034B50,0); lh.writeUInt16LE(20,4); lh.writeUInt16LE(0,6);
    lh.writeUInt16LE(0,8); lh.writeUInt16LE(time,10); lh.writeUInt16LE(date,12);
    lh.writeUInt32LE(crc,14); lh.writeUInt32LE(cfgJson.length,18); lh.writeUInt32LE(cfgJson.length,22);
    lh.writeUInt16LE(nm.length,26); lh.writeUInt16LE(0,28); nm.copy(lh,30);
    const cd = Buffer.alloc(46+nm.length);
    cd.writeUInt32LE(0x02014B50,0); cd.writeUInt16LE(20,4); cd.writeUInt16LE(20,6);
    cd.writeUInt16LE(0,8); cd.writeUInt16LE(0,10); cd.writeUInt16LE(time,12);
    cd.writeUInt16LE(date,14); cd.writeUInt32LE(crc,16); cd.writeUInt32LE(cfgJson.length,20);
    cd.writeUInt32LE(cfgJson.length,24); cd.writeUInt16LE(nm.length,28); cd.writeUInt16LE(0,30);
    cd.writeUInt16LE(0,32); cd.writeUInt16LE(0,34); cd.writeUInt16LE(0,36);
    cd.writeUInt32LE(0,38); cd.writeUInt32LE(0,42); nm.copy(cd,46);
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054B50,0); eocd.writeUInt16LE(0,4); eocd.writeUInt16LE(0,6);
    eocd.writeUInt16LE(1,8); eocd.writeUInt16LE(1,10);
    eocd.writeUInt32LE(cd.length,12); eocd.writeUInt32LE(lh.length+cfgJson.length,16); eocd.writeUInt16LE(0,20);
    return Buffer.concat([lh, cfgJson, cd, eocd]);
}

export default {
    command: 'ssh',
    aliases: ['getssh', 'sshaccount', 'freessh', 'airtel', 'ugconfig', 'hcsetup', 'ehi', 'vmess', 'v2ray', 'freenet'],
    category: 'tools',
    description: 'Free V2Ray + SSH configs for Airtel Uganda — scan QR code in HTTP Custom to connect',
    usage: '.ssh',

    async handler(sock, message, args, context) {
        const chatId = context.chatId || message.key.remoteJid;
        const date   = new Date().toISOString().split('T')[0];

        await sock.sendMessage(chatId, {
            text: '⏳ *Fetching free V2Ray accounts...*\n_Getting servers + building QR codes — up to 30s_',
        }, { quoted: message });

        try { await sock.presenceSubscribe(chatId); await sock.sendPresenceUpdate('composing', chatId); } catch {}

        // Fetch VMess + SSH in parallel
        const vmessJobs = VMESS_PROVIDERS.flatMap(p => p.servers.map(s => fetchVmess(p.name, s)));
        const sshJobs   = SSH_PROVIDERS.flatMap(p => p.servers.map(s => fetchSsh(p, s)));
        const [vmessRaw, sshRaw] = await Promise.all([Promise.all(vmessJobs), Promise.all(sshJobs)]);

        const seen1 = new Set(), seen2 = new Set();
        const vmessAccs = vmessRaw.filter(r => r && !seen1.has(r.uuid) && seen1.add(r.uuid));
        const sshAccs   = sshRaw.filter(r => r && !seen2.has(r.host) && seen2.add(r.host));

        if (!vmessAccs.length && !sshAccs.length) {
            await sock.sendMessage(chatId, {
                text: [
                    '⚠️ *All providers blocked auto-signup today.*',
                    '',
                    '*Get a free VMess account manually:*',
                    '→ vpnjantit.com → Choose VMess → Singapore',
                    '→ Note: UUID, Host, Port, WS Path',
                    '',
                    '*Then in HTTP Custom:*',
                    '+ → V2Ray → Add VMess → enter details',
                    '',
                    '*Best Airtel Uganda bugs:*',
                    ...BUGS.slice(0,4).map(b => `• ${b.host}`),
                ].join('\n'),
            }, { quoted: message });
            return;
        }

        const links = vmessAccs.flatMap(acc => BUGS.map(bug => vmessUri(acc, bug)));

        await sock.sendMessage(chatId, {
            text: `✅ Got ${vmessAccs.length} VMess server(s) → ${links.length} configs!\n\n*Sending QR codes — scan in HTTP Custom to connect instantly* 📱`,
        }, { quoted: message });

        // ── Send QR codes for first account × each bug ──────────────────────
        if (vmessAccs.length > 0) {
            const acc = vmessAccs[0];
            let sent = 0;
            for (let i = 0; i < Math.min(BUGS.length, 4); i++) {
                const bug  = BUGS[i];
                const link = vmessUri(acc, bug);
                const qr   = await fetchQr(link);
                if (!qr) continue;

                await sock.sendMessage(chatId, {
                    image: qr,
                    mimetype: 'image/png',
                    caption: [
                        sent === 0
                            ? `📱 *QR Code ${i+1}/${Math.min(BUGS.length,4)} — Scan this in HTTP Custom!*`
                            : `📱 *QR Code ${i+1}/${Math.min(BUGS.length,4)} — Backup bug*`,
                        ``,
                        `*Bug/SNI:* ${bug.host}${bug.tls ? ' [TLS]' : ''}`,
                        `*Server:* ${acc.source} ${acc.region}`,
                        ``,
                        sent === 0 ? [
                            `*How to scan in HTTP Custom:*`,
                            `1. Open HTTP Custom`,
                            `2. Tap ☰ → Config → +`,
                            `3. Choose "VMess" → "Scan QR"`,
                            `4. Point camera at this image`,
                            `5. Tap Connect ✅`,
                        ].join('\n') : `_Try this if the first one doesn't connect_`,
                    ].join('\n'),
                }, { quoted: message });

                sent++;
                await new Promise(r => setTimeout(r, 600));
            }
        }

        // ── Also send SSH .ehi for HTTP Injector users ───────────────────────
        if (sshAccs.length > 0) {
            try {
                const ehi = buildEhi(sshAccs[0]);
                await sock.sendMessage(chatId, {
                    document: ehi,
                    fileName: `airtel-ug-injector-${date}.ehi`,
                    mimetype: 'application/zip',
                    caption: [
                        `🔐 *HTTP Injector Config* (.ehi)`,
                        ``,
                        `*For HTTP Injector app:*`,
                        `Menu → Import Config → pick this file → Connect`,
                        ``,
                        `Host: ${sshAccs[0].host}:${sshAccs[0].wsPort}`,
                        `User: ${sshAccs[0].user} | Pass: ${sshAccs[0].pass}`,
                    ].join('\n'),
                }, { quoted: message });
            } catch {}
        }

        // ── Text backup file with all links ──────────────────────────────────
        const allLinks = links.map((l, i) => {
            const bug = BUGS[i % BUGS.length];
            const acc = vmessAccs[Math.floor(i / BUGS.length)];
            return `# ${i+1}. ${acc.source} ${acc.region} × ${bug.name}\n${l}`;
        }).join('\n\n');

        const txt = [
            `JAM-MD — Airtel Uganda V2Ray Configs — ${date}`,
            ``,
            `HOW TO USE IN HTTP CUSTOM:`,
            `Option A (EASIEST): Scan the QR code images sent above`,
            `  → Open HTTP Custom → Config → + → VMess → Scan QR`,
            ``,
            `Option B: Copy a vmess:// link below → paste in HTTP Custom`,
            `  → Open HTTP Custom → Config → + → VMess → Paste Link`,
            ``,
            `Option C: Use V2RayNG (easier import)`,
            `  → Open V2RayNG → + → Import from clipboard → paste link`,
            ``,
            `═══════════════════════════════`,
            `ALL VMESS LINKS (${links.length} total)`,
            `═══════════════════════════════`,
            ``,
            allLinks,
            ``,
            `═══════════════════════════════`,
            `AIRTEL UGANDA BUG HOSTS`,
            `═══════════════════════════════`,
            ...BUGS.map((b, i) => `${i+1}. ${b.name}: ${b.host}${b.tls ? ' [TLS]' : ''}`),
        ].join('\n');

        await sock.sendMessage(chatId, {
            document: Buffer.from(txt, 'utf8'),
            fileName: `airtel-ug-v2ray-${date}.txt`,
            mimetype: 'text/plain',
            caption: `📋 All ${links.length} vmess:// links + instructions\n_Backup: copy any link → paste in HTTP Custom_`,
        }, { quoted: message });
    },
};
