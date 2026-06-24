import yts from 'yt-search';
import axios from 'axios';
import { ytdlpAvailable, downloadAudio, cleanupTmp } from '../lib/ytdlp.js';

// Third-party API fallbacks — tried in order if yt-dlp is unavailable
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
            const cleanUrl = video.url.replace('music.youtube.com', 'www.youtube.com');

            await sock.sendMessage(chatId, {
                text: `✅ *Found:* ${video.title}\n⏱️ ${video.timestamp}\n👤 ${video.author.name}\n\n⏳ *Downloading...*`
            }, { quoted: message });

            // --- Try yt-dlp first (most reliable) ---
            const hasYtdlp = await ytdlpAvailable();
            if (hasYtdlp) {
                let tmpDir;
                try {
                    const { buffer, tmpDir: td } = await downloadAudio(cleanUrl);
                    tmpDir = td;
                    let thumbnailBuffer;
                    try {
                        const img = await axios.get(video.thumbnail, { responseType: 'arraybuffer', timeout: 15000 });
                        thumbnailBuffer = Buffer.from(img.data);
                    } catch { /* no thumbnail */ }
                    await sock.sendMessage(chatId, {
                        audio: buffer,
                        mimetype: 'audio/mpeg',
                        fileName: `${video.title}.mp3`,
                        contextInfo: {
                            externalAdReply: {
                                title: video.title,
                                body: `${video.author?.name || ''} • ${video.timestamp}`,
                                thumbnail: thumbnailBuffer,
                                mediaType: 2,
                                sourceUrl: video.url
                            }
                        }
                    }, { quoted: message });
                    console.log('[play] Downloaded via yt-dlp');
                    return;
                } catch (ytErr) {
                    console.log('[play] yt-dlp failed:', ytErr.message, '— trying APIs');
                } finally {
                    await cleanupTmp(tmpDir);
                }
            }

            // --- Fallback: try each API in order ---
            const errors = [];
            for (const api of DL_APIS) {
                try {
                    const songData = await api.fetch(cleanUrl);
                    let thumbnailBuffer;
                    try {
                        const thumbUrl = songData.thumbnail || video.thumbnail;
                        if (thumbUrl) {
                            const img = await axios.get(thumbUrl, { responseType: 'arraybuffer', timeout: 15000 });
                            thumbnailBuffer = Buffer.from(img.data);
                        }
                    } catch { /* no thumbnail */ }
                    await sock.sendMessage(chatId, {
                        audio: { url: songData.downloadUrl },
                        mimetype: 'audio/mpeg',
                        fileName: `${songData.title || video.title || 'song'}.mp3`,
                        contextInfo: {
                            externalAdReply: {
                                title: songData.title || video.title,
                                body: `${video.author?.name || ''} • ${video.timestamp}`,
                                thumbnail: thumbnailBuffer,
                                mediaType: 2,
                                sourceUrl: video.url
                            }
                        }
                    }, { quoted: message });
                    console.log(`[play] Downloaded via ${api.name}`);
                    return;
                } catch (err) {
                    console.log(`[play] ${api.name} failed: ${err.message}`);
                    errors.push(`${api.name}: ${err.message}`);
                }
            }

            await sock.sendMessage(chatId, {
                text: `❌ *Download failed*\nAll sources are currently down. Please try again later.`
            }, { quoted: message });

        } catch (err) {
            console.error('Play error:', err.message);
            await sock.sendMessage(chatId, { text: `❌ *Failed:* ${err.message}` }, { quoted: message });
        }
    }
};
