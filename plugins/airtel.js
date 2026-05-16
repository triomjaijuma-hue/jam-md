import fs from 'fs';
  import path from 'path';
  import qrcode from 'qrcode';

  const CONFIG_FILE = path.join(process.cwd(), 'airtel_config.json');

  function getConfig() {
    try {
      if (fs.existsSync(CONFIG_FILE)) {
        return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
      }
    } catch {}
    return null;
  }

  function makeVlessLink(workerUrl, uuid, bugHost) {
    const wsPath = '/vless';
    return `vless://${uuid}@${workerUrl}:443?encryption=none&security=tls&sni=${workerUrl}&type=ws&host=${bugHost}&path=${encodeURIComponent(wsPath)}#Airtel-UG-${bugHost}`;
  }

  const BUG_HOSTS = [
    'web.whatsapp.com',
    'mmg.whatsapp.net',
    'airtel.co.ug',
    'selfcare.ug.airtel.com',
    '0.facebook.com',
  ];

  export default {
    command: /^airtel$/i,
    tags: ['tools'],
    description: 'Generate free Airtel Uganda internet configs',
    async run({ sock, msg }) {
      const jid = msg.key.remoteJid;
      const config = getConfig();

      if (!config) {
        return sock.sendMessage(jid, {
          text: '❌ Airtel config not set up yet.\nOwner must run:\n.airtelsetup <worker-url> <uuid>'
        });
      }

      await sock.sendMessage(jid, { text: '⏳ Generating Airtel Uganda free internet configs...' });

      const results = [];
      for (const bugHost of BUG_HOSTS) {
        const link = makeVlessLink(config.workerUrl, config.uuid, bugHost);
        try {
          const qrBuffer = await qrcode.toBuffer(link, { errorCorrectionLevel: 'M', width: 400 });
          await sock.sendMessage(jid, {
            image: qrBuffer,
            caption: `🇺🇬 *Airtel Uganda Free Internet*\n\n🐛 Bug Host: \`${bugHost}\`\n\n📋 *VLESS Link:*\n\`\`\`${link}\`\`\`\n\n📲 Scan QR in HTTP Custom or copy link to V2RayNG`
          });
        } catch {
          results.push(link);
        }
      }

      if (results.length > 0) {
        await sock.sendMessage(jid, {
          text: `🇺🇬 *Airtel Uganda VLESS Links:*\n\n${results.map((l,i) => `${i+1}. ${l}`).join('\n\n')}`
        });
      }

      await sock.sendMessage(jid, {
        text: '✅ Done! Try each config — the one with your best bug host will work.\n\n💡 *How to use:*\n• HTTP Custom: Scan QR → connect\n• V2RayNG: Copy link → import'
      });
    }
  };
  