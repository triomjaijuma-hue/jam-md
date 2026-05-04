import fs from 'fs';
import path from 'path';
import { dataFile } from '../lib/paths.js';

const AION_FILE = dataFile('aion_chats.json');
// In-memory history: chatId → [{ role: 'user'|'bot', text, senderName, ts }]
const chatHistory = new Map();
const MAX_HISTORY = 30;

// ─── Storage ───────────────────────────────────────────────────────────────

function loadAionData() {
    try {
        if (fs.existsSync(AION_FILE)) return JSON.parse(fs.readFileSync(AION_FILE, 'utf-8'));
    } catch {}
    return { chats: {} };
}

function saveAionData(data) {
    try {
        const dir = path.dirname(AION_FILE);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(AION_FILE, JSON.stringify(data, null, 2));
    } catch (e) {
        console.error('[aion] save error:', e.message);
    }
}

export function isAiOnChat(chatId) {
    const data = loadAionData();
    return !!data.chats[chatId];
}

// ─── History helpers ────────────────────────────────────────────────────────

function getHistory(chatId) {
    if (!chatHistory.has(chatId)) chatHistory.set(chatId, []);
    return chatHistory.get(chatId);
}

function pushHistory(chatId, role, text, senderName = '') {
    const hist = getHistory(chatId);
    hist.push({ role, text, senderName, ts: Date.now() });
    if (hist.length > MAX_HISTORY) hist.shift();
}

function buildHistoryContext(chatId) {
    return getHistory(chatId)
        .map(h => `${h.role === 'user' ? (h.senderName || 'User') : 'JAM-MD'}: ${h.text}`)
        .join('\n');
}

// ─── AI APIs ────────────────────────────────────────────────────────────────

const AI_APIS = [
    {
        name: 'ZellAPI',
        url: (p) => `https://zellapi.autos/ai/chatbot?text=${encodeURIComponent(p)}`,
        parse: (d) => d?.result
    },
    {
        name: 'Hercai',
        url: (p) => `https://hercai.onrender.com/gemini/hercai?question=${encodeURIComponent(p)}`,
        parse: (d) => d?.reply
    },
    {
        name: 'SparkAPI',
        url: (p) => `https://discardapi.dpdns.org/api/chat/spark?apikey=guru&text=${encodeURIComponent(p)}`,
        parse: (d) => d?.result?.answer
    },
    {
        name: 'LlamaAPI',
        url: (p) => `https://discardapi.dpdns.org/api/bot/llama?apikey=guru&text=${encodeURIComponent(p)}`,
        parse: (d) => d?.result
    }
];

async function getAIReply(chatId, userText, senderName) {
    const history = buildHistoryContext(chatId);
    const prompt = `You are JAM-MD, a casual and witty WhatsApp assistant. Reply in short 1-3 lines. Be natural, use emojis. Never say you are an AI.

Conversation so far:
${history || '(new conversation)'}

${senderName || 'User'}: ${userText}
JAM-MD:`.trim();

    for (const api of AI_APIS) {
        try {
            const ctrl = new AbortController();
            const tid = setTimeout(() => ctrl.abort(), 10000);
            const res = await fetch(api.url(prompt), { signal: ctrl.signal });
            clearTimeout(tid);
            if (!res.ok) continue;
            const data = await res.json();
            const text = api.parse(data);
            if (!text?.trim()) continue;
            return text.trim()
                .replace(/google/gi, 'JAM-MD')
                .replace(/a large language model/gi, 'just a person')
                .replace(/^[A-Z\s]+:.*$/gm, '')
                .replace(/\n\s*\n/g, '\n')
                .trim();
        } catch { continue; }
    }
    return null;
}

// ─── Message response hook (called from messageHandler) ─────────────────────

export async function handleAiOnResponse(sock, chatId, message, userMessage, senderId) {
    if (!isAiOnChat(chatId)) return false;
    if (!userMessage?.trim()) return false;
    if (message.key.fromMe) return false;

    const senderName = message.pushName || senderId?.split('@')[0] || 'User';

    // Add to history
    pushHistory(chatId, 'user', userMessage, senderName);

    // Show typing
    try {
        await sock.presenceSubscribe(chatId);
        await sock.sendPresenceUpdate('composing', chatId);
        await new Promise(r => setTimeout(r, 1500 + Math.random() * 2000));
    } catch {}

    const reply = await getAIReply(chatId, userMessage, senderName);

    if (!reply) {
        await sock.sendMessage(chatId, {
            text: '🤔 Give me a sec...'
        }, { quoted: message });
        return true;
    }

    pushHistory(chatId, 'bot', reply);
    await sock.sendMessage(chatId, { text: reply }, { quoted: message });
    return true;
}

// ─── Plugin export ──────────────────────────────────────────────────────────

export default {
    command: 'aion',
    aliases: ['aistart', 'startai'],
    category: 'owner',
    description: 'Enable always-on AI replies for this chat',
    usage: '.aion',
    ownerOnly: true,
    async handler(sock, message, args, context) {
        const { chatId, channelInfo } = context;
        const data = loadAionData();

        if (data.chats[chatId]) {
            return sock.sendMessage(chatId, {
                text: '⚠️ *AI is already ON for this chat.*\n\nUse *.aioff* to stop it.',
                ...channelInfo
            }, { quoted: message });
        }

        data.chats[chatId] = { enabledAt: Date.now() };
        saveAionData(data);
        chatHistory.delete(chatId); // fresh history on enable

        return sock.sendMessage(chatId, {
            text: '🤖 *AI Mode ON!*\n\nI will now reply to every message in this chat using our conversation history.\n\n_Use *.aioff* to stop._',
            ...channelInfo
        }, { quoted: message });
    }
};
