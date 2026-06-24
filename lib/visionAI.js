import axios from 'axios';
import { downloadMediaMessage } from '@whiskeysockets/baileys';
import store from './lightweight_store.js';
import fs from 'fs';
import { dataFile } from './paths.js';

const DM_AI_FILE = dataFile('dmAiAll.json');
const AUTO_AI_FILE = dataFile('autoAi.json');
const HAS_DB = !!(process.env.MONGO_URL || process.env.POSTGRES_URL || process.env.MYSQL_URL || process.env.DB_URL);

// ── Check if AI is active for this chat ─────────────────────────────────────
async function isAiActiveForChat(chatId, isGroup) {
    try {
        // 1. Per-chat AI (aion)
        const autoAi = HAS_DB
            ? ((await store.getSetting('global', 'autoAi')) || {})
            : (() => {
                try { return JSON.parse(fs.readFileSync(AUTO_AI_FILE, 'utf8')); } catch { return {}; }
            })();
        if (autoAi[chatId]) return true;

        // 2. Global DM AI (dmai — only for private chats)
        if (!isGroup) {
            const dmState = HAS_DB
                ? ((await store.getSetting('global', 'dmAiAll')) || { enabled: false, excluded: [] })
                : (() => {
                    try {
                        const d = JSON.parse(fs.readFileSync(DM_AI_FILE, 'utf8'));
                        return { enabled: d.enabled || false, excluded: d.excluded || [] };
                    } catch { return { enabled: false, excluded: [] }; }
                })();
            if (dmState.enabled && !dmState.excluded?.includes(chatId)) return true;
        }

        // 3. Chatbot (group chatbot)
        const ugd = HAS_DB
            ? ((await store.getSetting('global', 'userGroupData')) || { chatbot: {} })
            : { chatbot: {} };
        if (ugd?.chatbot?.[chatId]) return true;

        return false;
    } catch {
        return false;
    }
}

// ── Call Gemini Vision with image buffer ─────────────────────────────────────
async function callGeminiVision(imageBuffer, mimeType, caption) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return null;

    const base64 = imageBuffer.toString('base64');
    const textPrompt = caption
        ? `Someone sent you this image on WhatsApp with the caption: "${caption}". React to it naturally like a real human friend would. Be casual, short (1-2 lines), use emojis if appropriate.`
        : `Someone sent you this image on WhatsApp. React to it naturally like a real human friend would. Be casual, short (1-2 lines), use emojis if appropriate.`;

    const payload = {
        contents: [{
            role: 'user',
            parts: [
                { inlineData: { mimeType: mimeType || 'image/jpeg', data: base64 } },
                { text: textPrompt }
            ]
        }],
        generationConfig: { maxOutputTokens: 150, temperature: 0.9 }
    };

    const { data } = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
        payload,
        { headers: { 'Content-Type': 'application/json' }, timeout: 30000 }
    );
    return data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
}

// ── Main export: handle an incoming image message ────────────────────────────
export async function handleIncomingImageAI(sock, chatId, message, senderId, isGroup) {
    try {
        const imgMsg = message.message?.imageMessage;
        if (!imgMsg) return false;

        // Only reply if some AI feature is active for this chat
        const active = await isAiActiveForChat(chatId, isGroup);
        if (!active) return false;

        const caption = imgMsg.caption?.trim() || '';
        const mimeType = imgMsg.mimetype || 'image/jpeg';

        // Show typing while we process
        try {
            await sock.presenceSubscribe(chatId);
            await sock.sendPresenceUpdate('composing', chatId);
        } catch {}

        // Download the image
        let imageBuffer;
        try {
            imageBuffer = await downloadMediaMessage(
                message, 'buffer', {},
                { reuploadRequest: sock.updateMediaMessage }
            );
        } catch (dlErr) {
            console.error('[vision] image download failed:', dlErr.message);
            // Fall back: if there's a caption, let normal text routing handle it
            return false;
        }

        // Try Gemini Vision
        let reply = null;
        try {
            reply = await callGeminiVision(imageBuffer, mimeType, caption);
        } catch (vErr) {
            console.error('[vision] Gemini Vision failed:', vErr.message);
        }

        // If no Gemini key or vision failed but AI is active:
        // Use a natural-sounding fallback
        if (!reply) {
            if (caption) {
                // Let normal text routing handle the caption
                return false;
            }
            reply = '😅 lol what is this 👀';
        }

        // Human-like typing delay
        const typingMs = Math.max(1500, Math.min(6000, reply.length * 40));
        await new Promise(r => setTimeout(r, typingMs));

        await sock.sendMessage(chatId, { text: reply }, { quoted: message });
        console.log('[vision] replied to image from', senderId.split('@')[0]);
        return true;
    } catch (err) {
        console.error('[vision] handleIncomingImageAI error:', err.message);
        return false;
    }
}
