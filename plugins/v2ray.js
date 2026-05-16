// V2Ray + SSH config fetcher for Uganda/East Africa HTTP Custom

  // ── SSH account fetching from free providers ─────────────────────────────────
  const SSH_SOURCES = [
      // Public GitHub repos sharing free SSH accounts for Africa
      'https://raw.githubusercontent.com/freefq/free/master/v2',
      'https://raw.githubusercontent.com/aiboboxx/v2rayfree/main/v2',
      'https://raw.githubusercontent.com/Alvin9999/pac2/master/spautoproxy.txt',
  ];

  // ── V2Ray aggregator sources ─────────────────────────────────────────────────
  const V2RAY_SOURCES = [
      'https://raw.githubusercontent.com/barry-far/V2ray-Configs/main/All_Configs_base64.txt',
      'https://raw.githubusercontent.com/mahdibland/V2RayAggregator/master/Eternity',
      'https://raw.githubusercontent.com/yebekhe/TelegramV2rayCollector/main/sub/base64/mix',
      'https://raw.githubusercontent.com/tbbatbb/Proxy/master/dist/v2ray.config.txt',
      'https://raw.githubusercontent.com/Pawdroid/Free-servers/main/sub',
      'https://raw.githubusercontent.com/mfuu/v2ray/master/v2ray',
  ];

  // ── Known Airtel Uganda bug hosts (SNI exploit hosts) ───────────────────────
  // These are zero-rated or unrestricted domains on Airtel Uganda
  const AIRTEL_UG_PAYLOADS = [
      {
          name: 'WhatsApp SNI',
          host: 'web.whatsapp.com',
          payload: 'GET / HTTP/1.1[crlf]Host: web.whatsapp.com[crlf]Upgrade: websocket[crlf][crlf]'
      },
      {
          name: 'Facebook CDN',
          host: 'free.facebook.com',
          payload: 'GET / HTTP/1.1[crlf]Host: free.facebook.com[crlf]Upgrade: websocket[crlf][crlf]'
      },
      {
          name: 'Airtel UG Portal',
          host: 'airtelafrica.com',
          payload: 'GET / HTTP/1.1[crlf]Host: airtelafrica.com[crlf]Upgrade: websocket[crlf][crlf]'
      },
      {
          name: 'Google APIs',
          host: 'clients3.google.com',
          payload: 'GET / HTTP/1.1[crlf]Host: clients3.google.com[crlf]Upgrade: websocket[crlf][crlf]'
      },
  ];

  async function fetchSource(url) {
      try {
          const controller = new AbortController();
          const tid = setTimeout(() => controller.abort(), 15000);
          const res = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': 'Mozilla/5.0' } });
          clearTimeout(tid);
          if (!res.ok) return null;
          return (await res.text()).trim();
      } catch { return null; }
  }

  function decodeConfigs(raw) {
      if (!raw) return [];
      let text = raw;
      try {
          const decoded = Buffer.from(raw, 'base64').toString('utf8');
          if (decoded.includes('vmess://') || decoded.includes('vless://') ||
              decoded.includes('trojan://') || decoded.includes('ss://')) {
              text = decoded;
          }
      } catch { }
      return text.split(/[\n\r]+/)
          .map(l => l.trim())
          .filter(l => l.startsWith('vmess://') || l.startsWith('vless://') ||
              l.startsWith('trojan://') || l.startsWith('ss://'));
  }

  function parseVmessInfo(cfg) {
      try {
          const json = JSON.parse(Buffer.from(cfg.replace('vmess://', ''), 'base64').toString('utf8'));
          return { server: json.add, port: json.port, net: json.net || 'tcp', id: json.id, path: json.path || '/' };
      } catch { return null; }
  }

  function isWsConfig(cfg) {
      if (cfg.startsWith('vmess://')) {
          const info = parseVmessInfo(cfg);
          return info && (info.net === 'ws' || info.net === 'http');
      }
      if (cfg.startsWith('vless://')) return cfg.includes('type=ws');
      return false;
  }

  // Generate a proper HTTP Custom .hc JSON config for Airtel Uganda
  function buildHcConfig(v2rayConfig, payload) {
      const info = parseVmessInfo(v2rayConfig);
      const base = {
          "mode": "v2ray",
          "v2ray_config": v2rayConfig,
          "payload": payload.payload,
          "sni": payload.host,
          "ssh_host": "",
          "ssh_port": "22",
          "ssh_user": "",
          "ssh_pass": "",
          "proxy_ip": "",
          "proxy_port": "",
          "dns": "8.8.8.8",
          "split_http": false,
          "rotate_ip": false
      };
      return JSON.stringify(base, null, 2);
  }

  function getShortLabel(cfg, i) {
      if (cfg.startsWith('vmess://')) {
          const info = parseVmessInfo(cfg);
          if (info) return `${i}. VMESS | ${info.server}:${info.port} [${info.net.toUpperCase()}]`;
      }
      if (cfg.startsWith('vless://') || cfg.startsWith('trojan://')) {
          try {
              const url = new URL(cfg);
              return `${i}. ${cfg.startsWith('vless') ? 'VLESS' : 'TROJAN'} | ${url.hostname}:${url.port || 443}`;
          } catch { }
      }
      if (cfg.startsWith('ss://')) {
          try {
              const url = new URL(cfg);
              return `${i}. SS | ${url.hostname}:${url.port}`;
          } catch { }
      }
      return `${i}. CONFIG`;
  }

  export default {
      command: 'v2ray',
      aliases: ['config', 'vpnconfig', 'httpcustom', 'hc', 'airtel', 'ugconfig'],
      category: 'tools',
      description: 'Get V2Ray/HTTP Custom configs. Use .airtel for Uganda-specific setup.',
      usage: '.v2ray [ws|all|count] | .airtel',
      async handler(sock, message, args, context) {
          const chatId = context.chatId || message.key.remoteJid;

          // ── .airtel / .ugconfig — Uganda specific guide + HC files ──────────
          const cmdUsed = (message.message?.conversation ||
              message.message?.extendedTextMessage?.text || '').trim().replace(/^[.!]/, '').toLowerCase();

          if (cmdUsed === 'airtel' || cmdUsed === 'ugconfig') {
              await sock.sendMessage(chatId, {
                  text: `📡 *Airtel Uganda HTTP Custom Setup*\n\n` +
                      `The generic worldwide V2Ray configs fail on Airtel UG because\n` +
                      `Airtel blocks international servers. Here is what actually works:\n\n` +
                      `*Method 1 — SSH + Bug Host (most reliable)*\n` +
                      `1. Get a free SSH account from one of these sites:\n` +
                      `   • fastssh.com\n` +
                      `   • sshocean.net\n` +
                      `   • speedssh.com\n` +
                      `   • createssh.com\n` +
                      `2. In HTTP Custom:\n` +
                      `   • Mode: SSH\n` +
                      `   • SSH Host/Port/User/Pass: from the site above\n` +
                      `   • Payload: (see file I'm sending)\n` +
                      `   • SNI/Bug Host: web.whatsapp.com\n` +
                      `   • Remote Proxy: 127.0.0.1:8888\n\n` +
                      `*Method 2 — V2Ray + Payload*\n` +
                      `Use .v2ray ws 10 to get WS configs, then\n` +
                      `set the payload to match Airtel bug host\n\n` +
                      `_Sending payload templates now..._`
              }, { quoted: message });

              // Send payload templates file
              const date = new Date().toISOString().split('T')[0];
              const payloadFile = [
                  '# HTTP Custom Payload Templates for Airtel Uganda',
                  '# Copy one payload into HTTP Custom → Payload field',
                  '# Try each one — different ones work at different times',
                  '',
                  '# =============================================',
                  '# PAYLOAD 1: WhatsApp SNI (most common - try first)',
                  '# Bug Host: web.whatsapp.com',
                  '# =============================================',
                  'GET / HTTP/1.1[crlf]Host: web.whatsapp.com[crlf]Upgrade: websocket[crlf][crlf]',
                  '',
                  '# =============================================',
                  '# PAYLOAD 2: WhatsApp CDN',
                  '# Bug Host: mmg.whatsapp.net',
                  '# =============================================',
                  'GET / HTTP/1.1[crlf]Host: mmg.whatsapp.net[crlf]Upgrade: websocket[crlf][crlf]',
                  '',
                  '# =============================================',
                  '# PAYLOAD 3: Google (try this if WhatsApp fails)',
                  '# Bug Host: clients3.google.com',
                  '# =============================================',
                  'GET / HTTP/1.1[crlf]Host: clients3.google.com[crlf]Upgrade: websocket[crlf][crlf]',
                  '',
                  '# =============================================',
                  '# PAYLOAD 4: Facebook Free Basics',
                  '# Bug Host: 0.facebook.com',
                  '# =============================================',
                  'GET / HTTP/1.1[crlf]Host: 0.facebook.com[crlf]Upgrade: websocket[crlf][crlf]',
                  '',
                  '# =============================================',
                  '# PAYLOAD 5: HTTP CONNECT method (try with port 443)',
                  '# =============================================',
                  'CONNECT web.whatsapp.com:443 HTTP/1.1[crlf]Host: web.whatsapp.com[crlf][crlf]',
                  '',
                  '# =============================================',
                  '# PAYLOAD 6: Airtel Africa portal',
                  '# Bug Host: airtelafrica.com',
                  '# =============================================',
                  'GET / HTTP/1.1[crlf]Host: airtelafrica.com[crlf]Upgrade: websocket[crlf][crlf]',
                  '',
                  '# =============================================',
                  '# HOW TO SETUP HTTP CUSTOM FOR AIRTEL UGANDA:',
                  '# =============================================',
                  '# 1. Get free SSH account from fastssh.com or speedssh.com',
                  '# 2. Open HTTP Custom app',
                  '# 3. SSH tab:',
                  '#    - Host: (from SSH site)',
                  '#    - Port: 80 or 443 (try both)',
                  '#    - Username: (from SSH site)',
                  '#    - Password: (from SSH site)',
                  '# 4. Config tab:',
                  '#    - Payload: copy one payload above',
                  '#    - SNI/Bug Host: same as Host in payload',
                  '#    - Remote Proxy: 127.0.0.1:8888',
                  '# 5. Hit connect and check LOG tab',
                  '# 6. If "Connection reset" — try next payload',
                  '# 7. If "connected" but no internet — change SNI',
                  '',
                  '# TIP: Ask in Ugandan VPN Telegram groups for',
                  '# working SSH accounts specifically for Airtel UG:',
                  '# Search: "Airtel Uganda free internet" on Telegram',
              ].join('\n');

              await sock.sendMessage(chatId, {
                  document: Buffer.from(payloadFile),
                  fileName: `airtel-uganda-http-custom-payloads-${date}.txt`,
                  mimetype: 'text/plain',
                  caption: `📋 *Airtel Uganda Payload Templates*\n\nContains 6 payload templates to try.\nAlso has full setup instructions inside the file.`
              }, { quoted: message });

              return;
          }

          // ── Standard .v2ray command ──────────────────────────────────────────
          const filterArg = (args[0] || 'ws').toLowerCase();
          const count = Math.min(parseInt(args[0]) || parseInt(args[1]) || 5, 20);
          const filterType = /^\d+$/.test(filterArg) ? 'ws' : (filterArg === 'all' ? 'all' : filterArg === 'ws' ? 'ws' : filterArg);

          await sock.sendMessage(chatId, {
              text: `🔍 Fetching configs...\n` +
                  `⚠️ *Note for Airtel Uganda users:* Generic configs may fail.\n` +
                  `Use *.airtel* for Uganda-specific setup guide.`
          }, { quoted: message });

          try { await sock.presenceSubscribe(chatId); await sock.sendPresenceUpdate('composing', chatId); } catch { }

          const rawResults = await Promise.all(V2RAY_SOURCES.map(fetchSource));
          let allConfigs = [];
          for (const raw of rawResults) {
              if (raw) allConfigs.push(...decodeConfigs(raw));
          }
          allConfigs = [...new Set(allConfigs)];

          let filtered = filterType === 'all' ? allConfigs :
              filterType === 'ws' ? allConfigs.filter(isWsConfig) :
              allConfigs.filter(c => c.startsWith(filterType + '://'));

          if (filtered.length === 0) filtered = allConfigs.slice(0, 20);

          const picked = filtered.sort(() => Math.random() - 0.5).slice(0, count);

          const date = new Date().toISOString().split('T')[0];
          const fileLines = [
              `# V2Ray Configs — ${date}`,
              `# ${picked.length} configs from pool of ${filtered.length}`,
              '# NOTE: These are global configs. For Airtel Uganda,',
              '# run .airtel for Uganda-specific setup.',
              '',
          ];
          picked.forEach((cfg, i) => {
              fileLines.push(`# ${getShortLabel(cfg, i + 1)}`);
              fileLines.push(cfg);
              fileLines.push('');
          });

          await sock.sendMessage(chatId, {
              document: Buffer.from(fileLines.join('\n')),
              fileName: `v2ray-configs-${date}.txt`,
              mimetype: 'text/plain',
              caption: `✅ *${picked.length} configs*  (pool: ${filtered.length})\n` +
                  `⚠️ On Airtel Uganda, use *.airtel* instead for working configs`
          }, { quoted: message });
      }
  };
  