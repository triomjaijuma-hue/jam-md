import fs from 'fs';
  import path from 'path';
  import { dataFile } from '../lib/paths.js';
  import store from '../lib/lightweight_store.js';
  import { askAI, getCurrentProvider, getProviderInfo } from '../lib/aiProvider.js';
  import { detectImageRequest, generateImage } from '../lib/imageGen.js';

  const DM_AI_FILE = dataFile('dmAiAll.json');
  const HAS_DB = !!(process.env.MONGO_URL || process.env.POSTGRES_URL || process.env.MYSQL_URL || process.env.DB_URL);
  const dmHistory = new Map();

  const AI_APIS = [
      { name: 'ZellAPI', url: t => `https://zellapi.autos/ai/chatbot?text=${encodeURIComponent(t)}`, parse: d => d?.result },
      { name: 'Hercai', url: t => `https://hercai.onrender.com/gemini/hercai?question=${encodeURIComponent(t)}`, parse: d => d?.reply },
      { name: 'SparkAPI', url: t => `https://discardapi.dpdns.org/api/chat/spark?apikey=guru&text=${encodeURIComponent(t)}`, parse: d => d?.result?.answer },
      { name: 'LlamaAPI', url: t => `https://discardapi.dpdns.org/api/bot/llama?apikey=guru&text=${encodeURIComponent(t)}`, parse: d => d?.result }
  ];

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

  async function getDmAiState() {
      try {
          if (HAS_DB) { const data = await store.getSetting('global', 'dmAiAll'); return data || { enabled: false }; }
          if (!fs.existsSync(DM_AI_FILE)) return { enabled: false };
          return JSON.parse(fs.readFileSync(DM_AI_FILE, 'utf8'));
      } catch { return { enabled: false }; }
  }

  async function setDmAiState(enabled) {
      try {
          if (HAS_DB) { await store.saveSetting('global', 'dmAiAll', { enabled }); return; }
          const dir = path.dirname(DM_AI_FILE);
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(DM_AI_FILE, JSON.stringify({ enabled }, null, 2));
      } catch (e) { console.error('dmAi save error:', e.message); }
  }

  function cleanReply(reply) {
      return reply.trim()
          .replace(/^(JAM-MD|Assistant|Bot|AI|Me):\s*/i, '')
          .replace(/^["']|["']$/g, '')
          .replace(/\n\s*\n/g, '\n').trim();
  }

  async function getAIReply(userMessage, history) {
      const prompt = `You are a real person chatting casually with a friend on WhatsApp. Reply naturally in 1-2 short sentences. Never say "How can I help you?" or reveal you are a bot.

  Recent chat:
  ${history.slice(-10).join('\n')}

  Friend said: ${userMessage}
  Your reply:`.trim();

      const providerName = await getCurrentProvider();
      const info = await getProviderInfo(providerName);

      // Premium provider with key set — use it exclusively, no silent fallback
      if (info && info.needsKey && info.hasKey) {
          try {
              const reply = await askAI(prompt);
              if (reply && typeof reply === 'string' && reply.trim()) {
                  return cleanReply(reply);
              }
              return null;
          } catch (err) {
              console.error(`[dmai] ${info.name} error:`, err.message);
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
                  .replace(/how can i help you\??/gi, 'how are you doing?')
                  .replace(/how may i (help|assist) you\??/gi, "what's up?")
                  .replace(/what can i (do|help) (for|with) you\??/gi, "what's going on?")
                  .replace(/i'm here to (help|assist)/gi, "I'm good")
                  .replace(/\n\s*\n/g, '\n').trim();
              if (reply) return reply;
          } catch { continue; }
      }
      return null;
  }

  export async function handleDmAiAll(sock, chatId, message, userMessage, senderId) {
      try {
          const state = await getDmAiState();
          if (!state.enabled) return false;
          if (!userMessage || !userMessage.trim()) return false;

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

          const instant = getInstantReply(userMessage.trim());
          if (instant) {
              try { await sock.presenceSubscribe(chatId); await sock.sendPresenceUpdate('composing', chatId); } catch { }
              await new Promise(r => setTimeout(r, 800 + Math.random() * 1200));
              await sock.sendMessage(chatId, { text: instant }, { quoted: message });
              if (!dmHistory.has(senderId)) dmHistory.set(senderId, []);
              const h = dmHistory.get(senderId);
              h.push(`Them: ${userMessage}`);
              h.push(`Me: ${instant}`);
              dmHistory.set(senderId, h);
              return true;
          }

          if (!dmHistory.has(senderId)) dmHistory.set(senderId, []);
          const history = dmHistory.get(senderId);
          history.push(`Them: ${userMessage}`);
          if (history.length > 30) history.splice(0, history.length - 30);

          try {
              await sock.presenceSubscribe(chatId);
              await sock.sendPresenceUpdate('composing', chatId);
              await new Promise(r => setTimeout(r, 1500 + Math.random() * 2000));
          } catch { }

          const reply = await getAIReply(userMessage, history);
          if (!reply) return false;

          history.push(`Me: ${reply}`);
          dmHistory.set(senderId, history);
          await sock.sendMessage(chatId, { text: reply }, { quoted: message });
          return true;
      } catch (err) {
          console.error('handleDmAiAll error:', err.message);
          return false;
      }
  }

  export default {
      command: 'aionall',
      aliases: ['aioffall'],
      category: 'download',
      description: 'Turn AI auto-reply on/off for all private DM chats',
      usage: '.aionall | .aioffall',
      ownerOnly: true,
      async handler(sock, message, args, context) {
          const { chatId } = context;
          const cmd = (message.message?.conversation || message.message?.extendedTextMessage?.text || '')
              .trim().toLowerCase().replace(/^[.!/#]/, '');
          const isOn = cmd === 'aionall';
          const current = await getDmAiState();
          if (isOn && current.enabled) return sock.sendMessage(chatId, { text: "⚠️ AI auto-reply for DMs is already *ON*.\nUse *.aioffall* to disable." }, { quoted: message });
          if (!isOn && !current.enabled) return sock.sendMessage(chatId, { text: "⚠️ AI auto-reply for DMs is already *OFF*.\nUse *.aionall* to enable." }, { quoted: message });
          await setDmAiState(isOn);
          const providerInfo = await getProviderInfo(await getCurrentProvider());
          const providerStatus = providerInfo?.hasKey ? `🔑 ${providerInfo.name}` : "🆓 Free APIs (use .aikey + .aiswitch for better accuracy)";
          if (isOn) {
              return sock.sendMessage(chatId, {
                  text: `✅ *AI DM Auto-Reply: ON*\n\n🤖 *Provider:* ${providerStatus}\n🎨 *Image gen:* enabled — just ask!\n\nUse *.aioffall* to turn off.`
              }, { quoted: message });
          }
          dmHistory.clear();
          return sock.sendMessage(chatId, { text: "❌ *AI DM Auto-Reply: OFF*\n\nUse *.aionall* to turn back on." }, { quoted: message });
      }
  };
  