// V2Ray config fetcher — sends configs as a downloadable file to avoid WhatsApp line-wrap

  const CONFIG_SOURCES = [
      'https://raw.githubusercontent.com/barry-far/V2ray-Configs/main/All_Configs_base64.txt',
      'https://raw.githubusercontent.com/mahdibland/V2RayAggregator/master/Eternity',
      'https://raw.githubusercontent.com/yebekhe/TelegramV2rayCollector/main/sub/base64/mix',
      'https://raw.githubusercontent.com/tbbatbb/Proxy/master/dist/v2ray.config.txt',
      'https://raw.githubusercontent.com/Pawdroid/Free-servers/main/sub',
      'https://raw.githubusercontent.com/mfuu/v2ray/master/v2ray',
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

  function getProtocol(cfg) {
      if (cfg.startsWith('vmess://')) return 'VMESS';
      if (cfg.startsWith('vless://')) return 'VLESS';
      if (cfg.startsWith('trojan://')) return 'TROJAN';
      if (cfg.startsWith('ss://')) return 'SS';
      return 'UNKNOWN';
  }

  function parseVmessInfo(cfg) {
      try {
          const json = JSON.parse(Buffer.from(cfg.replace('vmess://', ''), 'base64').toString('utf8'));
          return { server: json.add, port: json.port, net: json.net || 'tcp', name: json.ps || json.add };
      } catch { return null; }
  }

  function isHttpFriendly(cfg) {
      if (cfg.startsWith('vmess://')) {
          const info = parseVmessInfo(cfg);
          return info && (info.net === 'ws' || info.net === 'http' || info.net === 'h2');
      }
      if (cfg.startsWith('vless://')) return cfg.includes('type=ws') || cfg.includes('type=http');
      return true;
  }

  function getShortLabel(cfg, i) {
      const proto = getProtocol(cfg);
      if (proto === 'VMESS') {
          const info = parseVmessInfo(cfg);
          if (info) return `${i}. ${proto} | ${info.server}:${info.port} [${info.net.toUpperCase()}]`;
      }
      if (proto === 'VLESS' || proto === 'TROJAN') {
          try {
              const url = new URL(cfg);
              return `${i}. ${proto} | ${url.hostname}:${url.port || 443}`;
          } catch { }
      }
      if (proto === 'SS') {
          try {
              const url = new URL(cfg);
              return `${i}. ${proto} | ${url.hostname}:${url.port}`;
          } catch { }
      }
      return `${i}. ${proto}`;
  }

  export default {
      command: 'v2ray',
      aliases: ['config', 'vpnconfig', 'httpcustom', 'hc'],
      category: 'tools',
      description: 'Get free working V2Ray/HTTP Custom config files as a downloadable file',
      usage: '.v2ray [ws|vmess|vless|trojan|ss|all] [count]',
      async handler(sock, message, args, context) {
          const chatId = context.chatId || message.key.remoteJid;
          const filterArg = (args[0] || 'ws').toLowerCase();
          const count = Math.min(parseInt(args[1]) || 5, 20);

          const filterMap = {
              ws: 'ws', websocket: 'ws', http: 'ws', httpcustom: 'ws', hc: 'ws',
              vmess: 'vmess', vless: 'vless', trojan: 'trojan', ss: 'ss', all: 'all'
          };
          const filterType = filterMap[filterArg] || 'ws';

          await sock.sendMessage(chatId, {
              text: `🔍 Fetching configs from ${CONFIG_SOURCES.length} sources...\n_Filter: ${filterType === 'ws' ? 'HTTP/WebSocket (HTTP Custom)' : filterType.toUpperCase()}_`
          }, { quoted: message });

          try { await sock.presenceSubscribe(chatId); await sock.sendPresenceUpdate('composing', chatId); } catch { }

          const rawResults = await Promise.all(CONFIG_SOURCES.map(fetchSource));
          let allConfigs = [];
          for (const raw of rawResults) {
              if (raw) allConfigs.push(...decodeConfigs(raw));
          }

          if (allConfigs.length === 0) {
              return sock.sendMessage(chatId, {
                  text: '❌ Could not fetch configs right now. Try again in a moment.'
              }, { quoted: message });
          }

          allConfigs = [...new Set(allConfigs)];

          let filtered = allConfigs;
          if (filterType === 'ws') {
              filtered = allConfigs.filter(c => isHttpFriendly(c));
          } else if (filterType !== 'all') {
              filtered = allConfigs.filter(c => c.startsWith(filterType + '://'));
          }

          if (filtered.length === 0) {
              return sock.sendMessage(chatId, {
                  text: `❌ No *${filterType}* configs found. Try: .v2ray all`
              }, { quoted: message });
          }

          const picked = filtered.sort(() => Math.random() - 0.5).slice(0, count);

          // Build a clean text file — one config per line, easy to copy
          const date = new Date().toISOString().split('T')[0];
          const fileLines = [
              `# V2Ray Configs — ${filterType === 'ws' ? 'HTTP/WebSocket' : filterType.toUpperCase()} — ${date}`,
              `# Generated by JAM-MD Bot | ${picked.length} configs from ${allConfigs.length} total`,
              `# HOW TO USE IN HTTP CUSTOM:`,
              `#   1. Open HTTP Custom app`,
              `#   2. Settings → V2Ray Config → paste ONE line below`,
              `#   3. If it doesn't connect, try the next config`,
              `#   Refresh daily for new configs: .v2ray`,
              '',
          ];

          // Add index with label then the raw config on next line for easy selection
          picked.forEach((cfg, i) => {
              fileLines.push(`# ${getShortLabel(cfg, i + 1)}`);
              fileLines.push(cfg);
              fileLines.push('');
          });

          const fileContent = fileLines.join('\n');
          const fileBuffer = Buffer.from(fileContent, 'utf8');

          // Send as downloadable document
          await sock.sendMessage(chatId, {
              document: fileBuffer,
              fileName: `v2ray-configs-${filterType}-${date}.txt`,
              mimetype: 'text/plain',
              caption: `✅ *${picked.length} ${filterType === 'ws' ? 'HTTP/WS' : filterType.toUpperCase()} configs*\n` +
                  `📦 Total pool: ${filtered.length} configs found\n\n` +
                  `*How to use:*\n` +
                  `1️⃣ Open the file above\n` +
                  `2️⃣ Copy one full config line (vmess://... or ss://...)\n` +
                  `3️⃣ Paste into HTTP Custom → V2Ray Config\n` +
                  `4️⃣ If it fails, copy the next config\n\n` +
                  `_Run again for fresh random configs_`
          }, { quoted: message });
      }
  };
  