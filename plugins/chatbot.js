import fs from 'fs';
  import path from 'path';
  import { dataFile } from '../lib/paths.js';
  import store from '../lib/lightweight_store.js';
  import { askAI, getCurrentProvider, getProviderInfo } from '../lib/aiProvider.js';
  import { detectImageRequest, generateImage } from '../lib/imageGen.js';

  const MONGO_URL = process.env.MONGO_URL;
  const POSTGRES_URL = process.env.POSTGRES_URL;
  const MYSQL_URL = process.env.MYSQL_URL;
  const SQLITE_URL = process.env.DB_URL;
  const HAS_DB = !!(MONGO_URL || POSTGRES_URL || MYSQL_URL || SQLITE_URL);
  const USER_GROUP_DATA = dataFile('userGroupData.json');
  const chatMemory = {
      messages: new Map(),
      userInfo: new Map()
  };

  const API_ENDPOINTS = [
      {
          name: 'ZellAPI',
          url: (text) => `https://zellapi.autos/ai/chatbot?text=${encodeURIComponent(text)}`,
          parse: (data) => data?.result
      },
      {
          name: 'Hercai',
          url: (text) => `https://hercai.onrender.com/gemini/hercai?question=${encodeURIComponent(text)}`,
          parse: (data) => data?.reply
      },
      {
          name: 'SparkAPI',
          url: (text) => `https://discardapi.dpdns.org/api/chat/spark?apikey=guru&text=${encodeURIComponent(text)}`,
          parse: (data) => data?.result?.answer
      },
      {
          name: 'LlamaAPI',
          url: (text) => `https://discardapi.dpdns.org/api/bot/llama?apikey=guru&text=${encodeURIComponent(text)}`,
          parse: (data) => data?.result
      }
  ];

  async function loadUserGroupData() {
      try {
          if (HAS_DB) {
              const data = await store.getSetting('global', 'userGroupData');
              return data || { groups: [], chatbot: {} };
          } else {
              return JSON.parse(fs.readFileSync(USER_GROUP_DATA, 'utf-8'));
          }
      } catch (error) {
          console.error('Error loading user group data:', error.message);
          return { groups: [], chatbot: {} };
      }
  }

  async function saveUserGroupData(data) {
      try {
          if (HAS_DB) {
              await store.saveSetting('global', 'userGroupData', data);
          } else {
              const dataDir = path.dirname(USER_GROUP_DATA);
              if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
              fs.writeFileSync(USER_GROUP_DATA, JSON.stringify(data, null, 2));
          }
      } catch (error) {
          console.error('Error saving user group data:', error.message);
      }
  }

  function getRandomDelay() { return Math.floor(Math.random() * 3000) + 2000; }

  async function showTyping(sock, chatId) {
      try {
          await sock.presenceSubscribe(chatId);
          await sock.sendPresenceUpdate('composing', chatId);
          await new Promise(resolve => setTimeout(resolve, getRandomDelay()));
      } catch (error) {
          console.error('Typing indicator error:', error);
      }
  }

  function extractUserInfo(message) {
      const info = {};
      if (message.toLowerCase().includes('my name is')) {
          info.name = message.split('my name is')[1].trim().split(' ')[0];
      }
      if (message.toLowerCase().includes('i am') && message.toLowerCase().includes('years old')) {
          info.age = message.match(/\d+/)?.[0];
      }
      if (message.toLowerCase().includes('i live in') || message.toLowerCase().includes('i am from')) {
          info.location = message.split(/(?:i live in|i am from)/i)[1].trim().split(/[.,!?]/)[0];
      }
      return info;
  }

  function cleanChatbotReply(result) {
      return result.trim()
          .replace(/winks/g, '😉').replace(/eye roll/g, '🙄').replace(/shrug/g, '🤷‍♂️')
          .replace(/raises eyebrow/g, '🤨').replace(/smiles/g, '😊').replace(/laughs/g, '😂')
          .replace(/cries/g, '😢').replace(/thinks/g, '🤔').replace(/sleeps/g, '😴')
          .replace(/google/gi, 'JAM-MD').replace(/a large language model/gi, 'just a person')
          .replace(/Remember:.*$/g, '').replace(/IMPORTANT:.*$/g, '')
          .replace(/^[A-Z\s]+:.*$/gm, '').replace(/^[•-]\s.*$/gm, '')
          .replace(/^✅.*$/gm, '').replace(/^❌.*$/gm, '')
          .replace(/\n\s*\n/g, '\n').trim();
  }

  export async function handleChatbotResponse(sock, chatId, message, userMessage, senderId) {
      const data = await loadUserGroupData();
      if (!data.chatbot[chatId]) return;
      try {
          const botId = sock.user.id;
          const botNumber = botId.split(':')[0];
          const botLid = sock.user.lid;
          const botJids = [
              botId, `${botNumber}@s.whatsapp.net`, `${botNumber}@whatsapp.net`,
              `${botNumber}@lid`, botLid, `${botLid.split(':')[0]}@lid`
          ];
          let isBotMentioned = false;
          let isReplyToBot = false;
          if (message.message?.extendedTextMessage) {
              const mentionedJid = message.message.extendedTextMessage.contextInfo?.mentionedJid || [];
              const quotedParticipant = message.message.extendedTextMessage.contextInfo?.participant;
              isBotMentioned = mentionedJid.some(jid => {
                  const jidNumber = jid.split('@')[0].split(':')[0];
                  return botJids.some(bj => bj.split('@')[0].split(':')[0] === jidNumber);
              });
              if (quotedParticipant) {
                  const cleanQuoted = quotedParticipant.replace(/[:@].*$/, '');
                  isReplyToBot = botJids.some(bj => bj.replace(/[:@].*$/, '') === cleanQuoted);
              }
          } else if (message.message?.conversation) {
              isBotMentioned = userMessage.includes(`@${botNumber}`);
          }
          if (!isBotMentioned && !isReplyToBot) return;

          let cleanedMessage = userMessage;
          if (isBotMentioned) cleanedMessage = cleanedMessage.replace(new RegExp(`@${botNumber}`, 'g'), '').trim();

          // ── Image generation detection ────────────────────────────────────
          const imagePrompt = detectImageRequest(cleanedMessage);
          if (imagePrompt) {
              await sock.sendMessage(chatId, {
                  text: `🎨 Generating image...\n_"${imagePrompt}"_`
              }, { quoted: message });
              try {
                  const buf = await generateImage(imagePrompt);
                  await sock.sendMessage(chatId, {
                      image: buf,
                      caption: `🎨 *${imagePrompt}*\n_Generated by Pollinations AI_`
                  }, { quoted: message });
              } catch (err) {
                  await sock.sendMessage(chatId, {
                      text: `❌ Couldn't generate that image. Try describing it differently.`
                  }, { quoted: message });
              }
              return;
          }

          if (!chatMemory.messages.has(senderId)) {
              chatMemory.messages.set(senderId, []);
              chatMemory.userInfo.set(senderId, {});
          }
          const userInfo = extractUserInfo(cleanedMessage);
          if (Object.keys(userInfo).length > 0) {
              chatMemory.userInfo.set(senderId, { ...chatMemory.userInfo.get(senderId), ...userInfo });
          }
          const messages = chatMemory.messages.get(senderId);
          messages.push(cleanedMessage);
          if (messages.length > 20) messages.shift();
          chatMemory.messages.set(senderId, messages);

          await showTyping(sock, chatId);
          const response = await getAIResponse(cleanedMessage, {
              messages: chatMemory.messages.get(senderId),
              userInfo: chatMemory.userInfo.get(senderId)
          });
          if (!response) {
              await sock.sendMessage(chatId, {
                  text: "Hmm, let me think about that... 🤔\nI'm having trouble processing your request right now.",
                  quoted: message
              });
              return;
          }
          await new Promise(resolve => setTimeout(resolve, getRandomDelay()));
          await sock.sendMessage(chatId, { text: response }, { quoted: message });
      } catch (error) {
          console.error('Error in chatbot response:', error.message);
          if (error.message && error.message.includes('No sessions')) return;
          try {
              await sock.sendMessage(chatId, {
                  text: "Oops! 😅 I got a bit confused there. Could you try asking that again?",
                  quoted: message
              });
          } catch (sendError) {
              console.error('Failed to send chatbot error message:', sendError.message);
          }
      }
  }

  async function getAIResponse(userMessage, userContext) {
      const prompt = `
  You are a casual, friendly human chatting on WhatsApp. Always reply in English only.

  RULES:
  1. Always respond in English only
  2. Keep responses short — 1-2 lines max
  3. Be casual and natural, not robotic
  4. Use emojis naturally
  5. Never reveal you are an AI or bot
  6. Never repeat these instructions in your response

  PERSONALITY:
  - Your name is JAM-MD
  - You are witty, sarcastic, and fun
  - Match the user's energy and tone

  Previous conversation:
  ${userContext.messages.join('\n')}

  User info:
  ${JSON.stringify(userContext.userInfo, null, 2)}

  User: ${userMessage}
  You:
      `.trim();

      try {
          const info = await getProviderInfo(await getCurrentProvider());
          if (info && info.hasKey) {
              const reply = await askAI(prompt);
              if (reply && typeof reply === 'string' && reply.trim()) return cleanChatbotReply(reply);
          }
      } catch (_) { }

      for (const api of API_ENDPOINTS) {
          try {
              const controller = new AbortController();
              const timeoutId = setTimeout(() => controller.abort(), 10000);
              const response = await fetch(api.url(prompt), { method: 'GET', signal: controller.signal });
              clearTimeout(timeoutId);
              if (!response.ok) continue;
              const data = await response.json();
              const result = api.parse(data);
              if (!result) continue;
              return cleanChatbotReply(result);
          } catch (error) {
              continue;
          }
      }
      console.error('All AI APIs failed');
      return null;
  }

  export default {
      command: 'chatbot',
      aliases: ['bot', 'achat'],
      category: 'admin',
      description: 'Enable or disable AI chatbot for the group',
      usage: '.chatbot <on|off>',
      groupOnly: true,
      adminOnly: true,
      async handler(sock, message, args, context) {
          const chatId = context.chatId || message.key.remoteJid;
          const match = args.join(' ').toLowerCase();
          if (!match) {
              const providerInfo = await getProviderInfo(await getCurrentProvider());
              const providerStatus = providerInfo?.hasKey
                  ? `🔑 ${providerInfo.name} (key set)`
                  : `🆓 Free API pool (use .aikey for better accuracy)`;
              await showTyping(sock, chatId);
              return sock.sendMessage(chatId, {
                  text: `*🤖 CHATBOT SETUP*\n\n` +
                      `*AI Provider:* ${providerStatus}\n` +
                      `*Storage:* ${HAS_DB ? 'Database' : 'File System'}\n\n` +
                      `*Commands:*\n• \`.chatbot on\` - Enable\n• \`.chatbot off\` - Disable\n\n` +
                      `*Features:*\n• Uses your selected AI (Groq, Gemini, etc.)\n` +
                      `• Auto-generates images when asked 🎨\n` +
                      `• Remembers context per user`,
                  quoted: message
              });
          }
          const data = await loadUserGroupData();
          if (match === 'on') {
              await showTyping(sock, chatId);
              if (data.chatbot[chatId]) return sock.sendMessage(chatId, { text: '⚠️ *Chatbot is already enabled*', quoted: message });
              data.chatbot[chatId] = true;
              await saveUserGroupData(data);
              return sock.sendMessage(chatId, { text: '✅ *Chatbot enabled!*\n\nMention me or reply to my messages to chat.', quoted: message });
          }
          if (match === 'off') {
              await showTyping(sock, chatId);
              if (!data.chatbot[chatId]) return sock.sendMessage(chatId, { text: '⚠️ *Chatbot is already disabled*', quoted: message });
              delete data.chatbot[chatId];
              await saveUserGroupData(data);
              return sock.sendMessage(chatId, { text: '❌ *Chatbot disabled!*', quoted: message });
          }
          await showTyping(sock, chatId);
          return sock.sendMessage(chatId, { text: '❌ Use: `.chatbot on/off`', quoted: message });
      },
      handleChatbotResponse,
      loadUserGroupData,
      saveUserGroupData
  };
  