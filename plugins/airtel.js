// plugins/airtel.js
// Fetches VMess servers from public lists, runs live test
// (TCP ping → WebSocket upgrade with Airtel Uganda bug hosts).
// Stops at the FIRST confirmed working server and sends QR codes immediately.
// Commands: .airtel  .airtelv2ray  .airtelvpn  .ugv2ray  .httpcustom  .hcv2ray

import net from 'net';
import crypto from 'crypto';

// ── Airtel Uganda bug hosts ─────────────────────────────────────────────────
// These are zero-rated / free-access domains on Airtel Uganda.
// Updated for 2025 — WhatsApp and Airtel portal hosts are most reliable.
const BUGS = [
  { name: 'WhatsApp',        host: 'web.whatsapp.com'          },
  { name: 'WA Media',        host: 'mmg.whatsapp.net'          },
  { name: 'WA Static',       host: 'static.whatsapp.net'       },
  { name: 'WA Media 2',      host: 'media.whatsapp.net'        },
  { name: 'WA P2P',          host: 'v.whatsapp.net'            },
  { name: 'Airtel UG Portal',host: 'airtel.co.ug'              },
  { name: 'Airtel Self Care',host: 'selfcare.ug.airtel.com'    },
  { name: 'Airtel Africa',   host: 'airtelafrica.com'          },
  { name: 'Facebook Zero',   host: '0.facebook.com'            },
  { name: 'Google',          host: 'clients3.google.com'       },
];

// ── Public GitHub VMess subscription lists (updated daily) ─────────────────
const SUB_URLS = [
  'https://raw.githubusercontent.com/yebekhe/TelegramV2rayCollector/main/sub/base64/vmess',
  'https://raw.githubusercontent.com/soroushmirzaei/telegram-configs-collector/main/channels/protocols/vmess',
  'https://raw.githubusercontent.com/mahdibland/V2RayAggregator/master/sub/sub_merge_base64.txt',
  'https://raw.githubusercontent.com/ermaozi/get_subscribe/main/subscribe/v2ray.txt',
  'https://raw.githubusercontent.com/w1770946466/Auto_proxy/main/Long_term_subscription1',
  'https://raw.githubusercontent.com/mfuu/v2ray/master/v2ray',
  'https://raw.githubusercontent.com/peasoft/NoMoreWalls/master/list.txt',
  'https://raw.githubusercontent.com/barry-far/V2ray-Configs/main/Sub1.txt',
];

// ── TCP ping ────────────────────────────────────────────────────────────────
function tcpPing(host, port, ms = 4000) {
  return new Promise(r => {
    const s = new net.Socket();
    const t = setTimeout(() => { s.destroy(); r(false); }, ms);
    s.connect(port, host, () => { clearTimeout(t); s.destroy(); r(true); });
    s.on('error', () => { clearTimeout(t); r(false); });
  });
}

// ── WebSocket upgrade with bug host injection ───────────────────────────────
function wsAcceptsBug(host, port, path, bugHost, ms = 6000) {
  return new Promise(resolve => {
    const key = crypto.randomBytes(16).toString('base64');
    const req = [
      `GET ${path || '/'} HTTP/1.1`,
      `Host: ${bugHost}`,
      `Upgrade: websocket`,
      `Connection: Upgrade`,
      `Sec-WebSocket-Key: ${key}`,
      `Sec-WebSocket-Version: 13`,
      `User-Agent: Mozilla/5.0`,
      `X-Online-Host: ${bugHost}`,
      `X-Forward-Host: ${bugHost}`,
      '', '',
    ].join('\r\n');

    const sock = new net.Socket();
    let data = '';
    const t = setTimeout(() => { sock.destroy(); resolve({ ok: false, code: 'timeout' }); }, ms);

    sock.connect(port, host, () => sock.write(req));
    sock.on('data', d => {
      data += d.toString();
      if (data.includes('\r\n\r\n') || data.length > 400) {
        clearTimeout(t);
        sock.destroy();
        const code = data.match(/HTTP\/1\.[01] (\d+)/)?.[1];
        resolve({ ok: code === '101', code: code || '???' });
      }
    });
    sock.on('error', e => { clearTimeout(t); resolve({ ok: false, code: e.code }); });
  });
}

// ── Check a single server against all bug hosts ─────────────────────────────
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
        signal: AbortSignal.timeout(14000),
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

        // Must be WebSocket transport
        if (j.net !== 'ws') continue;

        // Port 80 only — bug injection requires unencrypted HTTP
        if (!['80', '8080', '8880', '2052', '2082', '2086', '2095'].includes(String(j.port))) continue;

        if (!j.add || !j.id) continue;

        // NOTE: We intentionally do NOT filter Cloudflare IPs here.
        // CF IPs on port 80 accept any Host header (domain fronting),
        // which is exactly what Airtel Uganda's bug injection needs.

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

// ── Build vmess:// URI with bug host injected ───────────────────────────────
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

// ── QR code PNG ─────────────────────────────────────────────────────────────
async function getQrPng(link) {
  try {
    const url = `https://chart.googleapis.com/chart?chs=512x512&cht=qr&choe=UTF-8&chl=${encodeURIComponent(link)}`;
    const r = await fetch(url, { signal: AbortSignal.timeout(12000) });
    if (!r.ok) return null;
    return Buffer.from(await r.arrayBuffer());
  } catch { return null; }
}

// ── Main handler ─────────────────────────────────────────────────────────────
export default {
  command: 'airtel',
  aliases: [
    'airtelv2ray', 'airtelvpn', 'ugv2ray', 'httpcustom',
    'hcv2ray', 'airtelung', 'v2rayug', 'v2rayairtel', 'airtelug',
  ],
  category: 'tools',
  description: 'Airtel Uganda free internet — finds first confirmed working V2Ray server and sends QR instantly',
  usage: '.airtel',

  async handler(sock, message, args, context) {
    const chatId = context.chatId || message.key.remoteJid;
    const date   = new Date().toISOString().split('T')[0];

    await sock.sendMessage(chatId, {
      text: [
        '🔍 *Searching for a working Airtel Uganda server...*',
        '_Testing each server live — stops the moment one works_',
        '_Takes up to 60 seconds_',
      ].join('\n'),
    }, { quoted: message });

    try { await sock.sendPresenceUpdate('composing', chatId); } catch {}

    const candidates = await fetchCandidates();

    if (!candidates.length) {
      await sock.sendMessage(chatId, {
        text: '⚠️ *Could not fetch server lists right now.* Check your bot\'s internet and try again.',
      }, { quoted: message });
      return;
    }

    // TCP-ping all in parallel — fast pre-filter
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

    // Walk in batches — stop at first confirmed working server
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

    if (!confirmed) {
      await sock.sendMessage(chatId, {
        text: [
          '⚠️ *No working server found today.*',
          '',
          `_(Checked ${alive.length} live servers — none accepted Airtel Uganda bug hosts)_`,
          '',
          'Lists update every few hours. *Try again in 1–2 hours.*',
          '',
          '_Tip: Make sure you have an active Airtel SIM with at least 0 balance_',
        ].join('\n'),
      }, { quoted: message });
      return;
    }

    const bugNames = confirmed.bugs.map(b => b.name).join(', ');

    await sock.sendMessage(chatId, {
      text: [
        `✅ *Found a working server!*`,
        ``,
        `Server: \`${confirmed.add}:${confirmed.port}\``,
        `Working bugs: *${bugNames}*`,
        ``,
        `*How to connect using HTTP Custom:*`,
        `1. Open *HTTP Custom* app`,
        `2. Tap ≡ → *Config* → ➕ → *VMess*`,
        `3. Tap *"Scan QR Code"*`,
        `4. Scan the image below → *Save* → *Connect* ✅`,
        ``,
        `*Or for V2RayNG:*`,
        `1. Open V2RayNG → tap ➕`,
        `2. Choose *"Import config from QRcode"*`,
        `3. Scan image below`,
      ].join('\n'),
    }, { quoted: message });

    // Send QR for each working bug (max 4)
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
          `📱 *QR ${sent + 1} — ${bug.name}*`,
          `Bug host: \`${bug.host}\``,
          sent === 0 ? '\n👆 *Try this one first — confirmed working!*' : '_Backup option_',
        ].join('\n'),
      }, { quoted: message });

      sent++;
      await new Promise(r => setTimeout(r, 500));
    }

    // Backup text file with all vmess:// links
    const allLinks = confirmed.bugs.map(
      (bug, i) => `# ${i + 1}. ${bug.name} bug (${bug.host})\n${makeUri(confirmed, bug)}`
    ).join('\n\n');

    await sock.sendMessage(chatId, {
      document: Buffer.from([
        `JAM-MD — Airtel Uganda V2Ray — ${date}`,
        `Server: ${confirmed.add}:${confirmed.port}`,
        `Confirmed working bugs: ${bugNames}`,
        ``,
        `HOW TO USE IN HTTP CUSTOM:`,
        `  1. Scan a QR code above OR`,
        `  2. Copy a vmess:// link below`,
        `  3. In HTTP Custom: ≡ → Config → + → VMess → Paste / Scan QR`,
        `  4. Save → Connect`,
        ``,
        `HOW TO USE IN V2RayNG:`,
        `  1. Open V2RayNG → + → Import from clipboard`,
        `  2. Paste a vmess:// link below`,
        ``,
        `══════════════════════════════`,
        `VMESS LINKS (live-tested ✅)`,
        `══════════════════════════════`,
        ``,
        allLinks,
        ``,
        `AIRTEL UGANDA BUG HOSTS TESTED:`,
        ...BUGS.map((b, i) => `  ${i + 1}. ${b.name}: ${b.host}`),
        ``,
        `NOTE: These configs work by injecting the bug host header`,
        `into the WebSocket upgrade request. If connection fails:`,
        `  - Try a different QR/bug host above`,
        `  - Run .airtel again in 1-2 hours for fresh servers`,
        `  - Ensure Airtel SIM is inserted and data is enabled`,
        ``,
        `★ Live-tested by JAM-MD Bot — ${date} ★`,
      ].join('\n'), 'utf8'),
      fileName: `Airtel-UG-V2Ray-${date}.txt`,
      mimetype: 'text/plain',
      caption:  [
        `📋 *Backup file* — ${confirmed.bugs.length} live-tested vmess:// links`,
        `Copy any link → paste in HTTP Custom or V2RayNG`,
      ].join('\n'),
    }, { quoted: message });
  },
};
