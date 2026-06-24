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

async function loadUserGroupData() {
    try {
        if (HAS_DB) {
            const data = await store.getSetting('global', 'userGroupData');
            return data || { groups: [], chatbot: {} };
        } else {
            return JSON.parse(fs.readFileSync(USER_GROUP_DATA, 'utf-8'));
        }
    } catch {
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
    } catch {}
}

// ── Instant reply patterns — bypass AI for greetings ─────────────────────────
const GREETING_PATTERNS = [
    /^(hey+|hi+|hello+|helo+|holla+|hola+|sup|wassup|yo+|oya|howdy)[s!?.]*$/i,
    /^(good\s?(morning|afternoon|evening|night|day))[s!?.]*$/i,
    /^(morning|afternoon|evening|night)[s!?.]*$/i,
    /^(hie|hye|hai|heya|heyy+|hiii+|hihi|heyyy+)[s!?.]*$/i,
    /^(ola|salut|bonjour|ciao|namaste|salam)[s!?.]*$/i,
];
const GREETING_REPLIES = [
    "Hey! How are you doing? 😊", "Hey! How is everything going?", "Heyy! What's up? 😄",
    "Hey, how's it going?", "Heyyy! How have you been?", "Hey! Good to hear from you 😊 How are you?",
    "Hey! What's good?", "Yo! How is life treating you?", "Hey! Hope you are doing well 😊",
];
const THANKS_PATTERNS = [/^(thank(s| you)+|thx|ty|thnks|thnx|cheers|appreciate it|gracias|merci)[s!?.]*$/i];
const THANKS_REPLIES = ["No problem at all 😊", "Anytime! 😄", "Of course! 🙌", "Happy to help!", "Sure thing! 😄"];
const BYE_PATTERNS = [/^(bye+|goodbye|good\s?bye|cya|see ya|later|take care|ttyl|gotta go|gtg|peace)[s!?.]*$/i];
const BYE_REPLIES = ["Take care! 👋", "Bye! Talk later 😊", "See you! 👋", "Later! 😄", "Bye bye! 👋 Have a good one!"];
const HOW_ARE_YOU_PATTERNS = [/^(how are you|how r u|how are u|hru|how do you do|how is it going|how is everything|you okay|u ok|you good|u good|are you okay|are you good)[s!?.]*$/i];
const HOW_ARE_YOU_REPLIES = [
    "I'm good! Thanks for asking 😊 What about you?", "Doing great! How about yourself? 😄",
    "All good on my end 😊 How are you doing?", "Pretty good! You? 😄",
];

function pickRandom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function getInstantReply(text) {
    const t = text.trim();
    if (GREETING_PATTERNS.some(r => r.test(t))) return pickRandom(GREETING_REPLIES);
    if (HOW_ARE_YOU_PATTERNS.some(r => r.test(t))) return pickRandom(HOW_ARE_YOU_REPLIES);
    if (THANKS_PATTERNS.some(r => r.test(t))) return pickRandom(THANKS_REPLIES);
    if (BYE_PATTERNS.some(r => r.test(t))) return pickRandom(BYE_REPLIES);
    return null;
}

function getRandomDelay() { return Math.floor(Math.random() * 500) + 300; }

async function showTyping(sock, chatId) {
    try {
        await sock.presenceSubscribe(chatId);
        await sock.sendPresenceUpdate('composing', chatId);
        await new Promise(resolve => setTimeout(resolve, getRandomDelay()));
    } catch {}
}

function extractUserInfo(message) {
    const info = {};
    if (message.toLowerCase().includes('my name is'))
        info.name = message.split('my name is')[1].trim().split(' ')[0];
    if (message.toLowerCase().includes('i am') && message.toLowerCase().includes('years old'))
        info.age = message.match(/\d+/)?.[0];
    if (message.toLowerCase().includes('i live in') || message.toLowerCase().includes('i am from'))
        info.location = message.split(/(?:i live in|i am from)/i)[1].trim().split(/[.,!?]/)[0];
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
        const isDM = chatId.endsWith('@s.whatsapp.net');
        const botId = sock.user.id;
        const botNumber = botId.split(':')[0];
        const botLid = sock.user.lid;
        const botJids = [
            botId, `${botNumber}@s.whatsapp.net`, `${botNumber}@whatsapp.net`,
            `${botNumber}@lid`, botLid, `${botLid.split(':')[0]}@lid`
        ];

        if (!isDM) {
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
        }

        let cleanedMessage = userMessage.replace(new RegExp(`@${botNumber}`, 'g'), '').trim();

        const imagePrompt = detectImageRequest(cleanedMessage);
        if (imagePrompt) {
            await sock.sendMessage(chatId, { text: `🎨 Generating image...\n_"${imagePrompt}"_` }, { quoted: message });
            try {
                const buf = await generateImage(imagePrompt);
                await sock.sendMessage(chatId, { image: buf, caption: `🎨 *${imagePrompt}*\n_Generated by Pollinations AI_` }, { quoted: message });
            } catch {
                await sock.sendMessage(chatId, { text: `❌ Couldn't generate that image. Try describing it differently.` }, { quoted: message });
            }
            return;
        }

        // ── Instant reply for greetings — skip AI entirely ──────────────────
        const instant = getInstantReply(cleanedMessage);
        if (instant) {
            await showTyping(sock, chatId);
            await new Promise(r => setTimeout(r, 400 + Math.random() * 600));
            await sock.sendMessage(chatId, { text: instant }, { quoted: message });
            return;
        }

        if (!chatMemory.messages.has(senderId)) {
            chatMemory.messages.set(senderId, []);
            chatMemory.userInfo.set(senderId, {});
        }
        const userInfo = extractUserInfo(cleanedMessage);
        if (Object.keys(userInfo).length > 0)
            chatMemory.userInfo.set(senderId, { ...chatMemory.userInfo.get(senderId), ...userInfo });
        const messages = chatMemory.messages.get(senderId);
        messages.push(cleanedMessage);
        if (messages.length > 20) messages.shift();
        chatMemory.messages.set(senderId, messages);

        // 12% chance: bot "read" it but is busy — waits 60-180s before typing (human behaviour)
        if (Math.random() < 0.12) {
            const _busyMs = Math.floor(Math.random() * 120000) + 60000;
            await new Promise(r => setTimeout(r, _busyMs));
        }
        // Start timer + show composing right away so WhatsApp shows typing dots while AI thinks
        const _replyStart = Date.now();
        try { await sock.presenceSubscribe(chatId); await sock.sendPresenceUpdate('composing', chatId); } catch {}

        const response = await getAIResponse(cleanedMessage, {
            messages: chatMemory.messages.get(senderId),
            userInfo: chatMemory.userInfo.get(senderId)
        });
        if (!response) {
            await sock.sendMessage(chatId, { text: "Hmm, I'm having trouble right now. Try again shortly. 🤔" }, { quoted: message });
            return;
        }
        // Human-like pacing: how long would a real person need to read + type this reply?
        // read/think: ~1.5s fixed + type: ~35ms per char (min 2s, max 10s)
        const _elapsed = Date.now() - _replyStart;
        const _typingMs = Math.max(2000, Math.min(10000, response.length * 35));
        const _remaining = Math.max(0, (1500 + _typingMs) - _elapsed);
        if (_remaining > 0) await new Promise(r => setTimeout(r, _remaining));
        await sock.sendMessage(chatId, { text: response }, { quoted: message });
    } catch (error) {
        if (error.message?.includes('No sessions')) return;
        try {
            await sock.sendMessage(chatId, { text: "Oops! 😅 Got confused there. Try asking again?" }, { quoted: message });
        } catch {}
    }
}

async function getAIResponse(userMessage, userContext) {
    const prompt = `You are JAM-MD, a casual friendly WhatsApp assistant.
Your owner and creator is Jaiton, who lives in Mengo, Kampala, Uganda.

Identity rules (answer these correctly every time):
- If asked who you are → say you are JAM-MD, a WhatsApp bot
- If asked who made you, who owns you, or who created you → say Jaiton from Mengo, Kampala, Uganda
- If asked where you are from or where you are based → say Uganda

CRITICAL RULE: Always reply in the SAME language the user is writing in.
- If they write in Arabic → reply in Arabic
- If they write in Swahili → reply in Swahili
- If they write in Luganda → reply in Luganda
- If they write in French → reply in French
- If they write in any language → match that language exactly

Other rules:
- Keep replies short (1-2 lines max)
- Be casual, witty, and natural — not robotic
- Use emojis naturally

Previous conversation:
${userContext.messages.join('\n')}

User: ${userMessage}
You:`.trim();

    try {
        const providerName = await getCurrentProvider();
        const info = await getProviderInfo(providerName);

        if (info.needsKey && !info.hasKey) {
            return `⚠️ *${info.name}* is selected but has no API key.\nUse: \`.aikey ${providerName} YOUR_KEY\` to set it, or switch to a free AI: \`.aiswitch mistral\``;
        }

        const reply = await askAI(prompt);
        if (reply && typeof reply === 'string' && reply.trim()) {
            return cleanChatbotReply(reply);
        }
        return null;
    } catch (err) {
        console.error('[chatbot] AI error:', err.message);
        return null;
    }
}

export default {
    command: 'chatbot',
    aliases: ['bot', 'achat'],
    category: 'admin',
    description: 'Enable or disable AI chatbot for this chat (works in DMs and groups)',
    usage: '.chatbot <on|off>',
    async handler(sock, message, args, context) {
        const chatId = context.chatId || message.key.remoteJid;
        const isDM = chatId.endsWith('@s.whatsapp.net');
        const isGroup = chatId.endsWith('@g.us');

        if (isGroup) {
            const groupMeta = await sock.groupMetadata(chatId).catch(() => null);
            const sender = message.key.participant || message.key.remoteJid;
            const isAdmin = groupMeta?.participants?.find(p => p.id === sender)?.admin;
            if (!isAdmin) {
                return sock.sendMessage(chatId, { text: '❌ Only group admins can enable chatbot in groups.' }, { quoted: message });
            }
        }

        const match = args.join(' ').toLowerCase().trim();

        if (!match) {
            const providerName = await getCurrentProvider();
            const providerInfo = await getProviderInfo(providerName);
            const keyStatus = providerInfo?.needsKey
                ? (providerInfo.hasKey ? `🔑 ${providerInfo.name} (key set)` : `⚠️ ${providerInfo.name} — NO KEY! Run .aikey ${providerName} YOUR_KEY`)
                : `🆓 ${providerInfo.name} (free)`;
            await showTyping(sock, chatId);
            return sock.sendMessage(chatId, {
                text: `*🤖 CHATBOT SETUP*\n\n`
                    + `*AI Provider:* ${keyStatus}\n`
                    + `*Languages:* Any language (auto-detects & replies in same language)\n`
                    + `*Works in:* DMs + Groups\n\n`
                    + `*Commands:*\n• \`.chatbot on\` — Enable\n• \`.chatbot off\` — Disable\n\n`
                    + `*Switch AI:* .aiswitch <groq|gemini|openai|mistral|llama>\n`
                    + `*Set key:* .aikey <provider> YOUR_KEY`
            }, { quoted: message });
        }

        const data = await loadUserGroupData();

        if (match === 'on') {
            await showTyping(sock, chatId);
            if (data.chatbot[chatId]) return sock.sendMessage(chatId, { text: '⚠️ Chatbot is already enabled here.' }, { quoted: message });
            data.chatbot[chatId] = true;
            await saveUserGroupData(data);
            const providerName = await getCurrentProvider();
            const info = await getProviderInfo(providerName);
            let msg = `✅ *Chatbot enabled!*\n🤖 Using: *${info.name}*\n🌍 Replies in any language automatically`;
            if (isDM) msg += '\n\n_I\'ll reply to every message you send here._';
            else msg += '\n\n_Mention me or reply to my messages to chat._';
            if (info.needsKey && !info.hasKey) msg += `\n\n⚠️ No API key for ${info.name}! Run:\n.aikey ${providerName} YOUR_KEY`;
            return sock.sendMessage(chatId, { text: msg }, { quoted: message });
        }

        if (match === 'off') {
            await showTyping(sock, chatId);
            if (!data.chatbot[chatId]) return sock.sendMessage(chatId, { text: '⚠️ Chatbot is already disabled here.' }, { quoted: message });
            delete data.chatbot[chatId];
            await saveUserGroupData(data);
            return sock.sendMessage(chatId, { text: '❌ *Chatbot disabled.*' }, { quoted: message });
        }

        return sock.sendMessage(chatId, { text: '❌ Use: `.chatbot on` or `.chatbot off`' }, { quoted: message });
    },
    handleChatbotResponse,
    loadUserGroupData,
    saveUserGroupData
};
