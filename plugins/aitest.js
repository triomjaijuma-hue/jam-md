import { askAI, getCurrentProvider, getProviderInfo } from '../lib/aiProvider.js';

  export default {
      command: 'aitest',
      aliases: ['testai', 'pingai'],
      category: 'ai',
      description: 'Test the currently active AI provider with a quick ping',
      usage: '.aitest',
      ownerOnly: true,
      async handler(sock, message, args, context) {
          const chatId = context.chatId || message.key.remoteJid;
          const provider = await getCurrentProvider();
          const info = await getProviderInfo(provider);

          if (info.needsKey && !info.hasKey) {
              return sock.sendMessage(chatId, {
                  text: `❌ *${info.name}* has no API key set.\nUse: .aikey ${provider} YOUR_KEY`
              }, { quoted: message });
          }

          await sock.sendMessage(chatId, {
              text: `🔄 Testing *${info.name}*...`
          }, { quoted: message });

          const start = Date.now();
          try {
              const reply = await askAI('Reply with exactly: OK');
              const ms = Date.now() - start;
              await sock.sendMessage(chatId, {
                  text: `✅ *${info.name}* is working!\n⏱ Response time: ${ms}ms\n💬 Reply: ${reply.slice(0, 120)}`
              }, { quoted: message });
          } catch (err) {
              const ms = Date.now() - start;
              await sock.sendMessage(chatId, {
                  text: `❌ *${info.name}* failed after ${ms}ms\n⚠️ Error: ${err.message}`
              }, { quoted: message });
          }
      }
  };
  