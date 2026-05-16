// plugins/airtel.js
// Generates VLESS-over-WebSocket configs for the JAM-MD Cloudflare Worker proxy.
// The proxy runs on Cloudflare's IPs (accessible on Airtel Uganda for free).
// Setup: run .airtelsetup <worker-url> <uuid> once, then .airtel works forever.
// Commands: .airtel  .airtelv2ray  .airtelvpn  .ugv2ray  .httpcustom  .hcv2ray

// ── Airtel Uganda bug hosts (injected into VLESS host field) ─────────────────
const BUGS = [
  { name: 'WhatsApp',         host: 'web.whatsapp.com'       },
  { name: 'WA Media',         host: 'mmg.whatsapp.net'       },
  { name: 'WA Static',        host: 'static.whatsapp.net'    },
  { name: 'Airtel UG',        host: 'airtel.co.ug'           },
  { name: 'Airtel Self Care', host: 'selfcare.ug.airtel.com' },
  { name: 'Facebook Zero',    host: '0.facebook.com'         },
  { name: 'Google',           host: 'clients3.google.com'    },
];

// ── QR code PNG via Google Charts ────────────────────────────────────────────
async function getQrPng(text) {
  try {
    const url = `https://chart.googleapis.com/chart?chs=512x512&cht=qr&choe=UTF-8&chl=${encodeURIComponent(text)}`;
    const r = await fetch(url, { signal: AbortSignal.timeout(12000) });
    if (!r.ok) return null;
    return Buffer.from(await r.arrayBuffer());
  } catch { return null; }
}

// ── Build VLESS URI for V2RayNG / HTTP Custom ─────────────────────────────────
function makeVlessUri(workerHost, uuid, bugHost, remark) {
  const params = new URLSearchParams({
    type:       'ws',
    host:       bugHost,
    path:       '/vless',
    encryption: 'none',
    security:   'none',
  });
  return `vless://${uuid}@${workerHost}:80?${params.toString()}#${encodeURIComponent(remark)}`;
}

// ── Build VMess URI (for broader app compatibility) ────────────────────────────
function makeVmessUri(workerHost, uuid, bugHost, remark) {
  return 'vmess://' + Buffer.from(JSON.stringify({
    v: '2', ps: remark,
    add: workerHost, port: '80', id: uuid,
    aid: '0', net: 'ws', type: 'none',
    host: bugHost, path: '/vless', tls: '',
  })).toString('base64');
}

// ── Read stored worker config ──────────────────────────────────────────────────
async function getConfig(store) {
  try {
    const raw = await store.get('airtel_cf_config');
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

export default {
  command: 'airtel',
  aliases: [
    'airtelv2ray', 'airtelvpn', 'ugv2ray', 'httpcustom',
    'hcv2ray', 'airtelung', 'v2rayug', 'v2rayairtel', 'airtelug',
  ],
  category: 'tools',
  description: 'Airtel Uganda free internet via Cloudflare Worker — sends working VLESS configs & QR codes',
  usage: '.airtel',

  async handler(sock, message, args, context) {
    const chatId = context.chatId || message.key.remoteJid;
    const date   = new Date().toISOString().split('T')[0];
    const store  = context.store || context.db;

    // ── Check config exists ────────────────────────────────────────────────
    const config = store ? await getConfig(store) : null;

    if (!config || !config.workerHost || !config.uuid) {
      await sock.sendMessage(chatId, {
        text: [
          '⚙️ *Airtel proxy not configured yet.*',
          '',
          'The bot owner needs to run this once:',
          '`.airtelsetup <worker-url> <uuid>`',
          '',
          'Example:',
          '`.airtelsetup jam-md-proxy.yourname.workers.dev 550e8400-e29b-41d4-a716-446655440000`',
          '',
          '_See README in the cloudflare/ folder for setup steps._',
        ].join('\n'),
      }, { quoted: message });
      return;
    }

    const { workerHost, uuid } = config;

    await sock.sendMessage(chatId, {
      text: [
        '📡 *Generating Airtel Uganda free internet configs...*',
        `_Using Cloudflare Worker: ${workerHost}_`,
      ].join('\n'),
    }, { quoted: message });

    try { await sock.sendPresenceUpdate('composing', chatId); } catch {}

    // ── Send explanation ───────────────────────────────────────────────────
    await sock.sendMessage(chatId, {
      text: [
        `✅ *Airtel Uganda Free Internet — ${date}*`,
        ``,
        `*How to connect (HTTP Custom):*`,
        `1. Download *HTTP Custom* from Play Store`,
        `2. Tap ≡ → *Config* → ➕ → *VLESS* (or VMess)`,
        `3. Tap *"Scan QR Code"* and scan an image below`,
        `4. Save → *Connect* ✅`,
        ``,
        `*Or for V2RayNG:*`,
        `1. Open V2RayNG → tap ➕ → *Import from QRcode*`,
        `2. Scan image below → Connect`,
        ``,
        `_Scan the first QR first. If it fails, try the next one._`,
      ].join('\n'),
    }, { quoted: message });

    // ── Send QR for each bug host ─────────────────────────────────────────
    let sent = 0;
    const allLinks = [];

    for (const bug of BUGS) {
      if (sent >= 5) break;

      const vlessUri = makeVlessUri(workerHost, uuid, bug.host, `JAM-MD|${bug.name}|Airtel-UG`);
      const vmessUri = makeVmessUri(workerHost, uuid, bug.host, `JAM-MD|${bug.name}|Airtel-UG`);

      // Use VLESS URI for QR (broader support)
      const qr = await getQrPng(vlessUri);
      if (!qr) continue;

      await sock.sendMessage(chatId, {
        image:    qr,
        mimetype: 'image/png',
        caption:  [
          `📱 *Config ${sent + 1} — ${bug.name}*`,
          `Bug host: \`${bug.host}\``,
          `Server: \`${workerHost}:80\``,
          sent === 0 ? '\n👆 *Try this one first!*' : '',
        ].join('\n').trim(),
      }, { quoted: message });

      allLinks.push(`# ${sent + 1}. ${bug.name} (${bug.host})`);
      allLinks.push(`VLESS: ${vlessUri}`);
      allLinks.push(`VMess: ${vmessUri}`);
      allLinks.push('');

      sent++;
      await new Promise(r => setTimeout(r, 400));
    }

    // ── Backup text file ───────────────────────────────────────────────────
    await sock.sendMessage(chatId, {
      document: Buffer.from([
        `JAM-MD — Airtel Uganda Free Internet — ${date}`,
        `Cloudflare Worker: ${workerHost}`,
        ``,
        `HOW TO USE:`,
        `  HTTP Custom: ≡ → Config → + → VLESS → Scan QR above`,
        `  V2RayNG: + → Import from clipboard → paste a VLESS link below`,
        ``,
        `TROUBLESHOOTING:`,
        `  - Try each bug host one by one — some work better than others`,
        `  - Make sure Airtel SIM is active (zero balance is fine)`,
        `  - Toggle airplane mode on/off before connecting`,
        `  - If all fail: contact bot owner to check the Cloudflare Worker`,
        ``,
        `══════════════════════════════════`,
        `CONFIGS (all bug hosts)`,
        `══════════════════════════════════`,
        ``,
        ...allLinks,
        `★ Generated by JAM-MD Bot — ${date} ★`,
      ].join('\n'), 'utf8'),
      fileName: `Airtel-UG-Configs-${date}.txt`,
      mimetype: 'text/plain',
      caption: `📋 *Backup* — ${sent} configs with different bug hosts\nCopy any VLESS link → paste in V2RayNG or HTTP Custom`,
    }, { quoted: message });
  },
};
