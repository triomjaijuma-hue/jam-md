// plugins/check.js
// Live-tests a vmess:// link before the user wastes time importing it
// Usage: .check vmess://xxxxxx
// Commands: .check  .testlink  .pingvmess  .checkserver

import net from 'net';
import crypto from 'crypto';

const BUGS = [
  { name: 'WhatsApp',      host: 'web.whatsapp.com'    },
  { name: 'WA Media',      host: 'mmg.whatsapp.net'    },
  { name: 'Google',        host: 'clients3.google.com' },
  { name: 'Facebook Zero', host: '0.facebook.com'      },
];

function tcpPing(host, port, ms = 4000) {
  return new Promise(r => {
    const s = new net.Socket();
    const t = setTimeout(() => { s.destroy(); r({ ok: false, ms: ms, err: 'timeout' }); }, ms);
    const start = Date.now();
    s.connect(port, host, () => {
      clearTimeout(t);
      s.destroy();
      r({ ok: true, ms: Date.now() - start });
    });
    s.on('error', e => { clearTimeout(t); r({ ok: false, err: e.code }); });
  });
}

function wsTest(host, port, path, bugHost, ms = 5000) {
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

export default {
  command: 'check',
  aliases: ['testlink', 'pingvmess', 'checkserver', 'testserver', 'vmesscheck', 'checklink'],
  category: 'tools',
  description: 'Test if a vmess:// link is live and accepts Airtel Uganda bug hosts',
  usage: '.check vmess://xxxxxx',

  async handler(sock, message, args, context) {
    const chatId = context.chatId || message.key.remoteJid;

    // Find the vmess:// link — from args or quoted message text
    let link = args?.join(' ').trim();
    if (!link || !link.startsWith('vmess://')) {
      const quoted = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
      const quotedText = quoted?.conversation || quoted?.extendedTextMessage?.text || '';
      link = quotedText.match(/(vmess:\/\/[A-Za-z0-9+/=]+)/)?.[1] || '';
    }

    if (!link || !link.startsWith('vmess://')) {
      await sock.sendMessage(chatId, {
        text: [
          '❌ *No vmess:// link found.*',
          '',
          'How to use:',
          '`.check vmess://eyJ2IjoiMiIsInBzIjoi...`',
          '',
          'Or reply to a message containing a vmess:// link with `.check`',
        ].join('\n'),
      }, { quoted: message });
      return;
    }

    // Parse the vmess:// link
    let cfg;
    try {
      cfg = JSON.parse(Buffer.from(link.slice(8), 'base64').toString('utf8'));
    } catch {
      await sock.sendMessage(chatId, {
        text: '❌ *Invalid vmess:// link* — could not decode it. Make sure you copied the full link.',
      }, { quoted: message });
      return;
    }

    const { add, port, id: uuid, path = '/', host = add, net: transport, ps = '' } = cfg;
    const portNum = Number(port);

    await sock.sendMessage(chatId, {
      text: [
        `🔍 *Testing vmess:// link...*`,
        `Server: \`${add}:${portNum}\``,
        `Transport: ${transport || '?'}  |  Path: \`${path}\``,
        `_Takes up to 15 seconds_`,
      ].join('\n'),
    }, { quoted: message });

    try { await sock.sendPresenceUpdate('composing', chatId); } catch {}

    // ── Step 1: TCP ping ────────────────────────────────────────────────────
    const tcp = await tcpPing(add, portNum);

    if (!tcp.ok) {
      await sock.sendMessage(chatId, {
        text: [
          `❌ *Server is OFFLINE*`,
          ``,
          `\`${add}:${portNum}\` — ${tcp.err}`,
          ``,
          `This server is dead. Try sending *.airtel* to get fresh working links.`,
        ].join('\n'),
      }, { quoted: message });
      return;
    }

    // ── Step 2: WebSocket test with bug hosts (parallel) ───────────────────
    const bugTests = await Promise.all(
      BUGS.map(async bug => ({
        ...bug,
        result: await wsTest(add, portNum, path, bug.host),
      }))
    );

    // Also test with the original host header
    const origTest = await wsTest(add, portNum, path, host || add);

    // ── Build report ────────────────────────────────────────────────────────
    const bugWorking  = bugTests.filter(b => b.result.ok);
    const origWorking = origTest.ok;

    const bugLines = bugTests.map(b =>
      `  ${b.result.ok ? '✅' : '❌'} ${b.name} (\`${b.host}\`) — ${b.result.ok ? 'WORKS ✓' : b.result.code}`
    );

    let verdict, advice;
    if (bugWorking.length > 0) {
      verdict = `✅ *WORKING* — accepts ${bugWorking.length} Airtel bug host(s)`;
      advice  = `*Connect via HTTP Custom:*\nImport this link → it will work on Airtel free data using *${bugWorking[0].name}* bug`;
    } else if (origWorking) {
      verdict = `🟡 *SERVER IS UP* but rejects Airtel bug hosts`;
      advice  = `This server works with its own host (\`${host}\`) but won't connect on *Airtel free data*.\nIt will use your regular Airtel data if you connect.`;
    } else {
      verdict = `❌ *SERVER DEAD* — TCP alive but WebSocket fails`;
      advice  = `Server responds to ping but won't open a WebSocket connection.\nTry *.airtel* to get fresh working links.`;
    }

    await sock.sendMessage(chatId, {
      text: [
        `📊 *VMess Link Test Result*`,
        ``,
        `*Server:* \`${add}:${portNum}\``,
        `*Name:* ${ps || '(no name)'}`,
        `*TCP ping:* ✅ ${tcp.ms}ms`,
        ``,
        `*Bug host test (Airtel zero-rating):*`,
        ...bugLines,
        ``,
        `*Original host (\`${host || add}\`):* ${origWorking ? '✅ accepts WebSocket' : '❌ ' + origTest.code}`,
        ``,
        `${verdict}`,
        ``,
        advice,
      ].join('\n'),
    }, { quoted: message });
  },
};
