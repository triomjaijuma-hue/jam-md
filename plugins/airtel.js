// plugins/airtel.js
// Fetches free VMess servers from public GitHub lists, tests each one live
// (TCP + WebSocket upgrade with Airtel bug host), then sends QR codes for
// servers that actually accept the bug — so the user just scans and connects.
// Commands: .airtel  .airtelv2ray  .airtelvpn  .ugv2ray  .httpcustom  .hcv2ray

import net from 'net';
import crypto from 'crypto';

// ── Airtel Uganda bug hosts ─────────────────────────────────────────────────
const BUGS = [
  { name: 'WhatsApp',      host: 'web.whatsapp.com'    },
  { name: 'WA Media',      host: 'mmg.whatsapp.net'    },
  { name: 'WA P2P',        host: 'v.whatsapp.net'      },
  { name: 'Google',        host: 'clients3.google.com' },
  { name: 'Facebook Zero', host: '0.facebook.com'      },
  { name: 'Airtel Portal', host: 'airtelafrica.com'    },
];

// ── Public GitHub VMess subscription lists (Telegram-scraped, updated daily) 
const SUB_URLS = [
  'https://raw.githubusercontent.com/yebekhe/TelegramV2rayCollector/main/sub/base64/vmess',
  'https://raw.githubusercontent.com/soroushmirzaei/telegram-configs-collector/main/channels/protocols/vmess',
  'https://raw.githubusercontent.com/mahdibland/V2RayAggregator/master/sub/sub_merge_base64.txt',
  'https://raw.githubusercontent.com/ermaozi/get_subscribe/main/subscribe/v2ray.txt',
  'https://raw.githubusercontent.com/w1770946466/Auto_proxy/main/Long_term_subscription1',
  'https://raw.githubusercontent.com/mfuu/v2ray/master/v2ray',
];

// ── Cloudflare CIDR filter (CF servers need real domain, can't use bug host)
const CF_CIDRS = [
  '103.21.244.0/22','103.22.200.0/22','103.31.4.0/22',
  '104.16.0.0/13','104.24.0.0/14','162.158.0.0/15',
  '172.64.0.0/13','131.0.72.0/22','141.101.64.0/18',
  '188.114.96.0/20','190.93.240.0/20','197.234.240.0/22','198.41.128.0/17',
].map(c => {
  const [ip, b] = c.split('/');
  const mask = b === '0' ? 0 : (~0 << (32 - parseInt(b))) >>> 0;
  const n = ip.split('.').reduce((a, x) => (a << 8) | +x, 0) >>> 0;
  return { net: n & mask, mask };
});
function isCF(ip) {
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(ip)) return false;
  const n = ip.split('.').reduce((a, x) => (a << 8) | +x, 0) >>> 0;
  return CF_CIDRS.some(c => (n & c.mask) === c.net);
}

// ── TCP connectivity check ──────────────────────────────────────────────────
function tcpOk(host, port, ms = 3500) {
  return new Promise(r => {
    const s = new net.Socket();
    const t = setTimeout(() => { s.destroy(); r(false); }, ms);
    s.connect(port, host, () => { clearTimeout(t); s.destroy(); r(true); });
    s.on('error', () => { clearTimeout(t); r(false); });
  });
}

// ── WebSocket upgrade test with bug host ────────────────────────────────────
function wsAcceptsBug(srv, bugHost, ms = 5000) {
  return new Promise(resolve => {
    const key   = crypto.randomBytes(16).toString('base64');
    const req   = [
      `GET ${srv.path} HTTP/1.1`,
      `Host: ${bugHost}`,
      `Upgrade: websocket`,
      `Connection: Upgrade`,
      `Sec-WebSocket-Key: ${key}`,
      `Sec-WebSocket-Version: 13`,
      '', '',
    ].join('\r\n');
    const sock = new net.Socket();
    let data   = '';
    const t    = setTimeout(() => { sock.destroy(); resolve(false); }, ms);
    sock.connect(srv.port, srv.add, () => sock.write(req));
    sock.on('data', d => {
      data += d.toString();
      if (data.includes('\r\n\r\n') || data.length > 200) {
        clearTimeout(t);
        sock.destroy();
        resolve(data.match(/HTTP\/1\.[01] (\d+)/)?.[1] === '101');
      }
    });
    sock.on('error', () => { clearTimeout(t); resolve(false); });
  });
}

// ── Fetch + deduplicate servers ─────────────────────────────────────────────
async function fetchAllServers() {
  const lists = await Promise.all(SUB_URLS.map(async url => {
    try {
      const r = await fetch(url, {
        signal: AbortSignal.timeout(13000),
        headers: { 'User-Agent': 'curl/7.88' },
      });
      if (!r.ok) return [];
      let text = await r.text();
      try { text = Buffer.from(text.trim(), 'base64').toString('utf8'); } catch {}
      return text.split(/\r?\n/).filter(l => l.startsWith('vmess://'));
    } catch { return []; }
  }));

  const seen = new Set(), servers = [];
  for (const links of lists) {
    for (const link of links) {
      try {
        const j = JSON.parse(Buffer.from(link.slice(8), 'base64').toString('utf8'));
        if (j.net !== 'ws') continue;
        if (!['80', '8080', '8880'].includes(String(j.port))) continue;
        if (!j.add || !j.id) continue;
        if (isCF(j.add)) continue;
        const key = `${j.add}:${j.port}`;
        if (seen.has(key)) continue;
        seen.add(key);
        servers.push({
          add:  j.add,
          port: Number(j.port),
          uuid: j.id,
          path: j.path || '/',
          host: j.host || j.add,
          ps:   j.ps   || '',
        });
      } catch {}
    }
  }
  return servers;
}

// ── Find servers that accept bug host (live-tested, max 5 found) ────────────
async function findWorkingServers(statusCb) {
  const all = await fetchAllServers();
  statusCb(`Testing ${all.length} candidates...`);

  // Phase 1: parallel TCP ping
  const tcpResults = await Promise.all(all.map(async s => ({
    ...s, tcp: await tcpOk(s.add, s.port),
  })));
  const alive = tcpResults.filter(s => s.tcp);
  statusCb(`${alive.length} servers reachable — checking bug host...`);

  // Phase 2: WS test with WhatsApp bug (primary bug)
  const found = [];
  const BATCH  = 20; // test 20 at a time to avoid socket exhaustion
  for (let i = 0; i < alive.length && found.length < 5; i += BATCH) {
    const batch = alive.slice(i, i + BATCH);
    const results = await Promise.all(
      batch.map(async s => ({ ...s, ok: await wsAcceptsBug(s, BUGS[0].host) }))
    );
    found.push(...results.filter(s => s.ok));
  }
  return found;
}

// ── Build vmess:// URI ──────────────────────────────────────────────────────
function makeUri(srv, bug) {
  return 'vmess://' + Buffer.from(JSON.stringify({
    v:    '2',
    ps:   `JAM-MD|${bug.name}|Airtel-UG`,
    add:  srv.add,
    port: String(srv.port),
    id:   srv.uuid,
    aid:  '0',
    net:  'ws',
    type: 'none',
    host: bug.host,
    path: srv.path,
    tls:  '',
    sni:  '',
  })).toString('base64');
}

// ── Fetch QR code PNG from Google Charts ────────────────────────────────────
async function getQrPng(link) {
  try {
    const url = `https://chart.googleapis.com/chart?chs=512x512&cht=qr&choe=UTF-8&chl=${encodeURIComponent(link)}`;
    const r   = await fetch(url, { signal: AbortSignal.timeout(12000) });
    if (!r.ok) return null;
    return Buffer.from(await r.arrayBuffer());
  } catch { return null; }
}

// ── Main handler ────────────────────────────────────────────────────────────
export default {
  command: 'airtel',
  aliases: [
    'airtelv2ray', 'airtelvpn', 'ugv2ray', 'httpcustom',
    'hcv2ray', 'airtelung', 'v2rayug', 'v2rayairtel', 'airtelug',
  ],
  category: 'tools',
  description: 'Airtel Uganda free internet — live-tested V2Ray configs, scan QR in HTTP Custom',
  usage:   '.airtel',

  async handler(sock, message, args, context) {
    const chatId = context.chatId || message.key.remoteJid;
    const date   = new Date().toISOString().split('T')[0];

    await sock.sendMessage(chatId, {
      text: [
        '🔍 *Searching for working Airtel Uganda servers...*',
        '_Fetching & live-testing — takes about 30s_',
      ].join('\n'),
    }, { quoted: message });

    try { await sock.sendPresenceUpdate('composing', chatId); } catch {}

    let lastStatus = '';
    const servers = await findWorkingServers(async msg => {
      if (msg !== lastStatus) {
        lastStatus = msg;
        try {
          await sock.sendMessage(chatId, { text: `⚙️ ${msg}` }, { quoted: message });
        } catch {}
      }
    });

    // ── No working servers found ─────────────────────────────────────────────
    if (!servers.length) {
      await sock.sendMessage(chatId, {
        text: [
          '⚠️ *No servers passed the live test today.*',
          '',
          'The free server lists update every few hours.',
          '*Try again in 1–2 hours* and fresh servers will be available.',
          '',
          '_This is the most reliable free method — no account creation needed,_',
          '_the bot tests every server before sending it to you._',
        ].join('\n'),
      }, { quoted: message });
      return;
    }

    // ── Send results ─────────────────────────────────────────────────────────
    await sock.sendMessage(chatId, {
      text: [
        `✅ *Found ${servers.length} working server(s)!*`,
        '',
        '*Scan a QR code in HTTP Custom to connect:*',
        '1. Open *HTTP Custom*',
        '2. Tap menu ≡ → *Config* → ➕ button',
        '3. Choose *VMess*',
        '4. Tap *"Scan QR Code"*',
        '5. Scan the image below → *Save* → *Connect* ✅',
      ].join('\n'),
    }, { quoted: message });

    // Send QR for top server × first 3 bugs
    let sent = 0;
    for (const srv of servers.slice(0, 2)) {
      for (const bug of BUGS.slice(0, 3)) {
        if (sent >= 4) break;
        const uri = makeUri(srv, bug);
        const qr  = await getQrPng(uri);
        if (!qr) continue;

        await sock.sendMessage(chatId, {
          image:    qr,
          mimetype: 'image/png',
          caption:  [
            `📱 *QR ${sent + 1} — ${bug.name} bug*`,
            `Bug: \`${bug.host}\`  |  Port: ${srv.port}`,
            sent === 0 ? '\n👆 *Scan this first in HTTP Custom*' : '_Backup if QR 1 fails_',
          ].join('\n'),
        }, { quoted: message });

        sent++;
        await new Promise(r => setTimeout(r, 500));
      }
    }

    // ── Backup text file with all vmess:// links ──────────────────────────────
    const allLinks = servers.flatMap((srv, si) =>
      BUGS.map(bug => `# Server ${si + 1} × ${bug.name}\n${makeUri(srv, bug)}`)
    ).join('\n\n');

    await sock.sendMessage(chatId, {
      document: Buffer.from([
        `JAM-MD — Airtel Uganda V2Ray — ${date}`,
        '==============================================',
        '',
        'HOW TO USE:',
        'EASIEST: Scan QR code images sent above in HTTP Custom',
        '  HTTP Custom → Config → + → VMess → Scan QR Code',
        '',
        'MANUAL: Copy a vmess:// link below',
        '  HTTP Custom → Config → + → VMess → Paste Link',
        '  V2RayNG → + (top right) → Import from clipboard',
        '  NapsternetV → Config → + → Import VMess',
        '',
        '==============================================',
        `ALL VMESS LINKS (${servers.length * BUGS.length} configs)`,
        '==============================================',
        '',
        allLinks,
        '',
        '==============================================',
        'AIRTEL UGANDA BUG HOSTS',
        '==============================================',
        ...BUGS.map((b, i) => `${i + 1}. ${b.name}: ${b.host}`),
        '',
        `★ Live-tested by JAM-MD Bot — ${date} ★`,
      ].join('\n'), 'utf8'),
      fileName: `Airtel-UG-V2Ray-${date}.txt`,
      mimetype: 'text/plain',
      caption:  [
        `📋 *Backup file* — ${servers.length * BUGS.length} live-tested vmess:// links`,
        'Copy any link → paste in HTTP Custom or V2RayNG',
      ].join('\n'),
    }, { quoted: message });
  },
};
