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
      command: 'airtel',
      aliases: ['airtelug'],
      category: 'tools',
      description: 'Generate free Airtel Uganda internet configs for HTTP Custom / V2RayNG',
      usage: '.airtel',
      async handler(sock, message, args, context) {
          const chatId = context.chatId || message.key.remoteJid;
          const config = getConfig();

          if (!config) {
              return sock.sendMessage(chatId, {
                  text: '❌ Airtel config not set up yet.\nOwner must run:\n.airtelsetup <worker-url> <uuid>'
              }, { quoted: message });
          }

          await sock.sendMessage(chatId, {
              text: '⏳ Generating Airtel Uganda free internet configs...'
          }, { quoted: message });

          const links = [];
          for (const bugHost of BUG_HOSTS) {
              const link = makeVlessLink(config.workerUrl, config.uuid, bugHost);
              try {
                  const qrBuffer = await qrcode.toBuffer(link, { errorCorrectionLevel: 'M', width: 400 });
                  await sock.sendMessage(chatId, {
                      image: qrBuffer,
                      caption: `🇺🇬 *Airtel Uganda Free Internet*\n\n🐛 Bug Host: \`${bugHost}\`\n\n📋 *VLESS Link:*\n\`\`\`${link}\`\`\`\n\n📲 Scan in HTTP Custom or copy to V2RayNG`
                  });
              } catch {
                  links.push(`${bugHost}: ${link}`);
              }
          }

          if (links.length > 0) {
              await sock.sendMessage(chatId, {
                  text: `🇺🇬 *Airtel Uganda VLESS Links:*\n\n${links.join('\n\n')}`
              });
          }

          await sock.sendMessage(chatId, {
              text: '✅ Done! Try each config — the one with your best bug host will work.\n\n💡 *How to use:*\n• HTTP Custom: Scan QR → connect\n• V2RayNG: Copy link → import'
          }, { quoted: message });
      }
  };
  