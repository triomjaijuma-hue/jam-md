// plugins/airtel.js — Dedicated Airtel Uganda V2Ray command
// Sends QR code images to scan directly in HTTP Custom / V2RayNG / NapsternetV
// Commands: .airtel  .airtelv2ray  .airtelvpn  .ugv2ray  .httpcustom  .hcv2ray

const BUGS = [
    { name: 'WhatsApp WS',   host: 'web.whatsapp.com',    tls: '' },
    { name: 'WhatsApp CDN',  host: 'mmg.whatsapp.net',    tls: '' },
    { name: 'WhatsApp P2P',  host: 'v.whatsapp.net',      tls: '' },
    { name: 'Google Free',   host: 'clients3.google.com', tls: '' },
    { name: 'Facebook Zero', host: '0.facebook.com',      tls: '' },
    { name: 'Airtel Portal', host: 'airtelafrica.com',    tls: '' },
    { name: 'WA Secure TLS', host: 'web.whatsapp.com',   tls: 'tls' },
    { name: 'Cloudflare',    host: 'speed.cloudflare.com',tls: 'tls' },
];

const PROVIDERS = [
    { name: 'VPNJantit',  url: () => 'https://www.vpnjantit.com/create-free-vmess',
      servers: [
          { id: 'sg1.vpnjantit.com', region: 'SG 🇸🇬', port: 80, path: '/vpnjantit-com' },
          { id: 'de1.vpnjantit.com', region: 'DE 🇩🇪', port: 80, path: '/vpnjantit-com' },
          { id: 'us1.vpnjantit.com', region: 'US 🇺🇸', port: 80, path: '/vpnjantit-com' },
      ],
    },
    { name: 'SSHOcean',   url: s => `https://www.sshocean.com/create-vmess/${s}/`,
      servers: [{ id: 'sg1', region: 'SG 🇸🇬', port: 80, path: '/sshocean' }],
    },
    { name: 'SSHKitty',   url: () => 'https://www.sshkitty.com/create-vmess',
      servers: [{ id: 'sg-1.sshkitty.com', region: 'SG 🇸🇬', port: 80, path: '/sshkitty' }],
    },
];

const UA = {
    'Content-Type': 'application/x-www-form-urlencoded',
    'User-Agent': 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36',
    'Accept': 'text/html,*/*;q=0.8',
};

function rnd(n) {
    return Array.from({ length: n }, () => 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)]).join('');
}

async function fetchVmess(prov, srv) {
    try {
        const ctrl = new AbortController();
        const tid  = setTimeout(() => ctrl.abort(), 25000);
        const u = 'jam' + rnd(6), p = rnd(8) + 'Aa1!';
        const res = await fetch(prov.url(srv.id), {
            method: 'POST', signal: ctrl.signal,
            headers: { ...UA, Referer: prov.url(srv.id) },
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
        return { source: prov.name, region: srv.region, host, port, uuid, path };
    } catch { return null; }
}

function makeUri(acc, bug) {
    return 'vmess://' + Buffer.from(JSON.stringify({
        v: '2', ps: `JAM-MD|${acc.region}|${bug.name}`,
        add: acc.host, port: String(acc.port),
        id: acc.uuid, aid: '0',
        net: 'ws', type: 'none',
        host: bug.host, path: acc.path,
        tls: bug.tls, sni: bug.tls ? bug.host : '',
    })).toString('base64');
}

async function getQr(vmessLink) {
    const url = `https://chart.googleapis.com/chart?chs=512x512&cht=qr&choe=UTF-8&chl=${encodeURIComponent(vmessLink)}`;
    try {
        const ctrl = new AbortController();
        setTimeout(() => ctrl.abort(), 15000);
        const res = await fetch(url, { signal: ctrl.signal });
        if (!res.ok) return null;
        return Buffer.from(await res.arrayBuffer());
    } catch { return null; }
}

export default {
    command: 'airtel',
    aliases: ['airtelv2ray', 'airtelvpn', 'ugv2ray', 'httpcustom', 'hcv2ray', 'airtelung', 'v2rayug', 'v2rayairtel'],
    category: 'tools',
    description: 'Airtel Uganda V2Ray — scan QR code in HTTP Custom to connect instantly',
    usage: '.airtel',

    async handler(sock, message, args, context) {
        const chatId = context.chatId || message.key.remoteJid;
        const date   = new Date().toISOString().split('T')[0];

        await sock.sendMessage(chatId, {
            text: [
                `📡 *JAM-MD — Airtel Uganda V2Ray*`,
                ``,
                `Fetching free servers + building QR codes...`,
                `_Trying ${PROVIDERS.reduce((n,p)=>n+p.servers.length,0)} VMess servers in parallel_`,
                `_Please wait up to 30 seconds_ ⏳`,
            ].join('\n'),
        }, { quoted: message });

        try { await sock.presenceSubscribe(chatId); await sock.sendPresenceUpdate('composing', chatId); } catch {}

        const results = await Promise.all(PROVIDERS.flatMap(p => p.servers.map(s => fetchVmess(p, s))));
        const seen = new Set();
        const accs = results.filter(r => r && !seen.has(r.uuid) && seen.add(r.uuid));

        if (!accs.length) {
            await sock.sendMessage(chatId, {
                text: [
                    `⚠️ *All VMess providers blocked auto-signup today.*`,
                    ``,
                    `*Get a free account manually (30 seconds):*`,
                    `1. Open → vpnjantit.com`,
                    `2. Choose VMess → Singapore`,
                    `3. Sign up free`,
                    `4. Copy: UUID, Host, Port, WS Path`,
                    ``,
                    `*Then in HTTP Custom:*`,
                    `Config → + → VMess → Fill details`,
                    `Bug/Host: web.whatsapp.com`,
                    `Transport: WebSocket`,
                    `Port: 80`,
                    ``,
                    `*Best Airtel UG bugs to try:*`,
                    ...BUGS.slice(0,5).map(b=>`• ${b.host}${b.tls?' [TLS]':''}`),
                ].join('\n'),
            }, { quoted: message });
            return;
        }

        const allLinks = accs.flatMap(acc => BUGS.map(bug => ({ acc, bug, uri: makeUri(acc, bug) })));

        await sock.sendMessage(chatId, {
            text: [
                `✅ *Got ${accs.length} server(s) → ${allLinks.length} configs!*`,
                ``,
                `*Sending QR codes now...*`,
                `📱 Open HTTP Custom → Config → + → VMess → Scan QR`,
                `_Try each QR until one connects_ 🚀`,
            ].join('\n'),
        }, { quoted: message });

        // ── Send QR codes (first account × first 4 bugs) ────────────────────
        const acc = accs[0];
        const toSend = BUGS.slice(0, 5);
        let qrCount = 0;

        for (let i = 0; i < toSend.length; i++) {
            const bug = toSend[i];
            const uri = makeUri(acc, bug);
            const qr  = await getQr(uri);
            if (!qr) continue;

            await sock.sendMessage(chatId, {
                image: qr,
                mimetype: 'image/png',
                caption: [
                    `📱 *QR ${qrCount + 1} — ${bug.name}*`,
                    `Bug: \`${bug.host}\`${bug.tls ? ' [TLS]' : ''}`,
                    `Server: ${acc.source} ${acc.region}`,
                    ``,
                    qrCount === 0
                        ? `*Steps to connect:*\n1. Open HTTP Custom\n2. Menu → Config → + button\n3. Select "VMess"\n4. Tap "Scan QR Code"\n5. Point at this image → Save → Connect ✅`
                        : `_Backup — try this if QR ${qrCount} didn't work_`,
                ].join('\n'),
            }, { quoted: message });

            qrCount++;
            await new Promise(r => setTimeout(r, 700));
        }

        // ── Also send all-in-one backup text ─────────────────────────────────
        await new Promise(r => setTimeout(r, 500));

        const txtBody = allLinks.map(({ acc: a, bug: b, uri }, i) =>
            `# ${i+1}. ${a.source} ${a.region} × ${b.name}\n${uri}`
        ).join('\n\n');

        const txt = [
            `JAM-MD ★ Airtel Uganda V2Ray — ${date}`,
            ``,
            `╔══════════════════════════════════╗`,
            `║  HOW TO USE — HTTP CUSTOM        ║`,
            `╚══════════════════════════════════╝`,
            `EASIEST: Scan the QR code images above`,
            `  HTTP Custom → Config → + → VMess → Scan QR`,
            ``,
            `ALTERNATIVE: Copy-paste a vmess:// link`,
            `  HTTP Custom → Config → + → VMess → Paste Link`,
            ``,
            `FOR V2RayNG APP:`,
            `  Open V2RayNG → + (top right) → Import from clipboard`,
            `  Then paste any vmess:// link below`,
            ``,
            `╔══════════════════════════════════╗`,
            `║  ${allLinks.length} VMESS LINKS BELOW            ║`,
            `╚══════════════════════════════════╝`,
            ``,
            txtBody,
            ``,
            `╔══════════════════════════════════╗`,
            `║  AIRTEL UGANDA BUG HOSTS         ║`,
            `╚══════════════════════════════════╝`,
            ...BUGS.map((b, i) => `${i+1}. ${b.name}: ${b.host}${b.tls?' [TLS]':''}`),
            ``,
            `★ Generated by JAM-MD Bot ★`,
        ].join('\n');

        await sock.sendMessage(chatId, {
            document: Buffer.from(txt, 'utf8'),
            fileName: `AIRTEL_UG_V2RAY_${date}.txt`,
            mimetype: 'text/plain',
            caption: [
                `📋 *Backup: All ${allLinks.length} vmess:// links*`,
                ``,
                `If QR scan doesn't work:`,
                `• Open this file`,
                `• Copy any vmess:// line`,
                `• Paste in HTTP Custom → Config → + → VMess`,
            ].join('\n'),
        }, { quoted: message });
    },
};
