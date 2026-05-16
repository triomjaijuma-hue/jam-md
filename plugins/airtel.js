// plugins/airtel.js
// Pulls free VMess servers from public GitHub lists (updated daily, no signup needed)
// Sends QR code images → user scans in HTTP Custom to connect on Airtel Uganda free data
// Commands: .airtel  .airtelv2ray  .airtelvpn  .ugv2ray  .httpcustom  .hcv2ray  .v2rayug

const BUGS = [
  { name: 'WhatsApp',       host: 'web.whatsapp.com'    },
  { name: 'WA Media',       host: 'mmg.whatsapp.net'    },
  { name: 'WA P2P',         host: 'v.whatsapp.net'      },
  { name: 'Google',         host: 'clients3.google.com' },
  { name: 'Facebook Zero',  host: '0.facebook.com'      },
  { name: 'Airtel Portal',  host: 'airtelafrica.com'    },
];

// Public GitHub free-server subscription lists (base64-encoded vmess:// lines, updated daily)
const SUB_URLS = [
  'https://raw.githubusercontent.com/ermaozi/get_subscribe/main/subscribe/v2ray.txt',
  'https://raw.githubusercontent.com/w1770946466/Auto_proxy/main/Long_term_subscription1',
  'https://raw.githubusercontent.com/mfuu/v2ray/master/v2ray',
  'https://raw.githubusercontent.com/freefq/free/master/v2',
  'https://raw.githubusercontent.com/peasoft/NoMoreWalls/master/list.txt',
];

async function fetchServers() {
  const results = await Promise.all(SUB_URLS.map(async url => {
    try {
      const ctrl = new AbortController();
      setTimeout(() => ctrl.abort(), 14000);
      const r = await fetch(url, {
        signal: ctrl.signal,
        headers: { 'User-Agent': 'Mozilla/5.0' },
      });
      if (!r.ok) return [];
      let text = await r.text();
      try { text = Buffer.from(text.trim(), 'base64').toString('utf8'); } catch {}
      return text.split(/\r?\n/).filter(l => l.startsWith('vmess://'));
    } catch { return []; }
  }));

  // Parse and filter for port-80/8080/8880 WebSocket servers
  const seen = new Set();
  const servers = [];
  for (const links of results) {
    for (const link of links) {
      try {
        const j = JSON.parse(Buffer.from(link.slice(8), 'base64').toString('utf8'));
        const port = String(j.port);
        if (j.net !== 'ws') continue;
        if (!['80','8080','8880'].includes(port)) continue;
        if (!j.add || !j.id) continue;
        const key = `${j.add}:${j.port}:${j.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        servers.push({ add: j.add, port: j.port, uuid: j.id, path: j.path || '/', ps: j.ps || '' });
      } catch {}
    }
  }
  return servers;
}

function makeVmessUri(srv, bug) {
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

async function sendQr(sock, chatId, message, vmessLink, caption) {
  try {
    const url = `https://chart.googleapis.com/chart?chs=512x512&cht=qr&choe=UTF-8&chl=${encodeURIComponent(vmessLink)}`;
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 12000);
    const r = await fetch(url, { signal: ctrl.signal });
    if (!r.ok) return false;
    const img = Buffer.from(await r.arrayBuffer());
    await sock.sendMessage(chatId, { image: img, mimetype: 'image/png', caption }, { quoted: message });
    return true;
  } catch { return false; }
}

export default {
  command: 'airtel',
  aliases: ['airtelv2ray','airtelvpn','ugv2ray','httpcustom','hcv2ray','airtelung','v2rayug','v2rayairtel','airtelug'],
  category: 'tools',
  description: 'Airtel Uganda free internet — scan QR code in HTTP Custom to connect',
  usage: '.airtel',

  async handler(sock, message, args, context) {
    const chatId = context.chatId || message.key.remoteJid;

    await sock.sendMessage(chatId, {
      text: '⏳ *Fetching Airtel Uganda V2Ray configs...*\n_Loading free servers — please wait_',
    }, { quoted: message });

    try { await sock.sendPresenceUpdate('composing', chatId); } catch {}

    const servers = await fetchServers();

    if (!servers.length) {
      await sock.sendMessage(chatId, {
        text: [
          '⚠️ *Could not load free servers right now.*',
          '',
          '*Try again in a few minutes*, or get a server manually:',
          '→ Visit *vpnjantit.com* on any connection',
          '→ Create free VMess account (Singapore)',
          '→ Come back and use *.airtel* again',
        ].join('\n'),
      }, { quoted: message });
      return;
    }

    // Use up to 3 servers × first 3 bugs = up to 9 QR codes, but send max 4
    const picked = servers.slice(0, 3);
    const date = new Date().toISOString().split('T')[0];

    await sock.sendMessage(chatId, {
      text: [
        `✅ *Got ${servers.length} free servers!*`,
        '',
        '*Scan any QR code below in HTTP Custom to connect instantly:*',
        '1️⃣ Open *HTTP Custom*',
        '2️⃣ Tap menu → *Config* → ➕ button',
        '3️⃣ Choose *VMess*',
        '4️⃣ Tap *"Scan QR Code"*',
        '5️⃣ Scan the image → *Save* → *Connect* ✅',
        '',
        '_If one QR doesn\'t connect, try the next one_',
      ].join('\n'),
    }, { quoted: message });

    let sent = 0;
    for (let si = 0; si < picked.length && sent < 4; si++) {
      const srv = picked[si];
      for (let bi = 0; bi < BUGS.length && sent < 4; bi++) {
        const bug = BUGS[bi];
        const uri = makeVmessUri(srv, bug);
        const ok = await sendQr(sock, chatId, message, uri, [
          `📱 *QR ${sent + 1} — ${bug.name} bug*`,
          `Bug host: \`${bug.host}\``,
          `Server: \`${srv.add}:${srv.port}\``,
          sent === 0 ? '\n👆 *Scan this first*' : '',
        ].join('\n').trim());
        if (ok) sent++;
        await new Promise(r => setTimeout(r, 500));
      }
    }

    // Backup .txt with all vmess:// links
    const allLinks = picked.flatMap(srv =>
      BUGS.map((bug, bi) => `# Server${picked.indexOf(srv)+1} × ${bug.name}\n${makeVmessUri(srv, bug)}`)
    ).join('\n\n');

    const txt = [
      `JAM-MD — Airtel Uganda Free Internet — ${date}`,
      '================================================',
      '',
      'HOW TO USE:',
      'EASIEST: Scan the QR code images sent above',
      '  → HTTP Custom → Config → + → VMess → Scan QR',
      '',
      'MANUAL: Copy any vmess:// link below',
      '  → HTTP Custom → Config → + → VMess → Paste Link',
      '  → OR: V2RayNG → + → Import from clipboard',
      '',
      '================================================',
      `ALL VMESS LINKS (${picked.length * BUGS.length} total)`,
      '================================================',
      '',
      allLinks,
      '',
      '================================================',
      'AIRTEL UGANDA BUG HOSTS',
      '================================================',
      ...BUGS.map((b, i) => `${i + 1}. ${b.name}: ${b.host}`),
      '',
      '★ Generated by JAM-MD Bot ★',
    ].join('\n');

    await sock.sendMessage(chatId, {
      document: Buffer.from(txt, 'utf8'),
      fileName: `Airtel-UG-V2Ray-${date}.txt`,
      mimetype: 'text/plain',
      caption: [
        `📋 *Backup file* — all ${picked.length * BUGS.length} vmess:// links`,
        '',
        'If QR scan fails:',
        '• Open this file',
        '• Copy a vmess:// line',
        '• Paste in HTTP Custom → Config → + → VMess',
      ].join('\n'),
    }, { quoted: message });
  },
};
