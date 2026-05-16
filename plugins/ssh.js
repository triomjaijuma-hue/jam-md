// Free SSH account fetcher + importable .ehi config generator for HTTP Injector
  // .hc (HTTP Custom) and .npvt (NapsternetV) use proprietary AES encryption
  // tied to the app APK — impossible to generate without the app's secret key.
  // HTTP Injector .ehi format is open (ZIP+JSON) and does the same job.

  // ── Minimal ZIP STORE builder (no external deps) ─────────────────────────
  function crc32(buf) {
      let c = 0xFFFFFFFF;
      for (const b of buf) {
          c ^= b;
          for (let j = 0; j < 8; j++) c = (c & 1) ? (c >>> 1) ^ 0xEDB88320 : c >>> 1;
      }
      return (c ^ 0xFFFFFFFF) >>> 0;
  }
  function dosDateTime(d) {
      return {
          time: ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xFFFF,
          date: (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xFFFF,
      };
  }
  function buildZip(files) {
      const { time, date } = dosDateTime(new Date());
      const parts = []; const cds = []; let offset = 0;
      for (const { name, data } of files) {
          const nb = Buffer.from(name, 'utf8');
          const crc = crc32(data);
          const lh = Buffer.alloc(30 + nb.length);
          lh.writeUInt32LE(0x04034B50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0, 6);
          lh.writeUInt16LE(0, 8); lh.writeUInt16LE(time, 10); lh.writeUInt16LE(date, 12);
          lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(data.length, 22);
          lh.writeUInt16LE(nb.length, 26); lh.writeUInt16LE(0, 28); nb.copy(lh, 30);
          const cd = Buffer.alloc(46 + nb.length);
          cd.writeUInt32LE(0x02014B50, 0); cd.writeUInt16LE(20, 4); cd.writeUInt16LE(20, 6);
          cd.writeUInt16LE(0, 8); cd.writeUInt16LE(0, 10); cd.writeUInt16LE(time, 12);
          cd.writeUInt16LE(date, 14); cd.writeUInt32LE(crc, 16); cd.writeUInt32LE(data.length, 20);
          cd.writeUInt32LE(data.length, 24); cd.writeUInt16LE(nb.length, 28); cd.writeUInt16LE(0, 30);
          cd.writeUInt16LE(0, 32); cd.writeUInt16LE(0, 34); cd.writeUInt16LE(0, 36);
          cd.writeUInt32LE(0, 38); cd.writeUInt32LE(offset, 42); nb.copy(cd, 46);
          parts.push(lh, data); cds.push(cd); offset += lh.length + data.length;
      }
      const cdBuf = Buffer.concat(cds);
      const eocd = Buffer.alloc(22);
      eocd.writeUInt32LE(0x06054B50, 0); eocd.writeUInt16LE(0, 4); eocd.writeUInt16LE(0, 6);
      eocd.writeUInt16LE(files.length, 8); eocd.writeUInt16LE(files.length, 10);
      eocd.writeUInt32LE(cdBuf.length, 12); eocd.writeUInt32LE(offset, 16); eocd.writeUInt16LE(0, 20);
      return Buffer.concat([...parts, cdBuf, eocd]);
  }

  // ── Airtel Uganda payloads ───────────────────────────────────────────────
  const PAYLOADS = [
      { name: 'WhatsApp SNI', host: 'web.whatsapp.com',    payload: 'GET / HTTP/1.1[crlf]Host: web.whatsapp.com[crlf]Upgrade: websocket[crlf][crlf]' },
      { name: 'WhatsApp CDN', host: 'mmg.whatsapp.net',    payload: 'GET / HTTP/1.1[crlf]Host: mmg.whatsapp.net[crlf]Upgrade: websocket[crlf][crlf]' },
      { name: 'Google APIs',  host: 'clients3.google.com', payload: 'GET / HTTP/1.1[crlf]Host: clients3.google.com[crlf]Upgrade: websocket[crlf][crlf]' },
      { name: 'Facebook Free',host: '0.facebook.com',      payload: 'GET / HTTP/1.1[crlf]Host: 0.facebook.com[crlf]Upgrade: websocket[crlf][crlf]' },
      { name: 'HTTP CONNECT', host: 'web.whatsapp.com',    payload: 'CONNECT web.whatsapp.com:443 HTTP/1.1[crlf]Host: web.whatsapp.com[crlf][crlf]' },
      { name: 'Airtel Portal',host: 'airtelafrica.com',    payload: 'GET / HTTP/1.1[crlf]Host: airtelafrica.com[crlf]Upgrade: websocket[crlf][crlf]' },
  ];

  // ── SSH providers ─────────────────────────────────────────────────────────
  const PROVIDERS = [
      { name: 'FastSSH',  servers: [{ id: 'sg1-fastssh', region: 'Singapore' }, { id: 'us1-fastssh', region: 'USA' }],
        createUrl: s => `https://www.fastssh.com/page/create-ssh-account/server/${s}/`,
        body: (u, p) => `username=${u}&password=${p}&repassword=${p}`,
        parseHost: h => h.match(/([\d]{1,3}\.){3}[\d]{1,3}/)?.[0],
        parsePort: h => h.match(/Port.*?(\d{2,5})/)?.[1] || '22',
        parseWs:   h => h.match(/WebSocket.*?(80|443|8080|8880)/i)?.[1] || '80',
      },
      { name: 'SpeedSSH', servers: [{ id: 'sg1.speedssh.com', region: 'Singapore' }],
        createUrl: s => `https://www.speedssh.com/create-ssh/${s}/`,
        body: (u, p) => `username=${u}&password=${p}&repassword=${p}`,
        parseHost: h => h.match(/([\d]{1,3}\.){3}[\d]{1,3}/)?.[0],
        parsePort: h => h.match(/Port.*?(\d{2,5})/)?.[1] || '22',
        parseWs:   h => h.match(/WebSocket.*?(80|443|8080|8880)/i)?.[1] || '80',
      },
  ];

  function rnd(len) {
      const c = 'abcdefghijklmnopqrstuvwxyz0123456789';
      return Array.from({ length: len }, () => c[Math.floor(Math.random() * c.length)]).join('');
  }

  async function tryCreate(provider, serverObj) {
      try {
          const user = 'jam' + rnd(6), pass = rnd(8) + 'A1!';
          const controller = new AbortController();
          const tid = setTimeout(() => controller.abort(), 20000);
          const res = await fetch(provider.createUrl(serverObj.id), {
              method: 'POST', signal: controller.signal,
              headers: { 'Content-Type': 'application/x-www-form-urlencoded',
                         'User-Agent': 'Mozilla/5.0 (Linux; Android 12) Chrome/120',
                         'Referer': provider.createUrl(serverObj.id) },
              body: provider.body(user, pass),
          });
          clearTimeout(tid);
          if (!res.ok) return null;
          const html = await res.text();
          if (!html.includes(user) && !html.match(/([\d]{1,3}\.){3}[\d]{1,3}/)) return null;
          const host = provider.parseHost(html);
          if (!host) return null;
          return { provider: provider.name, region: serverObj.region,
                   host, port: provider.parsePort(html), wsPort: provider.parseWs(html),
                   username: user, password: pass, expiry: '7 days' };
      } catch { return null; }
  }

  // ── Build HTTP Injector .ehi ZIP config ──────────────────────────────────
  function buildEhi(acc, payload) {
      const config = {
          "SSH": {
              "SSHHost": acc.host,
              "SSHPort": acc.wsPort,
              "SSHUsername": acc.username,
              "SSHPassword": acc.password,
              "SSHNote": `JAM-MD Bot — ${acc.provider} [${acc.region}]`
          },
          "Payload": {
              "Payload": payload.payload,
              "PayloadNote": payload.name
          },
          "ProxySettings": {
              "ProxyHost": "",
              "ProxyPort": "",
              "ProxyUsername": "",
              "ProxyPassword": ""
          },
          "DNS": {
              "DNSHost": "8.8.8.8",
              "DNSPort": "53"
          }
      };
      const json = Buffer.from(JSON.stringify(config, null, 2), 'utf8');
      return buildZip([{ name: 'config.json', data: json }]);
  }

  // ── Build plain text summary ─────────────────────────────────────────────
  function buildTxt(accounts) {
      const date = new Date().toISOString().split('T')[0];
      const L = [
          `# SSH Accounts + Config — Airtel Uganda — ${date}`,
          '# Generated by JAM-MD Bot',
          '# Use HTTP Injector app → Import → select the .ehi file sent with this',
          '# OR manual entry in HTTP Custom using details below',
          '',
      ];
      if (accounts.length > 0) {
          accounts.forEach((a, i) => {
              L.push(`# --- Account ${i + 1} [${a.provider} - ${a.region}] ---`);
              L.push(`Host:       ${a.host}`);
              L.push(`Port:       ${a.wsPort}   (WebSocket port for Airtel UG)`);
              L.push(`Username:   ${a.username}`);
              L.push(`Password:   ${a.password}`);
              L.push(`Expires:    ${a.expiry}`);
              L.push('');
          });
      } else {
          L.push('# Auto-fetch blocked — get account from fastssh.com (30 sec signup)');
          L.push('# Select: Singapore server + enable WebSocket');
          L.push('');
      }
      L.push('# --- Airtel Uganda Payloads (paste in HTTP Custom/Injector) ---');
      PAYLOADS.forEach((p, i) => {
          L.push(`# PAYLOAD ${i + 1} — ${p.name} (SNI: ${p.host})`);
          L.push(p.payload);
          L.push('');
      });
      return L.join('\n');
  }

  export default {
      command: 'ssh',
      aliases: ['getssh', 'sshaccount', 'freessh', 'airtel', 'ugconfig', 'hcsetup', 'ehi'],
      category: 'tools',
      description: 'Get free SSH accounts + importable HTTP Injector config for Airtel Uganda',
      usage: '.ssh',
      async handler(sock, message, args, context) {
          const chatId = context.chatId || message.key.remoteJid;
          const date = new Date().toISOString().split('T')[0];

          await sock.sendMessage(chatId, {
              text: '🔐 Fetching SSH accounts + building importable config file...\n_Takes up to 20 seconds_'
          }, { quoted: message });

          try { await sock.presenceSubscribe(chatId); await sock.sendPresenceUpdate('composing', chatId); } catch { }

          // Try all providers in parallel
          const attempts = PROVIDERS.flatMap(p => p.servers.map(s => tryCreate(p, s)));
          const results = await Promise.all(attempts);
          const seen = new Set();
          const accounts = results.filter(r => {
              if (!r || seen.has(r.host)) return false;
              seen.add(r.host); return true;
          });

          const hasAccounts = accounts.length > 0;

          // ── Send status message ──────────────────────────────────────────
          if (hasAccounts) {
              await sock.sendMessage(chatId, {
                  text: `✅ Got ${accounts.length} SSH account(s)! Sending importable config...`
              }, { quoted: message });
          } else {
              await sock.sendMessage(chatId, {
                  text: `⚠️ Auto-fetch blocked. Get a free account from *fastssh.com* then I'll still send you the payload templates.`
              }, { quoted: message });
          }

          // ── Send .ehi files (one per payload for the first account) ────
          if (hasAccounts) {
              const acc = accounts[0];
              // Send one .ehi per payload so user can try each one
              for (let i = 0; i < PAYLOADS.length; i++) {
                  const p = PAYLOADS[i];
                  const ehi = buildEhi(acc, p);
                  await sock.sendMessage(chatId, {
                      document: ehi,
                      fileName: `airtel-uganda-${i + 1}-${p.name.replace(/\s+/g, '-').toLowerCase()}-${date}.ehi`,
                      mimetype: 'application/zip',
                      caption: i === 0
                          ? `📁 *Config ${i + 1}/${PAYLOADS.length}: ${p.name}*\n` +
                            `_Import this first. If it doesn't work, try the next one._\n\n` +
                            `*How to import:*\n` +
                            `HTTP Injector → Menu → Import Config → pick this file → Connect`
                          : `📁 Config ${i + 1}/${PAYLOADS.length}: ${p.name}`
                  }, { quoted: message });
                  // Small delay to avoid WhatsApp rate limiting
                  await new Promise(r => setTimeout(r, 800));
              }

              // Also send if there are more accounts, send them as txt
              if (accounts.length > 1) {
                  await sock.sendMessage(chatId, {
                      document: Buffer.from(buildTxt(accounts)),
                      fileName: `ssh-backup-accounts-${date}.txt`,
                      mimetype: 'text/plain',
                      caption: `📋 Backup: ${accounts.length} SSH accounts + all payloads in plain text`
                  }, { quoted: message });
              }
          } else {
              // No accounts — send payload templates txt only
              await sock.sendMessage(chatId, {
                  document: Buffer.from(buildTxt([])),
                  fileName: `airtel-uganda-payloads-${date}.txt`,
                  mimetype: 'text/plain',
                  caption: `📋 Airtel Uganda payload templates\nGet SSH account from fastssh.com then enter these manually in HTTP Custom/Injector`
              }, { quoted: message });
          }
      }
  };
  