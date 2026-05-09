/**
 * singid.js — Identify a song from a hummed / sung voice note
 *
 * Uses AudD's humming recognition API (https://audd.io)
 * Works WITHOUT an API key (free, limited requests).
 * For more requests, add AUDD_TOKEN=your_token to your .env file.
 *
 * Usage: Reply to someone's voice note in DM and type .singid
 */

import { downloadContentFromMessage } from '@whiskeysockets/baileys';
import FormData from 'form-data';
import axios from 'axios';
import fs from 'fs';
import path from 'path';

const AUDD_ENDPOINT = 'https://api.audd.io/findByHumming/';

// ── helpers ─────────────────────────────────────────────────────────────────

function getAudioMessage(message) {
    const m = message.message || {};

    // Direct voice / audio message
    if (m.audioMessage) return m.audioMessage;

    // pttMessage (push-to-talk)
    if (m.pttMessage) return m.pttMessage;

    // Quoted message (user replied to a voice note)
    const ctx = m.extendedTextMessage?.contextInfo?.quotedMessage
             || m.audioMessage?.contextInfo?.quotedMessage;
    if (ctx?.audioMessage) return ctx.audioMessage;
    if (ctx?.pttMessage)   return ctx.pttMessage;

    return null;
}

async function downloadAudio(audioMsg) {
    const stream = await downloadContentFromMessage(audioMsg, 'audio');
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    return Buffer.concat(chunks);
}

async function recogniseHumming(buffer, filename) {
    const form = new FormData();
    form.append('file', buffer, {
        filename,
        contentType: 'audio/ogg; codecs=opus',
    });
    const token = process.env.AUDD_TOKEN || '';
    if (token) form.append('api_token', token);
    // Ask for spotify + apple_music links in the response
    form.append('return', 'spotify,apple_music,deezer');

    const res = await axios.post(AUDD_ENDPOINT, form, {
        headers: form.getHeaders(),
        timeout: 30_000,
        maxContentLength: 20 * 1024 * 1024,
    });
    return res.data;
}

// ── plugin ───────────────────────────────────────────────────────────────────

export default {
    command: 'singid',
    aliases: ['hum', 'humid', 'singsearch', 'findmysong'],
    category: 'tools',
    description: 'Identify a song from a hummed or sung voice note in your DMs',
    usage: '.singid (reply to a voice note)',

    async handler(sock, message, args, context) {
        const chatId = context.chatId || message.key.remoteJid;

        // Only DMs (not groups)
        if (chatId.endsWith('@g.us')) {
            return sock.sendMessage(chatId, {
                text: '⚠️ This command only works in *DM chats*, not groups.'
            }, { quoted: message });
        }

        const audioMsg = getAudioMessage(message);
        if (!audioMsg) {
            return sock.sendMessage(chatId, {
                text: [
                    '🎵 *Sing / Hum Identifier*',
                    '',
                    '↩️ *Reply to a voice note* where someone hums or sings a song.',
                    '',
                    'Example: Reply to the voice note → type *.singid*',
                    '',
                    '💡 _Works best with voice notes of at least 5 seconds_'
                ].join('\n')
            }, { quoted: message });
        }

        // Send a "searching" reaction + message
        await sock.sendMessage(chatId, { react: { text: '🎵', key: message.key } });
        const waitMsg = await sock.sendMessage(chatId, {
            text: '🎵 *Listening…*\n\nAnalysing the voice note, please wait.'
        }, { quoted: message });

        const tmpDir  = path.join(process.cwd(), 'temp');
        const tmpFile = path.join(tmpDir, `hum_${Date.now()}.ogg`);

        try {
            if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

            // Download the audio
            const buffer = await downloadAudio(audioMsg);
            fs.writeFileSync(tmpFile, buffer);

            // Send to AudD humming API
            const data = await recogniseHumming(buffer, path.basename(tmpFile));

            if (data.status !== 'success') {
                throw new Error(data.error?.error_message || data.status || 'Unknown API error');
            }

            if (!data.result) {
                return sock.sendMessage(chatId, {
                    text: [
                        '❓ *No match found*',
                        '',
                        'The melody couldn\'t be identified. Try:',
                        '• Singing a longer clip (10+ seconds)',
                        '• Singing more clearly with fewer pauses',
                        '• Humming the main melody/chorus'
                    ].join('\n')
                }, { quoted: message });
            }

            const r = data.result;

            // Build streaming links
            const links = [];
            if (r.spotify?.external_urls?.spotify)
                links.push(`🟢 [Spotify](${r.spotify.external_urls.spotify})`);
            if (r.apple_music?.url)
                links.push(`🍎 [Apple Music](${r.apple_music.url})`);
            if (r.deezer?.link)
                links.push(`💠 [Deezer](${r.deezer.link})`);

            const reply = [
                '🎵 *Song Found!*',
                '',
                `📌 *Title:*   ${r.title || 'Unknown'}`,
                `🎤 *Artist:*  ${r.artist || 'Unknown'}`,
                `💿 *Album:*   ${r.album || 'N/A'}`,
                `📅 *Released:* ${r.release_date || 'N/A'}`,
                `🏷️ *Label:*   ${r.label || 'N/A'}`,
                ...(links.length ? ['', '🔗 *Listen on:*', links.join('  ·  ')] : []),
                '',
                '_Powered by AudD Humming Recognition_'
            ].join('\n');

            await sock.sendMessage(chatId, { text: reply }, { quoted: message });
            await sock.sendMessage(chatId, { react: { text: '✅', key: message.key } });

        } catch (err) {
            const msg = String(err?.response?.data?.error?.error_message || err?.message || err);
            await sock.sendMessage(chatId, {
                text: `❌ *Error:* ${msg}`
            }, { quoted: message });
            await sock.sendMessage(chatId, { react: { text: '❌', key: message.key } });
        } finally {
            try { if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile); } catch {}
        }
    }
};
