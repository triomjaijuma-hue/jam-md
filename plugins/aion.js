import fs from 'fs';
  import path from 'path';
  import { dataFile } from '../lib/paths.js';
  import store from '../lib/lightweight_store.js';
  import { askAI, getCurrentProvider, getProviderInfo } from '../lib/aiProvider.js';
  import { detectImageRequest, generateImage } from '../lib/imageGen.js';

  const AUTO_AI_FILE = dataFile('autoAi.json');
  const HAS_DB = !!(process.env.MONGO_URL || process.env.POSTGRES_URL || process.env.MYSQL_URL || process.env.DB_URL);
  const chatHistory = new Map();

  const AI_APIS = [
      { name: 'ZellAPI', url: t => `https://zellapi.autos/ai/chatbot?text=${encodeURIComponent(t)}`, parse: d => d?.result },
      { name: 'Hercai', url: t => `https://hercai.onrender.com/gemini/hercai?question=${encodeURIComponent(t)}`, parse: d => d?.reply },
      { name: 'SparkAPI', url: t => `https://discardapi.dpdns.org/api/chat/spark?apikey=guru&text=${encodeURIComponent(t)}`, parse: d => d?.result?.answer },
      { name: 'LlamaAPI', url: t => `https://discardapi.dpdns.org/api/bot/llama?apikey=guru&text=${encodeURIComponent(t)}`, parse: d => d?.result }
  ];

  // ── Greeting interceptor — never reaches the AI for simple greetings ──────────
  const GREETING_PATTERNS = [
      /^(hey+|hi+|hello+|helo+|holla+|hola+|sup|wassup|yo+|oya|howdy)[s!?.]*$/i,
      /^(good\s?(morning|afternoon|evening|night|day))[s!?.]*$/i,
      /^(morning|afternoon|evening|night)[s!?.]*$/i,
      /^(hie|hye|hai|heya|heyy+|hiii+|hihi|heyyy+)[s!?.]*$/i,
      /^(ola|salut|bonjour|ciao|namaste|salam)[s!?.]*$/i,
  ];
  const GREETING_REPLIES = [
      "Hey! How are you doing? 😊",
      "Hey! How is everything going?",
      "Heyy! What's up? 😄",
      "Hey, how's it going?",
      "Heyyy! How have you been?",
      "Hey! Good to hear from you 😊 How are you?",
      "Hey! What's good?",
      "Yo! How is life treating you?",
      "Heyyy! You good? 😊",
      "Hey! How is your day going?",
      "Hey! Hope you are doing well 😊",
      "What's up! How are things?",
  ];
  const THANKS_PATTERNS = [
      /^(thank(s| you)+|thx|ty|thnks|thnx|cheers|appreciate it|gracias|merci)[s!?.]*$/i,
  ];
  const THANKS_REPLIES = [
      "No problem at all 😊",
      "Anytime! 😄",
      "Of course! 🙌",
      "Happy to help!",
      "Don't mention it 😊",
      "Sure thing! 😄",
  ];
  const BYE_PATTERNS = [
      /^(bye+|goodbye|good\s?bye|cya|see ya|later|take care|ttyl|gotta go|gtg|peace)[s!?.]*$/i,
  ];
  const BYE_REPLIES = [
      "Take care! 👋",
      "Bye! Talk later 😊",
      "See you! 👋",
      "Later! 😄",
      "Take care of yourself 😊",
      "Bye bye! 👋 Have a good one!",
  ];
  const HOW_ARE_YOU_PATTERNS = [
      /^(how are you|how r u|how are u|hru|how do you do|how is it going|how is everything|you okay|u ok|you good|u good|are you okay|are you good)[s!?.]*$/i,
  ];
  const HOW_ARE_YOU_REPLIES = [
      "I'm good! Thanks for asking 😊 What about you?",
      "Doing great! How about yourself? 😄",
      "All good on my end 😊 How are you doing?",
      "Pretty good! You? 😄",
      "I'm well, thanks! How is your day going?",
      "Good good 😊 How are you?",
  ];

  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  function getInstantReply(text) {
      const t = text.trim();
      if (GREETING_PATTERNS.some(r => r.test(t))) return pick(GREETING_REPLIES);
      if (HOW_ARE_YOU_PATTERNS.some(r => r.test(t))) return pick(HOW_ARE_YOU_REPLIES);
      if (THANKS_PATTERNS.some(r => r.test(t))) return pick(THANKS_REPLIES);
      if (BYE_PATTERNS.some(r => r.test(t))) return pick(BYE_REPLIES);
      return null;
  }

  async function getAutoAiChats() {
      try {
          if (HAS_DB) return (await store.getSetting('global', 'autoAi')) || {};
          if (!fs.existsSync(AUTO_AI_FILE)) return {};
          return JSON.parse(fs.readFileSync(AUTO_AI_FILE, 'utf8'));
      } catch { return {}; }
  }

  async function setAutoAiChats(data) {
      try {
          if (HAS_DB) { await store.saveSetting('global', 'autoAi', data); }
          else {
              const dir = path.dirname(AUTO_AI_FILE);
              if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
              fs.writeFileSync(AUTO_AI_FILE, JSON.stringify(data, null, 2));
          }
      } catch (e) { console.error('autoAi save error:', e.message); }
  }

  function cleanReply(reply) {
      return reply.trim()
          .replace(/^(JAM-MD|Assistant|Bot|AI|Me):\s*/i, '')
          .replace(/^["']|["']$/g, '')
          .replace(/\n\s*\n/g, '\n').trim();
  }

  async function getAIReply(userMessage, history) {
      const prompt = `You are a real person chatting on WhatsApp. You follow football, pop culture, viral moments, celebrities and internet trends. Reply like a human texting — short and casual for normal chat, but actually answer when they ask about something you know (viral moments, sports, celebs etc). Use emojis naturally. Never reveal you are a bot. Always reply in the same language the friend used.

Recent chat:
${history.slice(-10).join('\n')}

Friend said: ${userMessage}
Your reply:`.trim();

      const providerName = await getCurrentProvider();
      const info = await getProviderInfo(providerName);

      // Premium provider with key set — use exclusively, no silent fallback
      if (info && info.needsKey && info.hasKey) {
          try {
              const reply = await askAI(prompt);
              if (reply && typeof reply === 'string' && reply.trim()) return cleanReply(reply);
              return null;
          } catch (err) {
              console.error(`[aion] ${info.name} error:`, err.message);
              const isRateLimit = err.message?.toLowerCase().includes('rate limit') || err.message?.includes('429');
              if (isRateLimit) return `⚠️ ${err.message}`;
              return `⚠️ ${info.name} failed: ${err.message}\nCheck key: .aikey ${providerName} YOUR_KEY or switch: .aiswitch groq`;
          }
      }

      // Free provider — try askAI first, then fall back to free APIs
      if (info && !info.needsKey) {
          try {
              const reply = await askAI(prompt);
              if (reply && typeof reply === 'string' && reply.trim()) return cleanReply(reply);
          } catch (_) { }
      }

      // Last-resort free API fallback
      for (const api of AI_APIS) {
          try {
              const controller = new AbortController();
              const tid = setTimeout(() => controller.abort(), 12000);
              const res = await fetch(api.url(prompt), { signal: controller.signal });
              clearTimeout(tid);
              if (!res.ok) continue;
              const data = await res.json();
              let reply = api.parse(data);
              if (!reply || typeof reply !== 'string') continue;
              reply = reply.trim()
                  .replace(/^(JAM-MD|Assistant|Bot|AI|Me):\s*/i, '')
                  .replace(/^["']|["']$/g, '')
                  .replace(/how can i help you\??/gi, "how are you doing?")
                  .replace(/how may i (help|assist) you\??/gi, "what's up?")
                  .replace(/what can i (do|help) (for|with) you\??/gi, "what's going on?")
                  .replace(/i'm here to (help|assist)/gi, "I'm good")
                  .replace(/\n\s*\n/g, '\n').trim();
              if (reply) return reply;
          } catch { continue; }
      }
      return null;
  }

  export async function handlePerChatAi(sock, chatId, message, userMessage, senderId) {
      try {
          const chats = await getAutoAiChats();
          if (!chats[chatId]) return false;
          if (!userMessage || !userMessage.trim()) return false;

          // ── Image generation detection ─────────────────────────────────────
          const imagePrompt = detectImageRequest(userMessage.trim());
          if (imagePrompt) {
              try { await sock.presenceSubscribe(chatId); await sock.sendPresenceUpdate('composing', chatId); } catch { }
              await sock.sendMessage(chatId, { text: `🎨 Generating image...\n_"${imagePrompt}"_` }, { quoted: message });
              try {
                  const buf = await generateImage(imagePrompt);
                  await sock.sendMessage(chatId, { image: buf, caption: `🎨 *${imagePrompt}*\n_Generated by Pollinations AI_` }, { quoted: message });
              } catch {
                  await sock.sendMessage(chatId, { text: "❌ Couldn't generate that image. Try a different description." }, { quoted: message });
              }
              return true;
          }

          // ── Instant reply for greetings — bypass AI entirely ──────────────
          const instant = getInstantReply(userMessage.trim());
          if (instant) {
              try { await sock.presenceSubscribe(chatId); await sock.sendPresenceUpdate('composing', chatId); } catch { }
              await new Promise(r => setTimeout(r, 800 + Math.random() * 1200));
              await sock.sendMessage(chatId, { text: instant }, { quoted: message });
              const key = `${chatId}:${senderId}`;
              if (!chatHistory.has(key)) chatHistory.set(key, []);
              const h = chatHistory.get(key);
              h.push(`Them: ${userMessage}`);
              h.push(`Me: ${instant}`);
              chatHistory.set(key, h);
              return true;
          }

          const key = `${chatId}:${senderId}`;
          if (!chatHistory.has(key)) chatHistory.set(key, []);
          const history = chatHistory.get(key);
          history.push(`Them: ${userMessage}`);
          if (history.length > 20) history.splice(0, history.length - 20);

          try {
              await sock.presenceSubscribe(chatId);
              await sock.sendPresenceUpdate('composing', chatId);
              await new Promise(r => setTimeout(r, 1500 + Math.random() * 1500));
          } catch { }

          const reply = await getAIReply(userMessage, history);
          if (!reply) return false;

          history.push(`Me: ${reply}`);
          chatHistory.set(key, history);
          await sock.sendMessage(chatId, { text: reply }, { quoted: message });
          return true;
      } catch (err) {
          console.error('handlePerChatAi error:', err.message);
          return false;
      }
  }

  const aionPlugin = {
      command: 'aion',
      aliases: ['enableai'],
      category: 'ai',
      description: 'Enable AI auto-reply in this specific chat',
      usage: '.aion',
      ownerOnly: true,
      async handler(sock, message, args, context) {
          const { chatId } = context;
          const chats = await getAutoAiChats();
          if (chats[chatId]) {
              return sock.sendMessage(chatId, {
                  text: "⚠️ AI auto-reply is already *ON* in this chat.\nUse *.aioff* to disable it."
              }, { quoted: message });
          }
          chats[chatId] = true;
          await setAutoAiChats(chats);
          const chatType = chatId.endsWith('@g.us') ? 'group' : 'DM';
          return sock.sendMessage(chatId, {
              text: `✅ *AI Auto-Reply: ON*\n\n` +
                  `Replies naturally like a real person — no more "How can I help you?" 😄\n` +
                  `Also generates images when asked 🎨\n\n` +
                  `Use *.aioff* to turn off.`
          }, { quoted: message });
      }
  };

  export default aionPlugin;
  