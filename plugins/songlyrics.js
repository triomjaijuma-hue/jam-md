import axios from 'axios';
import yts from 'yt-search';

const DL_API = 'https://api.qasimdev.dpdns.org/api/loaderto/download';
const API_KEY = 'xbps-install-Syu';
const wait = (ms) => new Promise(r => setTimeout(r, ms));

const downloadWithRetry = async (url, retries = 3) => {
    for (let i = 0; i < retries; i++) {
        try {
            const { data } = await axios.get(DL_API, {
                params: { apiKey: API_KEY, format: '360', url },
                timeout: 90000
            });
            if (data?.data?.downloadUrl) return data.data;
            throw new Error('No download URL');
        } catch (err) {
            if (i === retries - 1) throw err;
            await wait(5000);
        }
    }
    throw new Error('All download attempts failed');
};

export default {
    command: 'songlyrics',
    aliases: ['lyrics', 'lyricvid', 'lyricsvideo'],
    category: 'music',
    description: 'Download a lyrics video for a song from YouTube',
    usage: '.songlyrics <song name>',
    async handler(sock, message, args, context) {
        const chatId = context.chatId || message.key.remoteJid;
        const query = args.join(' ').trim();
        if (!query)
            return sock.sendMessage(chatId, {
                text: '🎶 *Lyrics Video Downloader*\n\nUsage: .songlyrics <song name>\n\nExample: .songlyrics Alan Walker Faded'
            }, { quoted: message });
        try {
            await sock.sendMessage(chatId, { text: '🔍 *Searching for lyrics video...*' }, { quoted: message });
            // Search YouTube with "lyrics" appended so we get the lyrics video
            const { videos } = await yts(`${query} lyrics`);
            if (!videos?.length)
                return sock.sendMessage(chatId, { text: '❌ No lyrics video found.' }, { quoted: message });
            const video = videos[0];
            const thumb = video.thumbnail || `https://i.ytimg.com/vi/${video.videoId}/sddefault.jpg`;
            await sock.sendMessage(chatId, {
                image: { url: thumb },
                caption: `🎬 *${video.title}*\n⏱ ${video.timestamp}\n👤 ${video.author?.name || ''}\n\n⏳ *Downloading lyrics video... (may take up to 30s)*`
            }, { quoted: message });
            const videoData = await downloadWithRetry(video.url);
            await sock.sendMessage(chatId, {
                video: { url: videoData.downloadUrl },
                mimetype: 'video/mp4',
                fileName: `${videoData.title || video.title}.mp4`,
                caption: `🎶 *${videoData.title || video.title}*\n\n> *_Downloaded by JAM-MD_*`
            }, { quoted: message });
        } catch (err) {
            console.error('Songlyrics error:', err.message);
            const reason = err.response?.status === 408 || err.message?.includes('timeout')
                ? 'Download timed out. Try again.'
                : err.message;
            await sock.sendMessage(chatId, { text: `❌ *Failed:* ${reason}` }, { quoted: message });
        }
    }
};
