import axios from 'axios';
import yts from 'yt-search';
import { downloadVideo, ytdlpAvailable, cleanupTmp } from '../lib/ytdlp.js';

const DL_API = 'https://api.qasimdev.dpdns.org/api/loaderto/download';
const API_KEY = 'xbps-install-Syu';
const wait = (ms) => new Promise(r => setTimeout(r, ms));

const downloadViaApi = async (url, retries = 2) => {
    for (let i = 0; i < retries; i++) {
        try {
            const { data } = await axios.get(DL_API, {
                params: { apiKey: API_KEY, format: '360', url },
                timeout: 90000
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
    command: 'video',
    aliases: ['ytmp4', 'ytvideo', 'ytdl'],
    category: 'download',
    description: 'Download YouTube videos by link or search',
    usage: '.video <youtube link | search query>',
    async handler(sock, message, args, context) {
        const chatId = context.chatId || message.key.remoteJid;
        const query = args.join(' ').trim();
        if (!query)
            return sock.sendMessage(chatId, { text: '🎥 *What video do you want to download?*\nExample:\n.video Alan Walker Faded' }, { quoted: message });

        try {
            let videoUrl, videoTitle, videoThumbnail;

            if (query.startsWith('http://') || query.startsWith('https://')) {
                videoUrl = query;
            } else {
                const { videos } = await yts(query);
                if (!videos?.length) return sock.sendMessage(chatId, { text: '❌ No videos found!' }, { quoted: message });
                videoUrl = videos[0].url;
                videoTitle = videos[0].title;
                videoThumbnail = videos[0].thumbnail;
            }

            const validYT = videoUrl.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|shorts\/|embed\/))([a-zA-Z0-9_-]{11})/);
            if (!validYT) return sock.sendMessage(chatId, { text: '❌ Not a valid YouTube link!' }, { quoted: message });
            const ytId = validYT[1];
            const thumb = videoThumbnail || `https://i.ytimg.com/vi/${ytId}/sddefault.jpg`;

            await sock.sendMessage(chatId, {
                image: { url: thumb },
                caption: `🎬 *${videoTitle || query}*\n⬇️ Downloading...`
            }, { quoted: message });

            // Try yt-dlp first (most reliable), fall back to external API
            const useYtdlp = await ytdlpAvailable();
            if (useYtdlp) {
                let tmpDir;
                try {
                    const result = await downloadVideo(videoUrl, 360);
                    tmpDir = result.tmpDir;
                    await sock.sendMessage(chatId, {
                        video: result.buffer,
                        mimetype: 'video/mp4',
                        fileName: `${result.title || videoTitle || 'video'}.mp4`,
                        caption: `🎬 *${result.title || videoTitle || 'Video'}*\n\n> *_Downloaded by JAM-MD_*`
                    }, { quoted: message });
                    return;
                } catch (ytErr) {
                    console.error('[VIDEO] yt-dlp failed, trying API fallback:', ytErr.message);
                    await cleanupTmp(tmpDir);
                }
            }

            // API fallback
            const videoData = await downloadViaApi(videoUrl);
            await sock.sendMessage(chatId, {
                video: { url: videoData.downloadUrl },
                mimetype: 'video/mp4',
                fileName: `${videoData.title || videoTitle || 'video'}.mp4`,
                caption: `🎬 *${videoData.title || videoTitle || 'Video'}*\n\n> *_Downloaded by JAM-MD_*`
            }, { quoted: message });

        } catch (err) {
            console.error('[VIDEO] error:', err.message);
            const reason = err.message?.includes('timeout') || err.response?.status === 408
                ? 'Download timed out. Try again.'
                : err.message;
            await sock.sendMessage(chatId, { text: `❌ Download failed!\nReason: ${reason}` }, { quoted: message });
        }
    }
};
