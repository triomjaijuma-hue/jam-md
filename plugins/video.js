import axios from 'axios';
import yts from 'yt-search';

// Multiple download APIs tried in order — 30s timeout each, 1.5s between.
const DL_APIS = [
    { url: 'https://api.qasimdev.dpdns.org/api/loaderto/download', key: 'xbps-install-Syu', param: 'apiKey' },
    { url: 'https://api.siputzx.my.id/api/d/ytmp4', key: null, param: null },
];
const wait = (ms) => new Promise(r => setTimeout(r, ms));

const downloadWithRetry = async (videoUrl, format = '360') => {
    for (const api of DL_APIS) {
        try {
            const params = { format, url: videoUrl };
            if (api.key) params[api.param] = api.key;
            const { data } = await axios.get(api.url, { params, timeout: 30000 });
            const result = data?.data || data;
            const dlUrl = result?.downloadUrl || result?.url || result?.link;
            if (dlUrl) return { downloadUrl: dlUrl, title: result?.title || '', thumbnail: result?.thumbnail || result?.image || '' };
            throw new Error('No download URL in response');
        } catch (err) {
            console.log('[video] API failed:', api.url.split('/')[2], err.message);
            await wait(1500);
        }
    }
    throw new Error('All download APIs failed — try again in a moment');
};
export default {
    command: 'video',
    aliases: ['ytmp4', 'ytvideo', 'ytdl'],
    category: 'music',
    description: 'Download YouTube videos by link or search',
    usage: '.video <youtube link | search query>',
    async handler(sock, message, args, context) {
        const chatId = context.chatId || message.key.remoteJid;
        const query = args.join(' ').trim();
        if (!query)
            return sock.sendMessage(chatId, { text: '🎥 *What video do you want to download?*\nExample:\n.video Alan Walker Faded' }, { quoted: message });
        try {
            let videoUrl;
            let videoTitle;
            let videoThumbnail;
            if (query.startsWith('http://') || query.startsWith('https://')) {
                videoUrl = query;
            }
            else {
                const { videos } = await yts(query);
                if (!videos?.length)
                    return sock.sendMessage(chatId, { text: '❌ No videos found!' }, { quoted: message });
                videoUrl = videos[0].url;
                videoTitle = videos[0].title;
                videoThumbnail = videos[0].thumbnail;
            }
            const validYT = videoUrl.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|shorts\/|embed\/))([a-zA-Z0-9_-]{11})/);
            if (!validYT)
                return sock.sendMessage(chatId, { text: '❌ Not a valid YouTube link!' }, { quoted: message });
            const ytId = validYT[1];
            const thumb = videoThumbnail || `https://i.ytimg.com/vi/${ytId}/sddefault.jpg`;
            await sock.sendMessage(chatId, {
                image: { url: thumb },
                caption: `🎬 *${videoTitle || query}*\n⬇️ Downloading... *(may take up to 30s)*`
            }, { quoted: message });
            const videoData = await downloadWithRetry(videoUrl);
            await sock.sendMessage(chatId, {
                video: { url: videoData.downloadUrl },
                mimetype: 'video/mp4',
                fileName: `${videoData.title || videoTitle || 'video'}.mp4`,
                caption: `🎬 *${videoData.title || videoTitle || 'Video'}*\n\n> *_Downloaded by JAM-MD_*`
            }, { quoted: message });
        }
        catch (err) {
            console.error('[VIDEO] Error:', err.message);
            const reason = err.response?.status === 408
                ? 'Download timed out. Try again.'
                : err.message;
            await sock.sendMessage(chatId, { text: `❌ Download failed!\nReason: ${reason}` }, { quoted: message });
        }
    }
};
