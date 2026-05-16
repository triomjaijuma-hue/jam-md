// plugins/airtel.js
// Dedicated Airtel Uganda V2Ray command — HTTP Custom importable VMess configs
// Commands: .airtel  .airtelv2ray  .airtelvpn  .ugv2ray  .httpcustom

const AIRTEL_BUGS = [
    { name: 'WhatsApp WS',   host: 'web.whatsapp.com',    tls: '' },
    { name: 'WhatsApp CDN',  host: 'mmg.whatsapp.net',    tls: '' },
    { name: 'WhatsApp P2P',  host: 'v.whatsapp.net',      tls: '' },
    { name: 'Google Free',   host: 'clients3.google.com', tls: '' },
    { name: 'Facebook Zero', host: '0.facebook.com',      tls: '' },
    { name: 'Airtel Portal', host: 'airtelafrica.com',    tls: '' },
    { name: 'WA Secure TLS', host: 'web.whatsapp.com',   tls: 'tls' },
    { name: 'CF Workers',    host: 'speed.cloudflare.com',tls: 'tls' },
];

const PROVIDERS = [
    {
        name: 'VPNJantit',
        servers: [
            { id: 'sg1.vpnjantit.com', region: 'SG', port: 80,  path: '/vpnjantit-com' },
            { id: 'de1.vpnjantit.com', region: 'DE', port: 80,  path: '/vpnjantit-com' },
            { id: 'us1.vpnjantit.com', region: 'US', port: 80,  path: '/vpnjantit-com' },
        ],
        fetch: async (srv) => {
            const u = 'jam' + rnd(6), p = rnd(8) + 'A1!';
            const ctrl = new AbortController();
            const tid  = setTimeout(() => ctrl.abort(), 25000);
            try {
                const r = await fetch('https://www.vpnjantit.com/create-free-vmess', {
                    method: 'POST', signal: ctrl.signal,
                    headers: UA_HEADERS,
                    body: new URLSearchParams({ username: u, password: p, repassword: p, server: srv.id }).toString(),
                });
                clearTimeout(tid);
                if (!r.ok) return null;
                const html = await r.text();
                const uuid = html.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)?.[0];
                if (!uuid) return null;
                const host = html.match(/(?:Host|Server|IP)\D*((?:\d{1,3}\.){3}\d{1,3})/i)?.[1] || srv.id;
                const path = html.match(/[Pp]ath\D*(\/[\w\-/]+)/)?.[1] || srv.path;
                const port = parseInt(html.match(/[Pp]ort\D*(\d{2,5})/)?.[1] || srv.port);
                return { provider: 'VPNJantit', region: srv.region, host, port, uuid, path };
            } catch { clearTimeout(tid); return null; }
        },
    },
    {
        name: 'SSHOcean',
        servers: [
            { id: 'sg1', region: 'SG', port: 80, path: '/sshocean' },
        ],
        fetch: async (srv) => {
            const u = 'jam' + rnd(6), p = rnd(8) + 'A1!';
            const ctrl = new AbortController();
            const tid  = setTimeout(() => ctrl.abort(), 20000);
            try {
                const r = await fetch(`https://www.sshocean.com/create-vmess/${srv.id}/`, {
                    method: 'POST', signal: ctrl.signal,
                    headers: UA_HEADERS,
                    body: new URLSearchParams({ username: u, password: p, repassword: p }).toString(),
                });
                clearTimeout(tid);
                if (!r.ok) return null;
                const html = await r.text();
                const uuid = html.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)?.[0];
                if (!uuid) return null;
                const host = html.match(/((?:\d{1,3}\.){3}\d{1,3})/)?.[0] || srv.id;
                return { provider: 'SSHOcean', region: srv.region, host, port: srv.port, uuid, path: srv.path };
            } catch { clearTimeout(tid); return null; }
        },
    },
];

const UA_HEADERS = {
    'Content-Type': 'application/x-www-form-urlencoded',
    'User-Agent': 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
};

function rnd(len) {
    const c = 'abcdefghijklmnopqrstuvwxyz0123456789';
    return Array.from({ length: len }, () => c[Math.floor(Math.random() * c.length)]).join('');
}

function makeVmessUri(acc, bug) {
    return 'vmess://' + Buffer.from(JSON.stringify({
        v: '2', ps: `JAM-MD|${acc.region}|${bug.name}`,
        add: acc.host, port: String(acc.port),
        id: acc.uuid, aid: '0',
        net: 'ws', type: 'none',
        host: bug.host, path: acc.path,
        tls: bug.tls, sni: bug.tls ? bug.host : '',
    })).toString('base64');
}

function buildFile(links, accounts, date) {
    const header = [
        `╔═══════════════════════════════════════════╗`,
        `║  JAM-MD ✦ Airtel Uganda V2Ray Configs    ║`,
        `║  ${date}  —  HTTP Custom / V2RayNG        ║`,
        `╚═══════════════════════════════════════════╝`,
        ``,
        `▶ HOW TO USE IN HTTP CUSTOM`,
        `  1. Open HTTP Custom app`,
        `  2. Tap the + button → "Import Config"`,
        `  3. Select "VMess" then paste a link below`,
        `  4. Tap Save → Connect`,
        `  5. If one doesn't work, try the next`,
        ``,
        `▶ HOW TO USE IN V2RayNG`,
        `  1. Open V2RayNG → tap + (top right)`,
        `  2. "Import config from clipboard"`,
        `  3. Paste any vmess:// link below`,
        ``,
        `▶ HOW TO USE IN NapsternetV`,
        `  Config tab → + → Import VMess Link`,
        ``,
        `════════════════════════════════════════════`,
        `  VMESS LINKS  (${links.length} total)`,
        `════════════════════════════════════════════`,
        ``,
    ];

    const body = links.length > 0
        ? links.flatMap((link, i) => {
            const accIdx = Math.floor(i / AIRTEL_BUGS.length);
            const bugIdx = i % AIRTEL_BUGS.length;
            const acc = accounts[accIdx];
            const bug = AIRTEL_BUGS[bugIdx];
            return [
                `# ${i + 1}/${links.length} | ${acc.provider} ${acc.region} × ${bug.name}${bug.tls ? ' [TLS]' : ''}`,
                link, '',
            ];
          })
        : [
            `# Auto-fetch blocked today. Get free VMess manually:`,
            `#  → https://vpnjantit.com  (VMess → Singapore)`,
            `#  → Note: UUID, Host, Port, WS Path`,
            `# Then in HTTP Custom: + → Manual → fill in details`,
            `#`,
            `# Bug hosts to use:`,
            ...AIRTEL_BUGS.map(b => `#   ${b.name}: ${b.host}${b.tls ? ' [TLS]' : ''}`),
            ``,
          ];

    const footer = [
        `════════════════════════════════════════════`,
        `  AIRTEL UGANDA BUGS / SNI REFERENCE`,
        `════════════════════════════════════════════`,
        ...AIRTEL_BUGS.map((b, i) => `  ${i+1}. ${b.name.padEnd(16)} ${b.host}${b.tls ? '  [TLS]' : ''}`),
        ``,
        `════════════════════════════════════════════`,
        `  MANUAL ENTRY GUIDE (HTTP Custom → V2Ray)`,
        `════════════════════════════════════════════`,
        `  Protocol:   VMess`,
        `  Transport:  WebSocket (WS)`,
        `  Port:       80 (or 443 for TLS bugs)`,
        `  AlterID:    0`,
        `  Security:   auto`,
        `  UUID:       (from VMess link above)`,
        `  Host/SNI:   web.whatsapp.com`,
        `  Path:       (from VMess link above)`,
        ``,
        `  ★ Generated by JAM-MD WhatsApp Bot ★`,
    ];

    return [...header, ...body, ...footer].join('\n');
}

export default {
    command: 'airtel',
    aliases: ['airtelv2ray', 'airtelvpn', 'ugv2ray', 'httpcustom', 'hcv2ray', 'airtelung', 'v2rayug'],
    category: 'tools',
    description: 'Airtel Uganda V2Ray VMess configs — importable in HTTP Custom, V2RayNG, NapsternetV',
    usage: '.airtel',
    async handler(sock, message, args, context) {
        const chatId = context.chatId || message.key.remoteJid;
        const date   = new Date().toISOString().split('T')[0];

        await sock.sendMessage(chatId, {
            text: [
                `📡 *Fetching Airtel Uganda V2Ray configs...*`,
                `_Trying ${PROVIDERS.reduce((n,p)=>n+p.servers.length,0)} free VMess servers — up to 30s_`,
            ].join('\n'),
        }, { quoted: message });

        try {
            await sock.presenceSubscribe(chatId);
            await sock.sendPresenceUpdate('composing', chatId);
        } catch { }

        // Fetch all providers in parallel
        const results = await Promise.all(
            PROVIDERS.flatMap(p => p.servers.map(s => p.fetch(s)))
        );
        const seen = new Set();
        const accounts = results.filter(r => {
            if (!r || seen.has(r.uuid)) return false;
            seen.add(r.uuid);
            return true;
        });

        // Build vmess:// links
        const links = accounts.flatMap(acc => AIRTEL_BUGS.map(bug => makeVmessUri(acc, bug)));

        // Status
        if (accounts.length > 0) {
            await sock.sendMessage(chatId, {
                text: `✅ Got ${accounts.length} VMess server(s) → ${links.length} configs across ${AIRTEL_BUGS.length} Airtel bugs!`,
            }, { quoted: message });
        } else {
            await sock.sendMessage(chatId, {
                text: `⚠️ All providers blocked auto-signup today.\n_Sending bug hosts + setup guide so you can enter manually._`,
            }, { quoted: message });
        }

        // Send the config file
        await sock.sendMessage(chatId, {
            document: Buffer.from(buildFile(links, accounts, date), 'utf8'),
            fileName: `AIRTEL_UG_V2RAY_${date}.txt`,
            mimetype: 'text/plain',
            caption: [
                `📁 *Airtel Uganda V2Ray — ${date}*`,
                ``,
                accounts.length > 0
                    ? `*${links.length} vmess:// links* ready to import`
                    : `Bug hosts + manual setup guide`,
                ``,
                `*HTTP Custom:* + → Import → VMess → paste link`,
                `*V2RayNG:* + → Import from clipboard`,
                `*NapsternetV:* Config → + → Import VMess`,
                ``,
                `_Try each link — first one that works, keep it! 🚀_`,
            ].join('\n'),
        }, { quoted: message });

        // If we have links, send top 3 directly for quick copy
        if (links.length > 0) {
            await new Promise(r => setTimeout(r, 1000));
            await sock.sendMessage(chatId, {
                text: [
                    `⚡ *Quick Copy — Best 3 Links:*`,
                    ``,
                    `1️⃣ ${links[0]}`,
                    ``,
                    `2️⃣ ${links[1] || links[0]}`,
                    ``,
                    `3️⃣ ${links[2] || links[0]}`,
                    ``,
                    `_Copy → HTTP Custom → + → Import → VMess → paste_`,
                ].join('\n'),
            }, { quoted: message });
        }
    },
};
