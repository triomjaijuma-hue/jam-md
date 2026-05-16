import fs from 'fs';
  import path from 'path';

  const CONFIG_FILE = path.join(process.cwd(), 'airtel_config.json');

  export default {
      command: 'airtelsetup',
      aliases: [],
      category: 'owner',
      description: 'Set Cloudflare Worker URL and UUID for Airtel Uganda configs',
      usage: '.airtelsetup <worker-url> <uuid>',
      strictOwnerOnly: true,
      async handler(sock, message, args, context) {
          const chatId = context.chatId || message.key.remoteJid;
          const [workerUrl, uuid] = args;
          if (!workerUrl || !uuid) {
              return sock.sendMessage(chatId, {
                  text: '❌ Usage: .airtelsetup <worker-url> <uuid>\nExample: .airtelsetup jam-md-proxy.jumatjai.workers.dev 1c0aed11-4836-4431-b028-14e15dfe033c'
              }, { quoted: message });
          }
          const config = { workerUrl: workerUrl.replace(/^https?:\/\//, ''), uuid };
          fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
          await sock.sendMessage(chatId, {
              text: `✅ Airtel config saved!\n🌐 Worker: ${config.workerUrl}\n🔑 UUID: ${config.uuid}`
          }, { quoted: message });
      }
  };
  