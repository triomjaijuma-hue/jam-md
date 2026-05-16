// plugins/ssh.js — SSH + V2Ray configs for Airtel Uganda
// Same server-list approach as airtel.js — no signup, always works
// Commands: .ssh  .freenet  .ugconfig  .vmess  .v2ray  .sshairtel

const BUGS = [
  { name: 'WhatsApp',       host: 'web.whatsapp.com'    },
  { name: 'WA Media',       host: 'mmg.whatsapp.net'    },
  { name: 'WA P2P',         host: 'v.whatsapp.net'      },
  { name: 'Google',         host: 'clients3.google.com' },
  { name: 'Facebook Zero',  host: '0.facebook.com'      },
  { name: 'Airtel Portal',  host: 'airtelafrica.com'    },
];

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
      const r = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (!r.ok) return [];
      let text = await r.text();
      try { text = Buffer.from(text.trim(), 'base64').toString('utf8'); } catch {}
      return text.split(/\r?\n/).filter(l => l.startsWith('vmess://'));
    } catch { return []; }
  }));

  const seen = new Set(), servers = [];
  for (const links of results) {
    for (const link of links) {
      try {
        const j = JSON.parse(Buffer.from(link.slice(8), 'base64').toString('utf8'));
        if (j.net !== 'ws' || !['80','8080','8880'].includes(String(j.port)) || !j.add || !j.id) continue;
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
    v: '2', ps: `JAM-MD|${bug.name}|SSH-VPN`,
    add: srv.add, port: String(srv.port),
    id: srv.uuid, aid: '0',
    net: 'ws', type: 'none',
    host: bug.host, path: srv.path,
    tls: '', sni: '',
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

// Try to get an SSH account (best-effort, optional)
async function fetchSshAccount() {
  const providers = [
    { url: 'https://www.fastssh.com/page/create-ssh-account/server/sg1-fastssh/', host_re: /((?:\d{1,3}\.){3}\d{1,3})/, port_re: /Port.*?(\d+)/i },
    { url: 'https://www.speedssh.com/create-ssh/sg1.speedssh.com/', host_re: /((?:\d{1,3}\.){3}\d{1,3})/, port_re: /Port.*?(\d+)/i },
  ];
  const u = 'jam' + Math.random().toString(36).slice(2,8);
  const p = Math.random().toString(36).slice(2,10) + 'Aa1!';
  for (const prov of providers) {
    try {
      const ctrl = new AbortController();
      setTimeout(() => ctrl.abort(), 18000);
      const r = await fetch(prov.url, {
        method: 'POST', signal: ctrl.signal,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Mozilla/5.0' },
        body: `username=${u}&password=${p}&repassword=${p}`,
      });
      if (!r.ok) continue;
      const html = await r.text();
      const host = html.match(prov.host_re)?.[1];
      const port = html.match(prov.port_re)?.[1] || '22';
      const wsPort = html.match(/WebSocket.*?(\d+)/i)?.[1] || '80';
      if (host && html.includes(u)) return { host, port, wsPort, user: u, pass: p };
    } catch {}
  }
  return null;
}

// Build .ehi file for HTTP Injector
function buildEhi(acc) {
  const cfg = Buffer.from(JSON.stringify({
    SSH: { SSHHost: acc.host, SSHPort: acc.wsPort, SSHUsername: acc.user, SSHPassword: acc.pass, SSHNote: 'JAM-MD Airtel UG' },
    Payload: { Payload: 'GET / HTTP/1.1[crlf]Host: web.whatsapp.com[crlf]Upgrade: websocket[crlf][crlf]' },
    DNS: { DNSHost: '8.8.8.8', DNSPort: '53' },
  }, null, 2));
  function u16le(n) { const b = Buffer.alloc(2); b.writeUInt16LE(n); return b; }
  function u32le(n) { const b = Buffer.alloc(4); b.writeUInt32LE(n); return b; }
  let crc = 0xFFFFFFFF;
  for (const b of cfg) { crc ^= b; for (let j=0;j<8;j++) crc=(crc&1)?(crc>>>1)^0xEDB88320:crc>>>1; }
  crc = (crc^0xFFFFFFFF)>>>0;
  const d = new Date();
  const time = ((d.getHours()<<11)|(d.getMinutes()<<5)|(d.getSeconds()>>1))&0xFFFF;
  const date = (((d.getFullYear()-1980)<<9)|((d.getMonth()+1)<<5)|d.getDate())&0xFFFF;
  const nm = Buffer.from('config.json');
  const lh = Buffer.concat([
    u32le(0x04034B50),u16le(20),u16le(0),u16le(0),u16le(time),u16le(date),
    u32le(crc),u32le(cfg.length),u32le(cfg.length),u16le(nm.length),u16le(0),nm,
  ]);
  const cd = Buffer.concat([
    u32le(0x02014B50),u16le(20),u16le(20),u16le(0),u16le(0),u16le(time),u16le(date),
    u32le(crc),u32le(cfg.length),u32le(cfg.length),u16le(nm.length),u16le(0),u16le(0),u16le(0),u16le(0),
    u32le(0),u32le(0),nm,
  ]);
  const eocd = Buffer.concat([
    u32le(0x06054B50),u16le(0),u16le(0),u16le(1),u16le(1),
    u32le(cd.length),u32le(lh.length+cfg.length),u16le(0),
  ]);
  return Buffer.concat([lh, cfg, cd, eocd]);
}

export default {
  command: 'ssh',
  aliases: ['getssh','sshaccount','freessh','sshairtel','sshvpn','freenet','ugconfig','vmess','v2ray'],
  category: 'tools',
  description: 'Free V2Ray + SSH configs for Airtel Uganda free internet',
  usage: '.ssh',

  async handler(sock, message, args, context) {
    const chatId = context.chatId || message.key.remoteJid;
    const date = new Date().toISOString().split('T')[0];

    await sock.sendMessage(chatId, {
      text: '⏳ *Loading free V2Ray servers...*\n_Fetching from public server lists — please wait_',
    }, { quoted: message });

    try { await sock.sendPresenceUpdate('composing', chatId); } catch {}

    // Fetch V2Ray servers + SSH account in parallel
    const [servers, sshAcc] = await Promise.all([fetchServers(), fetchSshAccount()]);

    if (!servers.length && !sshAcc) {
      await sock.sendMessage(chatId, {
        text: '⚠️ *Could not load servers right now.*\n\nPlease try again in a few minutes.',
      }, { quoted: message });
      return;
    }

    const picked = servers.slice(0, 3);

    if (picked.length) {
      await sock.sendMessage(chatId, {
        text: [
          `✅ *Found ${servers.length} free servers!*`,
          '',
          '*How to connect — HTTP Custom:*',
          '1. Open HTTP Custom',
          '2. Menu → Config → ➕ → VMess',
          '3. Tap *"Scan QR Code"*',
          '4. Scan the image below',
          '5. Save → Connect ✅',
        ].join('\n'),
      }, { quoted: message });

      let sent = 0;
      for (const srv of picked) {
        for (const bug of BUGS.slice(0, 2)) {
          if (sent >= 4) break;
          const uri = makeVmessUri(srv, bug);
          const ok = await sendQr(sock, chatId, message, uri, [
            `📱 *QR ${sent + 1} — ${bug.name} bug*`,
            `Bug: \`${bug.host}\`  |  Port: ${srv.port}`,
            sent === 0 ? '\n👆 *Scan this first in HTTP Custom*' : '_Backup — try if QR 1 fails_',
          ].join('\n'));
          if (ok) sent++;
          await new Promise(r => setTimeout(r, 500));
        }
      }

      // Backup text file with all links
      const allLinks = picked.flatMap((srv, si) =>
        BUGS.map(bug => `# Server${si+1} × ${bug.name}\n${makeVmessUri(srv, bug)}`)
      ).join('\n\n');

      await sock.sendMessage(chatId, {
        document: Buffer.from([
          `JAM-MD — Airtel Uganda V2Ray — ${date}`,
          '==============================================',
          'SCAN QR CODES above or copy-paste links below',
          'HTTP Custom → Config → + → VMess → Paste Link',
          'V2RayNG → + (top right) → Import from clipboard',
          '==============================================',
          '',
          allLinks,
          '',
          'BUG HOSTS: ' + BUGS.map(b => b.host).join(' | '),
          '★ JAM-MD Bot ★',
        ].join('\n'), 'utf8'),
        fileName: `Airtel-UG-V2Ray-${date}.txt`,
        mimetype: 'text/plain',
        caption: `📋 Backup — ${picked.length * BUGS.length} vmess:// links\nCopy any line → paste in HTTP Custom or V2RayNG`,
      }, { quoted: message });
    }

    // If we also got an SSH account, send .ehi for HTTP Injector
    if (sshAcc) {
      try {
        await sock.sendMessage(chatId, {
          document: buildEhi(sshAcc),
          fileName: `Airtel-UG-Injector-${date}.ehi`,
          mimetype: 'application/zip',
          caption: [
            `🔐 *HTTP Injector config* (.ehi file)`,
            '',
            '*How to use:*',
            '1. Open HTTP Injector',
            '2. Menu → Import Config',
            '3. Select this file',
            '4. Tap Connect',
            '',
            `Host: ${sshAcc.host}  |  Port: ${sshAcc.wsPort}`,
          ].join('\n'),
        }, { quoted: message });
      } catch {}
    }
  },
};
