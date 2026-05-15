import yts from 'yt-search';
import axios from 'axios';
import { downloadAudio, ytdlpAvailable, cleanupTmp } from '../lib/ytdlp.js';

const DL_API = 'https://api.qasimdev.dpdns.org/api/loaderto/download';
const API_KEY = 'xbps-install-Syu';
const wait = (ms) => new Promise(r => setTimeout(r, ms));

const downloadViaApi = async (url, retries = 2) => {
    for (let i = 0; i < retries; i++) {
        try {
            const { data } = await axios.get(DL_API, {
                params: { apiKey: API_KEY, format: 'mp3', url },
                timeout: 60000
            });
            if (data?.data?.downloadUrl) return data.data;
            throw new Error('No download URL in API response');
        } catch (err) {
            if (i === retries - 1) throw err;
            await wait(3000);
        }
    }
};

export default {
    command: 'play',
    aliases: ['plays'],
    category: 'music',
    description: 'Search and download a song as MP3 from YouTube',
    usage: '.play <song name>',
    async handler(sock, message, args, context) {
        const chatId = context.chatId || message.key.remoteJid;
        const query = args.join(' ').trim();
        if (!query)
            return sock.sendMessage(chatId, { text: '*Which song do you want to play?*\nUsage: .play <song name>' }, { quoted: message });

        try {
            await sock.sendMessage(chatId, { text: '🔍 *Searching...*' }, { quoted: message });
            const { videos } = await yts(query);
            if (!videos?.length) return sock.sendMessage(chatId, { text: '❌ *No results found!*' }, { quoted: message });
            const video = videos[0];

            await sock.sendMessage(chatId, {
                text: `✅ *Found:* ${video.title}\n⏱️ ${video.timestamp}\n👤 ${video.author.name}\n\n⏳ *Downloading...*`
            }, { quoted: message });

            // Try yt-dlp first (most reliable), fall back to external API
            const useYtdlp = await ytdlpAvailable();
            if (useYtdlp) {
                let tmpDir;
                try {
                    const result = await downloadAudio(video.url);
                    tmpDir = result.tmpDir;

                    let thumbnailBuffer;
                    try {
                        const img = await axios.get(video.thumbnail, { responseType: 'arraybuffer', timeout: 10000 });
                        thumbnailBuffer = Buffer.from(img.data);
                    } catch { /* no thumbnail, that's ok */ }

                    await sock.sendMessage(chatId, {
                        audio: result.buffer,
                        mimetype: 'audio/mpeg',
                        fileName: `${result.title || video.title}.mp3`,
                        contextInfo: thumbnailBuffer ? {
                            externalAdReply: {
                                title: result.title || video.title,
                                body: `${video.author.name} • ${video.timestamp}`,
                                thumbnail: thumbnailBuffer,
                                mediaType: 2,
                                sourceUrl: video.url
                            }
                        } : undefined
                    }, { quoted: message });
                    return;
                } catch (ytErr) {
                    console.error('[PLAY] yt-dlp failed, trying API fallback:', ytErr.message);
                    await cleanupTmp(tmpDir);
                }
            }

            // API fallback
            const songData = await downloadViaApi(video.url);
            let thumbnailBuffer;
            try {
                const img = await axios.get(songData.thumbnail || video.thumbnail, { responseType: 'arraybuffer', timeout: 10000 });
                thumbnailBuffer = Buffer.from(img.data);
            } catch { /* no thumbnail */ }

            await sock.sendMessage(chatId, {
                audio: { url: songData.downloadUrl },
                mimetype: 'audio/mpeg',
                fileName: `${songData.title || video.title}.mp3`,
                contextInfo: thumbnailBuffer ? {
                    externalAdReply: {
                        title: songData.title || video.title,
                        body: `${video.author.name} • ${video.timestamp}`,
                        thumbnail: thumbnailBuffer,
                        mediaType: 2,
                        sourceUrl: video.url
                    }
                } : undefined
            }, { quoted: message });

        } catch (err) {
            console.error('[PLAY] error:', err.message);
            const reason = err.message?.includes('timeout') || err.response?.status === 408
                ? 'Download timed out. Try again in a moment.'
                : err.response?.status === 429
                    ? 'Rate limited. Wait a minute.'
                    : err.message;
            await sock.sendMessage(chatId, { text: `❌ *Failed:* ${reason}` }, { quoted: message });
        }
    }
};
