import axios from 'axios';
import yts from 'yt-search';

const DL_API = 'https://api.qasimdev.dpdns.org/api/loaderto/download';
const API_KEY = 'xbps-install-Syu';
const wait = (ms) => new Promise(r => setTimeout(r, ms));

const downloadWithRetry = async (url, retries = 3) => {
    const cleanUrl = url.replace('music.youtube.com', 'www.youtube.com');
    for (let i = 0; i < retries; i++) {
        try {
            const { data } = await axios.get(DL_API, {
                params: { apiKey: API_KEY, format: 'mp3', url: cleanUrl },
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
    command: 'song',
    aliases: ['audio', 'mp3'],
    category: 'music',
    description: 'Download a song as MP3 (supports YouTube links and search)',
    usage: '.song <song name | youtube link>',
    async handler(sock, message, args, context) {
        const chatId = context.chatId || message.key.remoteJid;
        const query = args.join(' ').trim();
        if (!query)
            return sock.sendMessage(chatId, { text: '🎵 *Song Downloader*\n\nUsage: .song <song name | YouTube link>' }, { quoted: message });
        try {
            let video;
            if (query.includes('youtube.com') || query.includes('youtu.be')) {
                const videoId = query.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/)?.[1];
                video = {
                    url: query,
                    title: 'Song',
                    thumbnail: videoId ? `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg` : null,
                    timestamp: ''
                };
            } else {
                await sock.sendMessage(chatId, { text: '🔍 *Searching...*' }, { quoted: message });
                const { videos } = await yts(query);
                if (!videos?.length)
                    return sock.sendMessage(chatId, { text: '❌ No results found.' }, { quoted: message });
                video = videos[0];
            }
            if (video.thumbnail) {
                await sock.sendMessage(chatId, {
                    image: { url: video.thumbnail },
                    caption: `🎶 *${video.title}*\n⏱ ${video.timestamp || ''}\n\n⏳ *Downloading...*`
                }, { quoted: message });
            } else {
                await sock.sendMessage(chatId, { text: '⏳ *Downloading...*' }, { quoted: message });
            }
            const songData = await downloadWithRetry(video.url);
            let thumbnailBuffer;
            try {
                const thumb = songData.thumbnail || video.thumbnail;
                if (thumb) {
                    const img = await axios.get(thumb, { responseType: 'arraybuffer', timeout: 15000 });
                    thumbnailBuffer = Buffer.from(img.data);
                }
            } catch { /* skip thumbnail */ }
            await sock.sendMessage(chatId, {
                audio: { url: songData.downloadUrl },
                mimetype: 'audio/mpeg',
                fileName: `${songData.title || video.title || 'song'}.mp3`,
                contextInfo: {
                    externalAdReply: {
                        title: songData.title || video.title,
                        body: video.timestamp || '',
                        thumbnail: thumbnailBuffer,
                        mediaType: 2,
                        sourceUrl: video.url
                    }
                }
            }, { quoted: message });
        } catch (err) {
            console.error('Song error:', err.message);
            const reason = err.response?.status === 408 || err.message?.includes('timeout')
                ? 'Download timed out. Try again.'
                : err.message;
            await sock.sendMessage(chatId, { text: `❌ *Failed:* ${reason}` }, { quoted: message });
        }
    }
};
