import axios from 'axios';
import yts from 'yt-search';
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
    command: 'song',
    aliases: ['music', 'audio', 'mp3'],
    category: 'music',
    description: 'Download song from YouTube (MP3)',
    usage: '.song <song name | youtube link>',
    async handler(sock, message, args, context) {
        const chatId = context.chatId || message.key.remoteJid;
        const query = args.join(' ').trim();
        if (!query)
            return sock.sendMessage(chatId, { text: '🎵 *Song Downloader*\n\nUsage:\n.song <song name | YouTube link>' }, { quoted: message });

        try {
            let video;
            if (query.match(/youtu\.?be|music\.youtube/)) {
                video = { url: query, title: 'Song' };
            } else {
                const { videos } = await yts(query);
                if (!videos?.length) return sock.sendMessage(chatId, { text: '❌ No results found.' }, { quoted: message });
                video = videos[0];
            }

            if (video.thumbnail) {
                await sock.sendMessage(chatId, {
                    image: { url: video.thumbnail },
                    caption: `🎶 *${video.title || query}*\n⏱ ${video.timestamp || ''}\n\n⏳ Downloading...`
                }, { quoted: message });
            } else {
                await sock.sendMessage(chatId, { text: `⏳ Downloading *${video.title || query}*...` }, { quoted: message });
            }

            // Try yt-dlp first (most reliable), fall back to external API
            const useYtdlp = await ytdlpAvailable();
            if (useYtdlp) {
                let tmpDir;
                try {
                    const result = await downloadAudio(video.url);
                    tmpDir = result.tmpDir;
                    await sock.sendMessage(chatId, {
                        audio: result.buffer,
                        mimetype: 'audio/mpeg',
                        fileName: `${result.title || video.title || 'song'}.mp3`,
                        ptt: false
                    }, { quoted: message });
                    return;
                } catch (ytErr) {
                    console.error('[SONG] yt-dlp failed, trying API fallback:', ytErr.message);
                    await cleanupTmp(tmpDir);
                }
            }

            // API fallback
            const audio = await downloadViaApi(video.url);
            await sock.sendMessage(chatId, {
                audio: { url: audio.downloadUrl },
                mimetype: 'audio/mpeg',
                fileName: `${audio.title || video.title || 'song'}.mp3`,
                ptt: false
            }, { quoted: message });

        } catch (err) {
            console.error('[SONG] error:', err.message);
            const reason = err.message?.includes('timeout') || err.response?.status === 408
                ? 'Download timed out. Please try again in a moment.'
                : err.message;
            await sock.sendMessage(chatId, { text: `❌ Failed: ${reason}` }, { quoted: message });
        }
    }
};
