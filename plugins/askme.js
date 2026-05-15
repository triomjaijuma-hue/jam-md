import { askAI, getCurrentProvider, getProviderInfo } from '../lib/aiProvider.js';

  // Free API fallback pool
  const FREE_APIS = [
      {
          name: 'ZellAPI',
          url: t => `https://zellapi.autos/ai/chatbot?text=${encodeURIComponent(t)}`,
          parse: d => d?.result
      },
      {
          name: 'Hercai',
          url: t => `https://hercai.onrender.com/gemini/hercai?question=${encodeURIComponent(t)}`,
          parse: d => d?.reply
      },
      {
          name: 'SparkAPI',
          url: t => `https://discardapi.dpdns.org/api/chat/spark?apikey=guru&text=${encodeURIComponent(t)}`,
          parse: d => d?.result?.answer
      },
      {
          name: 'LlamaAPI',
          url: t => `https://discardapi.dpdns.org/api/bot/llama?apikey=guru&text=${encodeURIComponent(t)}`,
          parse: d => d?.result
      }
  ];

  async function getFreeReply(prompt) {
      for (const api of FREE_APIS) {
          try {
              const controller = new AbortController();
              const tid = setTimeout(() => controller.abort(), 12000);
              const res = await fetch(api.url(prompt), { signal: controller.signal });
              clearTimeout(tid);
              if (!res.ok) continue;
              const data = await res.json();
              const reply = api.parse(data);
              if (reply && typeof reply === 'string' && reply.trim()) return reply.trim();
          } catch { continue; }
      }
      return null;
  }

  export default {
      command: 'askme',
      aliases: ['ask', 'ai', 'gpt', 'query'],
      category: 'ai',
      description: 'Ask the AI a one-off question in any chat',
      usage: '.askme <your question>',
      async handler(sock, message, args, context) {
          const chatId = context.chatId || message.key.remoteJid;
          const question = args.join(' ').trim();

          if (!question) {
              return sock.sendMessage(chatId, {
                  text: `🤖 *Usage:* .askme <your question>\n\n` +
                      `*Examples:*\n` +
                      `• .askme what is the capital of Uganda\n` +
                      `• .askme explain blockchain in simple terms\n` +
                      `• .askme write a short poem about rain`
              }, { quoted: message });
          }

          // Show typing indicator
          try {
              await sock.presenceSubscribe(chatId);
              await sock.sendPresenceUpdate('composing', chatId);
          } catch { }

          const providerName = await getCurrentProvider();
          const info = await getProviderInfo(providerName);
          let reply = null;
          let usedProvider = null;

          // Try selected key-based provider first
          if (info && info.hasKey) {
              try {
                  reply = await askAI(question);
                  usedProvider = info.name;
              } catch (_) { /* fall through */ }
          }

          // Fallback to free API pool
          if (!reply) {
              reply = await getFreeReply(question);
              usedProvider = 'Free API';
          }

          if (!reply) {
              return sock.sendMessage(chatId, {
                  text: '❌ All AI providers failed to respond. Try again in a moment.'
              }, { quoted: message });
          }

          await sock.sendMessage(chatId, {
              text: `${reply}\n\n_— ${usedProvider}_`
          }, { quoted: message });
      }
  };
  