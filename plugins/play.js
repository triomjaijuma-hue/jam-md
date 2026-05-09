import yts from 'yt-search';
import axios from 'axios';

// Multiple download APIs tried in order — if one is slow/down the next is used.
// Timeout cut from 90s to 30s so failures are caught quickly.
const DL_APIS = [
    { url: 'https://api.qasimdev.dpdns.org/api/loaderto/download', key: 'xbps-install-Syu', param: 'apiKey' },
    { url: 'https://api.siputzx.my.id/api/d/ytmp3', key: null, param: null },
];
const wait = (ms) => new Promise(r => setTimeout(r, ms));

const downloadWithRetry = async (videoUrl) => {
    for (const api of DL_APIS) {
        try {
            const params = { format: 'mp3', url: videoUrl };
            if (api.key) params[api.param] = api.key;
            const { data } = await axios.get(api.url, { params, timeout: 30000 });
            const result = data?.data || data;
            const dlUrl = result?.downloadUrl || result?.url || result?.link;
            if (dlUrl) return { downloadUrl: dlUrl, title: result?.title || '', thumbnail: result?.thumbnail || result?.image || '' };
            throw new Error('No download URL in response');
        } catch (err) {
            console.log('[play] API failed:', api.url.split('/')[2], err.message);
            await wait(1500);
        }
    }
    throw new Error('All download APIs failed — try again in a moment');
};
export default {
    command: 'play',
    aliases: ['plays', 'music'],
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
            if (!videos?.length)
                return sock.sendMessage(chatId, { text: '❌ *No results found!*' }, { quoted: message });
            const video = videos[0];
            await sock.sendMessage(chatId, {
                text: `✅ *Found:* ${video.title}\n⏱️ ${video.timestamp}\n👤 ${video.author.name}\n\n⏳ *Downloading... (this may take up to 30s)*`
            }, { quoted: message });
            const songData = await downloadWithRetry(video.url);
            let thumbnailBuffer;
            try {
                const img = await axios.get(songData.thumbnail, { responseType: 'arraybuffer', timeout: 15000 });
                thumbnailBuffer = Buffer.from(img.data);
            }
            catch { /* no thumbnail */ }
            await sock.sendMessage(chatId, {
                audio: { url: songData.downloadUrl },
                mimetype: 'audio/mpeg',
                fileName: `${songData.title}.mp3`,
                contextInfo: {
                    externalAdReply: {
                        title: songData.title,
                        body: `${video.author.name} • ${video.timestamp}`,
                        thumbnail: thumbnailBuffer,
                        mediaType: 2,
                        sourceUrl: video.url
                    }
                }
            }, { quoted: message });
        }
        catch (err) {
            console.error('Play error:', err.message);
            const reason = err.response?.status === 408
                ? 'Download timed out. Try again in a moment.'
                : err.response?.status === 429
                    ? 'Rate limited. Wait a minute.'
                    : err.message;
            await sock.sendMessage(chatId, { text: `❌ *Failed:* ${reason}` }, { quoted: message });
        }
    }
};
