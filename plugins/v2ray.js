// V2Ray config fetcher — pulls from public aggregator sources

  const CONFIG_SOURCES = [
      // Large aggregated lists (base64 encoded)
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
          const res = await fetch(url, {
              signal: controller.signal,
              headers: { 'User-Agent': 'Mozilla/5.0' }
          });
          clearTimeout(tid);
          if (!res.ok) return null;
          const text = await res.text();
          return text.trim();
      } catch { return null; }
  }

  function decodeConfigs(raw) {
      if (!raw) return [];
      let text = raw;
      // Try base64 decode
      try {
          const decoded = Buffer.from(raw, 'base64').toString('utf8');
          if (decoded.includes('vmess://') || decoded.includes('vless://') ||
              decoded.includes('trojan://') || decoded.includes('ss://')) {
              text = decoded;
          }
      } catch { }
      // Split into individual config lines
      const lines = text.split(/[\n\r]+/)
          .map(l => l.trim())
          .filter(l => l.startsWith('vmess://') || l.startsWith('vless://') ||
              l.startsWith('trojan://') || l.startsWith('ss://'));
      return lines;
  }

  function getProtocol(cfg) {
      if (cfg.startsWith('vmess://')) return 'VMESS';
      if (cfg.startsWith('vless://')) return 'VLESS';
      if (cfg.startsWith('trojan://')) return 'TROJAN';
      if (cfg.startsWith('ss://')) return 'SS';
      return 'UNKNOWN';
  }

  function parseVmess(cfg) {
      try {
          const b64 = cfg.replace('vmess://', '');
          const json = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
          return {
              name: json.ps || json.add || 'unnamed',
              server: json.add,
              port: json.port,
              net: json.net || 'tcp',
              tls: json.tls || 'none',
          };
      } catch { return null; }
  }

  function isHttpFriendly(cfg) {
      const protocol = getProtocol(cfg);
      if (protocol === 'VMESS') {
          const info = parseVmess(cfg);
          if (!info) return false;
          // Prefer ws (WebSocket) or http network — works well with HTTP Custom
          return info.net === 'ws' || info.net === 'http' || info.net === 'h2';
      }
      if (protocol === 'VLESS') {
          return cfg.includes('type=ws') || cfg.includes('type=http') ||
              cfg.includes('transport=ws');
      }
      return true;
  }

  function formatConfig(cfg, index) {
      const protocol = getProtocol(cfg);
      let details = '';
      if (protocol === 'VMESS') {
          const info = parseVmess(cfg);
          if (info) {
              details = `📡 ${info.server}:${info.port} [${info.net.toUpperCase()}]`;
          }
      } else if (protocol === 'VLESS' || protocol === 'TROJAN') {
          try {
              const url = new URL(cfg);
              details = `📡 ${url.hostname}:${url.port || 443}`;
          } catch { }
      }
      return `*${index}. ${protocol}*${details ? '\n' + details : ''}\n\`\`\`\n${cfg}\n\`\`\``;
  }

  export default {
      command: 'v2ray',
      aliases: ['config', 'vpnconfig', 'httpcustom', 'hc'],
      category: 'tools',
      description: 'Get free working V2Ray/HTTP Custom config files',
      usage: '.v2ray [ws|vmess|vless|trojan|all] [number]',
      async handler(sock, message, args, context) {
          const chatId = context.chatId || message.key.remoteJid;
          const filterArg = (args[0] || 'ws').toLowerCase();
          const count = Math.min(parseInt(args[1]) || 3, 8);

          const filterMap = {
              ws: 'ws', websocket: 'ws',
              vmess: 'vmess', vless: 'vless',
              trojan: 'trojan', ss: 'ss',
              all: 'all', http: 'ws', httpcustom: 'ws', hc: 'ws'
          };
          const filterType = filterMap[filterArg] || 'ws';

          await sock.sendMessage(chatId, {
              text: `🔍 Fetching V2Ray configs...\n_Searching ${CONFIG_SOURCES.length} sources for ${filterType === 'all' ? 'all protocols' : filterType.toUpperCase() + '/WS configs'}_`
          }, { quoted: message });

          try {
              await sock.presenceSubscribe(chatId);
              await sock.sendPresenceUpdate('composing', chatId);
          } catch { }

          // Fetch from all sources in parallel
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

          // Deduplicate
          allConfigs = [...new Set(allConfigs)];

          // Filter
          let filtered = allConfigs;
          if (filterType !== 'all') {
              if (filterType === 'ws') {
                  filtered = allConfigs.filter(c => isHttpFriendly(c));
              } else {
                  filtered = allConfigs.filter(c => c.startsWith(filterType + '://'));
              }
          }

          if (filtered.length === 0) {
              return sock.sendMessage(chatId, {
                  text: `❌ No *${filterType}* configs found in current pool.\nTry: .v2ray all`
              }, { quoted: message });
          }

          // Pick random ones
          const shuffled = filtered.sort(() => Math.random() - 0.5).slice(0, count);

          // Send summary first
          await sock.sendMessage(chatId, {
              text: `✅ *Found ${filtered.length} configs* — sending ${shuffled.length} random ones\n\n` +
                  `*Type:* ${filterType === 'ws' ? 'HTTP/WS (HTTP Custom compatible)' : filterType.toUpperCase()}\n` +
                  `*Usage in HTTP Custom:* Paste config → V2Ray/VMess section\n` +
                  `_Refresh daily for new working configs_`
          }, { quoted: message });

          // Send each config as separate message so it's easy to copy
          for (let i = 0; i < shuffled.length; i++) {
              await new Promise(r => setTimeout(r, 500));
              await sock.sendMessage(chatId, {
                  text: formatConfig(shuffled[i], i + 1)
              }, { quoted: message });
          }

          await sock.sendMessage(chatId, {
              text: `💡 *Tips:*\n` +
                  `• Copy the full config line (vmess://... or vless://...)\n` +
                  `• In HTTP Custom: Settings → V2Ray Config → Paste\n` +
                  `• Try *.v2ray all 5* for more config types\n` +
                  `• Try *.v2ray vmess 5* for VMess only\n` +
                  `• Configs change daily — run again if one stops working`
          }, { quoted: message });
      }
  };
  