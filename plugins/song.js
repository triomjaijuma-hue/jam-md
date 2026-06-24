import axios from 'axios';
import yts from 'yt-search';

const DL_APIS = [
    {
        name: 'QasimDev',
        async fetch(url) {
            const { data } = await axios.get('https://api.qasimdev.dpdns.org/api/loaderto/download', {
                params: { apiKey: 'xbps-install-Syu', format: 'mp3', url },
                timeout: 40000
            });
            const d = data?.data;
            if (!d?.downloadUrl) throw new Error('No download URL');
            return { downloadUrl: d.downloadUrl, title: d.title, thumbnail: d.thumbnail };
        }
    },
    {
        name: 'GiftedTech',
        async fetch(url) {
            const { data } = await axios.get('https://api.giftedtech.web.id/api/download/ytmp3', {
                params: { apikey: 'gifted', url },
                timeout: 40000
            });
            if (!data?.success) throw new Error(data?.error || 'GiftedTech failed');
            const d = data?.result;
            const dlUrl = d?.downloadUrl || d?.download_url || d?.url;
            if (!dlUrl) throw new Error('No download URL');
            return { downloadUrl: dlUrl, title: d?.title, thumbnail: d?.thumbnail };
        }
    },
    {
        name: 'SiputZX',
        async fetch(url) {
            const { data } = await axios.get('https://api.siputzx.my.id/api/d/ytmp3', {
                params: { url },
                timeout: 40000
            });
            if (!data?.status) throw new Error('SiputZX failed');
            const dlUrl = data?.data?.url || data?.data?.downloadUrl;
            if (!dlUrl) throw new Error('No download URL');
            return { downloadUrl: dlUrl, title: data?.data?.title, thumbnail: data?.data?.thumbnail };
        }
    },
    {
        name: 'RyzenDesu',
        async fetch(url) {
            const { data } = await axios.get('https://api.ryzendesu.vip/api/downloader/ytmp3', {
                params: { url },
                timeout: 40000
            });
            const dlUrl = data?.url || data?.download || data?.data?.url;
            if (!dlUrl) throw new Error('No download URL');
            return { downloadUrl: dlUrl, title: data?.title || data?.data?.title, thumbnail: data?.thumbnail };
        }
    },
    {
        name: 'DavidCyril',
        async fetch(url) {
            const { data } = await axios.get('https://api.davidcyriltech.my.id/download/ytmp3', {
                params: { url },
                timeout: 40000
            });
            if (!data?.success) throw new Error('DavidCyril failed');
            const dlUrl = data?.result?.download_url || data?.download_url;
            if (!dlUrl) throw new Error('No download URL');
            return { downloadUrl: dlUrl, title: data?.result?.title, thumbnail: data?.result?.thumbnail };
        }
    },
    {
        name: 'Cenarius',
        async fetch(url) {
            const { data } = await axios.get('https://api.cenarius.web.id/yt/mp3', {
                params: { url },
                timeout: 40000
            });
            const dlUrl = data?.url || data?.download || data?.result?.url;
            if (!dlUrl) throw new Error('No download URL');
            return { downloadUrl: dlUrl, title: data?.title || data?.result?.title, thumbnail: data?.thumbnail };
        }
    }
];

async function downloadMp3(videoUrl) {
    const cleanUrl = videoUrl.replace('music.youtube.com', 'www.youtube.com');
    const errors = [];
    for (const api of DL_APIS) {
        try {
            const result = await api.fetch(cleanUrl);
            console.log(`[song] Downloaded via ${api.name}`);
            return result;
        } catch (err) {
            console.log(`[song] ${api.name} failed: ${err.message}`);
            errors.push(`${api.name}: ${err.message}`);
        }
    }
    throw new Error(`All download APIs failed.\n${errors.join('\n')}`);
}

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
            if (query.includes('youtube.com') || query.includes('youtu.be') || query.includes('music.youtube.com')) {
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
            const songData = await downloadMp3(video.url);
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
            const reason = err.response?.status === 429
                ? 'All APIs are rate limited. Wait a minute and try again.'
                : err.message?.includes('All download APIs failed')
                    ? 'All download sources are currently down. Try again later.'
                    : err.message;
            await sock.sendMessage(chatId, { text: `❌ *Failed:* ${reason}` }, { quoted: message });
        }
    }
};
