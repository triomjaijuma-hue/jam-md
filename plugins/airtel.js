// plugins/airtel.js
// Fetches VMess servers from public lists, runs the same live test as .check
// (TCP ping → WebSocket upgrade with Airtel bug host), stops at the FIRST
// confirmed working server and sends its QR codes immediately.
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

// ── Cloudflare IP filter — CF servers require real domain, reject bug hosts ─
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

// ── Shared test functions (same logic as .check) ────────────────────────────
function tcpPing(host, port, ms = 3500) {
  return new Promise(r => {
    const s = new net.Socket();
    const t = setTimeout(() => { s.destroy(); r(false); }, ms);
    s.connect(port, host, () => { clearTimeout(t); s.destroy(); r(true); });
    s.on('error', () => { clearTimeout(t); r(false); });
  });
}

function wsAcceptsBug(host, port, path, bugHost, ms = 5000) {
  return new Promise(resolve => {
    const key = crypto.randomBytes(16).toString('base64');
    const req = [
      `GET ${path} HTTP/1.1`,
      `Host: ${bugHost}`,
      `Upgrade: websocket`,
      `Connection: Upgrade`,
      `Sec-WebSocket-Key: ${key}`,
      `Sec-WebSocket-Version: 13`,
      '', '',
    ].join('\r\n');
    const sock = new net.Socket();
    let data = '';
    const t = setTimeout(() => { sock.destroy(); resolve({ ok: false, code: 'timeout' }); }, ms);
    sock.connect(port, host, () => sock.write(req));
    sock.on('data', d => {
      data += d.toString();
      if (data.includes('\r\n\r\n') || data.length > 300) {
        clearTimeout(t);
        sock.destroy();
        const code = data.match(/HTTP\/1\.[01] (\d+)/)?.[1];
        resolve({ ok: code === '101', code: code || '???' });
      }
    });
    sock.on('error', e => { clearTimeout(t); resolve({ ok: false, code: e.code }); });
  });
}

// Runs .check logic on a single server: TCP → WS with each bug host
// Returns the server + which bugs work, or null if none pass
async function checkServer(srv) {
  const alive = await tcpPing(srv.add, srv.port);
  if (!alive) return null;
  const bugResults = await Promise.all(
    BUGS.map(async bug => ({
      ...bug,
      ok: (await wsAcceptsBug(srv.add, srv.port, srv.path, bug.host)).ok,
    }))
  );
  const working = bugResults.filter(b => b.ok);
  if (!working.length) return null;
  return { ...srv, bugs: working };
}

// ── Fetch + deduplicate all candidate servers ───────────────────────────────
async function fetchCandidates() {
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

// ── QR code PNG via Google Charts ───────────────────────────────────────────
async function getQrPng(link) {
  try {
    const url = `https://chart.googleapis.com/chart?chs=512x512&cht=qr&choe=UTF-8&chl=${encodeURIComponent(link)}`;
    const r = await fetch(url, { signal: AbortSignal.timeout(12000) });
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
  description: 'Airtel Uganda free internet — finds first confirmed working server and sends QR instantly',
  usage: '.airtel',

  async handler(sock, message, args, context) {
    const chatId = context.chatId || message.key.remoteJid;
    const date   = new Date().toISOString().split('T')[0];

    await sock.sendMessage(chatId, {
      text: [
        '🔍 *Searching for a working Airtel Uganda server...*',
        '_Testing each server live (same as .check) — stops the moment one works_',
        '_Takes up to 45 seconds_',
      ].join('\n'),
    }, { quoted: message });

    try { await sock.sendPresenceUpdate('composing', chatId); } catch {}

    // Fetch all candidates
    const candidates = await fetchCandidates();

    // TCP-ping all in parallel first (fast filter)
    const tcpResults = await Promise.all(
      candidates.map(async s => ({ ...s, alive: await tcpPing(s.add, s.port) }))
    );
    const alive = tcpResults.filter(s => s.alive);

    if (!alive.length) {
      await sock.sendMessage(chatId, {
        text: '⚠️ *All servers offline right now.* Try again in 1–2 hours.',
      }, { quoted: message });
      return;
    }

    // Walk alive servers in batches of 10 — stop at first confirmed working one
    const BATCH = 10;
    let confirmed = null;
    let tested = 0;

    for (let i = 0; i < alive.length && !confirmed; i += BATCH) {
      const batch = alive.slice(i, i + BATCH);
      tested += batch.length;

      const results = await Promise.all(batch.map(checkServer));
      confirmed = results.find(r => r !== null) || null;

      if (!confirmed && tested < alive.length) {
        try {
          await sock.sendMessage(chatId, {
            text: `⚙️ _Checked ${tested}/${alive.length} — still searching..._`,
          }, { quoted: message });
        } catch {}
      }
    }

    // ── No working server found ─────────────────────────────────────────────
    if (!confirmed) {
      await sock.sendMessage(chatId, {
        text: [
          '⚠️ *No server passed the full test today.*',
          '',
          `_(Checked ${alive.length} live servers — all rejected Airtel bug hosts)_`,
          '',
          'The lists update every few hours. *Try again in 1–2 hours.*',
        ].join('\n'),
      }, { quoted: message });
      return;
    }

    // ── Found one — send confirmation + QR codes ────────────────────────────
    const bugNames = confirmed.bugs.map(b => b.name).join(', ');

    await sock.sendMessage(chatId, {
      text: [
        `✅ *Found a working server!*`,
        ``,
        `Server: \`${confirmed.add}:${confirmed.port}\``,
        `Working bugs: *${bugNames}*`,
        ``,
        `*Scan a QR code in HTTP Custom to connect:*`,
        `1. Open *HTTP Custom*`,
        `2. Menu ≡ → *Config* → ➕`,
        `3. Choose *VMess*`,
        `4. Tap *"Scan QR Code"*`,
        `5. Scan image below → *Save* → *Connect* ✅`,
      ].join('\n'),
    }, { quoted: message });

    // Send QR for each confirmed working bug
    let sent = 0;
    for (const bug of confirmed.bugs) {
      if (sent >= 4) break;
      const uri = makeUri(confirmed, bug);
      const qr  = await getQrPng(uri);
      if (!qr) continue;

      await sock.sendMessage(chatId, {
        image:    qr,
        mimetype: 'image/png',
        caption:  [
          `📱 *QR ${sent + 1} — ${bug.name} bug*`,
          `Bug: \`${bug.host}\``,
          sent === 0 ? '\n👆 *Scan this first — confirmed working!*' : '_Backup option_',
        ].join('\n'),
      }, { quoted: message });

      sent++;
      await new Promise(r => setTimeout(r, 500));
    }

    // Backup text file
    const allLinks = confirmed.bugs.map(
      (bug, i) => `# ${i + 1}. ${bug.name} bug\n${makeUri(confirmed, bug)}`
    ).join('\n\n');

    await sock.sendMessage(chatId, {
      document: Buffer.from([
        `JAM-MD — Airtel Uganda V2Ray — ${date}`,
        `Server: ${confirmed.add}:${confirmed.port}`,
        `Confirmed working bugs: ${bugNames}`,
        ``,
        `HOW TO USE:`,
        `  Scan QR codes above → HTTP Custom → VMess → Scan QR`,
        `  OR copy a vmess:// link below → paste in HTTP Custom or V2RayNG`,
        ``,
        `══════════════════════════════`,
        `VMESS LINKS (live-tested ✅)`,
        `══════════════════════════════`,
        ``,
        allLinks,
        ``,
        `AIRTEL UGANDA BUG HOSTS:`,
        ...BUGS.map((b, i) => `  ${i + 1}. ${b.name}: ${b.host}`),
        ``,
        `★ Live-tested by JAM-MD Bot — ${date} ★`,
      ].join('\n'), 'utf8'),
      fileName: `Airtel-UG-V2Ray-${date}.txt`,
      mimetype: 'text/plain',
      caption:  [
        `📋 *Backup* — ${confirmed.bugs.length} live-tested vmess:// links`,
        `Copy any link → paste in HTTP Custom or V2RayNG`,
      ].join('\n'),
    }, { quoted: message });
  },
};
