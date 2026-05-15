import axios from 'axios';
import yts from 'yt-search';
import { downloadAudio, ytdlpAvailable, cleanupTmp } from '../lib/ytdlp.js';

const DL_API = 'https://api.qasimdev.dpdns.org/api/loaderto/download';
const API_KEY = 'xbps-install-Syu';
const wait = (ms) => new Promise(r => setTimeout(r, ms));

// Convert music.youtube.com → youtube.com (API doesn't support Music URLs)
function normalizeYtUrl(url) {
    return url.replace('music.youtube.com', 'www.youtube.com');
}

const downloadViaApi = async (url, retries = 3) => {
    const normalUrl = normalizeYtUrl(url);
    for (let i = 0; i < retries; i++) {
        try {
            const { data } = await axios.get(DL_API, {
                params: { apiKey: API_KEY, format: 'mp3', url: normalUrl },
                timeout: 90000
            });
            if (data?.data?.downloadUrl) return data.data;
            throw new Error('No download URL');
        } catch (err) {
            if (i === retries - 1) throw err;
            console.log(`Download attempt ${i + 1} failed, retrying in 5s...`);
            await wait(5000);
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
            if (query.includes('youtube.com') || query.includes('youtu.be')) {
                video = { url: normalizeYtUrl(query) };
            } else {
                const { videos } = await yts(query);
                if (!videos?.length)
                    return sock.sendMessage(chatId, { text: '❌ No results found.' }, { quoted: message });
                video = videos[0];
            }
            if (video.thumbnail) {
                await sock.sendMessage(chatId, {
                    image: { url: video.thumbnail },
                    caption: `🎶 *${video.title || query}*\n⏱ ${video.timestamp || ''}\n\n⏳ Downloading...`
                }, { quoted: message });
            } else {
                await sock.sendMessage(chatId, { text: `⏳ Downloading...` }, { quoted: message });
            }
            // Try yt-dlp first, fall back to API
            const useYtdlp = await ytdlpAvailable();
            if (useYtdlp) {
                let tmpDir;
                try {
                    const result = await downloadAudio(video.url);
                    tmpDir = result.tmpDir;
                    await sock.sendMessage(chatId, {
                        audio: result.buffer,
                        mimetype: 'audio/mpeg',
                        fileName: `${video.title || 'song'}.mp3`,
                        ptt: false
                    }, { quoted: message });
                    return;
                } catch (ytErr) {
                    await cleanupTmp(tmpDir);
                }
            }
            // API fallback
            const audio = await downloadViaApi(video.url);
            // Download buffer to validate it's not empty
            const audioRes = await axios.get(audio.downloadUrl, { responseType: 'arraybuffer', timeout: 60000 });
            const audioBuffer = Buffer.from(audioRes.data);
            if (audioBuffer.length < 1000) throw new Error('Downloaded file is empty or invalid');
            await sock.sendMessage(chatId, {
                audio: audioBuffer,
                mimetype: 'audio/mpeg',
                fileName: `${audio.title || video.title || 'song'}.mp3`,
                ptt: false
            }, { quoted: message });
        } catch (err) {
            console.error('Song plugin error:', err.message);
            const reason = err.response?.status === 408 || err.message?.includes('timeout')
                ? 'Download timed out. Try again.'
                : err.message;
            await sock.sendMessage(chatId, { text: `❌ Failed: ${reason}` }, { quoted: message });
        }
    }
};
