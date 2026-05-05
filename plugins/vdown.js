import axios from 'axios';
import yts from 'yt-search';

const DL_API = 'https://api.qasimdev.dpdns.org/api/loaderto/download';
const API_KEY = 'xbps-install-Syu';

// Available resolution options
// NOTE: 'worst' for option 1 picks the truly smallest combined file.
// Requesting '144' separately forces a video-only stream + full audio merge
// which often produces a file LARGER than 360p or 480p.
const RESOLUTIONS = [
    { label: 'Smallest (≤360p)', format: 'worst' },
    { label: '360p  (Low)',      format: '360' },
    { label: '480p  (Medium)',   format: '480' },
    { label: '720p  (HD)',       format: '720' },
    { label: '1080p (Full HD)',  format: '1080' }
];

// Pending video sessions waiting for quality selection
// { [chatId]: { url, title, thumbnail, expires } }
const pending = {};

const wait = ms => new Promise(r => setTimeout(r, ms));

async function downloadVideo(url, format) {
    for (let i = 0; i < 3; i++) {
        try {
            const { data } = await axios.get(DL_API, {
                params: { apiKey: API_KEY, format, url },
                timeout: 120000
            });
            if (data?.data?.downloadUrl) return data.data;
            throw new Error('No download URL in response');
        } catch (err) {
            if (i === 2) throw err;
            await wait(5000);
        }
    }
}

function isExpired(session) {
    return Date.now() > session.expires;
}

// ── Exported: called by messageHandler for plain 1-5 quality replies ─────────
export async function handleVdownReply(sock, chatId, qualityNum, message, channelInfo) {
    if (qualityNum < 1 || qualityNum > 5) return false;
    const session = pending[chatId];
    if (!session || isExpired(session)) {
        delete pending[chatId];
        return false;
    }
    const res = RESOLUTIONS[qualityNum - 1];
    delete pending[chatId];

    await sock.sendMessage(chatId, {
        image: { url: session.thumbnail },
        caption: [
            `🎬 *${session.title}*`,
            ``,
            `📥 Downloading in *${res.label}*...`,
            `⏳ _This may take up to 2 minutes for large videos._`
        ].join('\n'),
        ...channelInfo
    }, { quoted: message });

    try {
        const videoData = await downloadVideo(session.url, res.format);
        await sock.sendMessage(chatId, {
            video: { url: videoData.downloadUrl },
            mimetype: 'video/mp4',
            fileName: `${session.title || 'video'}_${res.format}p.mp4`,
            caption: [
                `🎬 *${videoData.title || session.title}*`,
                `📺 Quality: *${res.label}*`,
                ``,
                `> _Downloaded by JAM-MD_`
            ].join('\n'),
            ...channelInfo
        }, { quoted: message });
    } catch (err) {
        const isTimeout = err.message?.includes('timeout') || err.response?.status === 408;
        await sock.sendMessage(chatId, {
            text: [
                `❌ *Download failed for ${res.label}*`,
                ``,
                isTimeout ? '⏱️ Download timed out. Try a lower quality like 360p.' : `Reason: ${err.message}`,
                ``,
                `_Run .vdown again and pick a lower quality._`
            ].join('\n'),
            ...channelInfo
        }, { quoted: message });
    }
    return true;
}

export default {
    command: 'vdown',
    aliases: ['viddown', 'ytres', 'ytquality', 'dlvideo'],
    category: 'download',
    description: 'Download YouTube video in your chosen resolution',
    usage: '.vdown <youtube link | search query>\nThen reply with 1-5 to pick quality',

    async handler(sock, message, args, context) {
        const { chatId, channelInfo } = context;
        const input = args.join(' ').trim();

        // ── No argument ───────────────────────────────────────────────
        if (!input) {
            return sock.sendMessage(chatId, {
                text: [
                    '🎬 *Video Downloader — Quality Picker*',
                    '',
                    '*Usage:*',
                    '`.vdown <YouTube link>` — paste a direct link',
                    '`.vdown <search terms>` — search and pick',
                    '',
                    '*Available qualities:*',
                    ...RESOLUTIONS.map((r, i) => `  *${i + 1}.* ${r.label}`),
                    '',
                    '_After running the command you will be asked to pick a quality by replying with a number._'
                ].join('\n'),
                ...channelInfo
            }, { quoted: message });
        }

        // ── Quality selection (user replies with 1-5) ──────────────────
        const qualityPick = parseInt(input, 10);
        if (qualityPick >= 1 && qualityPick <= 5 && input === String(qualityPick)) {
            const session = pending[chatId];
            if (!session || isExpired(session)) {
                delete pending[chatId];
                return sock.sendMessage(chatId, {
                    text: '⚠️ No pending video found. Please run `.vdown <query>` first.',
                    ...channelInfo
                }, { quoted: message });
            }

            const res = RESOLUTIONS[qualityPick - 1];
            delete pending[chatId];

            await sock.sendMessage(chatId, {
                image: { url: session.thumbnail },
                caption: [
                    `🎬 *${session.title}*`,
                    ``,
                    `📥 Downloading in *${res.label}*...`,
                    `⏳ _This may take up to 2 minutes for large videos._`
                ].join('\n'),
                ...channelInfo
            }, { quoted: message });

            try {
                const videoData = await downloadVideo(session.url, res.format);
                await sock.sendMessage(chatId, {
                    video: { url: videoData.downloadUrl },
                    mimetype: 'video/mp4',
                    fileName: `${session.title || 'video'}_${res.format}p.mp4`,
                    caption: [
                        `🎬 *${videoData.title || session.title}*`,
                        `📺 Quality: *${res.label}*`,
                        ``,
                        `> _Downloaded by JAM-MD_`
                    ].join('\n'),
                    ...channelInfo
                }, { quoted: message });
            } catch (err) {
                const isTimeout = err.message?.includes('timeout') || err.response?.status === 408;
                await sock.sendMessage(chatId, {
                    text: [
                        `❌ *Download failed for ${res.label}*`,
                        ``,
                        isTimeout
                            ? '⏱️ The download timed out. Try a lower quality like 360p.'
                            : `Reason: ${err.message}`,
                        ``,
                        `_Run .vdown again and choose a lower quality._`
                    ].join('\n'),
                    ...channelInfo
                }, { quoted: message });
            }
            return;
        }

        // ── New search / URL ──────────────────────────────────────────
        let videoUrl, videoTitle, videoThumbnail, videoDuration;

        if (input.startsWith('http://') || input.startsWith('https://')) {
            const validYT = input.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|shorts\/|embed\/))([a-zA-Z0-9_-]{11})/);
            if (!validYT) {
                return sock.sendMessage(chatId, {
                    text: '❌ Not a valid YouTube link! Please send a YouTube URL or search terms.',
                    ...channelInfo
                }, { quoted: message });
            }
            videoUrl = input;
            const ytId = validYT[1];
            videoThumbnail = `https://i.ytimg.com/vi/${ytId}/sddefault.jpg`;
        } else {
            await sock.sendMessage(chatId, {
                react: { text: '🔍', key: message.key }
            });
            try {
                const { videos } = await yts(input);
                if (!videos?.length) {
                    return sock.sendMessage(chatId, {
                        text: '❌ No videos found for that search.',
                        ...channelInfo
                    }, { quoted: message });
                }
                const v = videos[0];
                videoUrl       = v.url;
                videoTitle     = v.title;
                videoThumbnail = v.thumbnail;
                videoDuration  = v.timestamp;
            } catch (err) {
                return sock.sendMessage(chatId, {
                    text: `❌ Search failed: ${err.message}`,
                    ...channelInfo
                }, { quoted: message });
            }
        }

        // Validate YouTube
        const ytMatch = videoUrl.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|shorts\/|embed\/))([a-zA-Z0-9_-]{11})/);
        if (!ytMatch) {
            return sock.sendMessage(chatId, { text: '❌ Only YouTube videos are supported.', ...channelInfo }, { quoted: message });
        }
        const ytId = ytMatch[1];
        videoThumbnail = videoThumbnail || `https://i.ytimg.com/vi/${ytId}/sddefault.jpg`;

        // Save pending session (expires in 3 minutes)
        pending[chatId] = {
            url: videoUrl,
            title: videoTitle || input,
            thumbnail: videoThumbnail,
            expires: Date.now() + 3 * 60 * 1000
        };

        const qualityList = RESOLUTIONS.map((r, i) => `  *${i + 1}.* ${r.label}`).join('\n');

        await sock.sendMessage(chatId, {
            image: { url: videoThumbnail },
            caption: [
                `🎬 *${videoTitle || 'Video found!'}*`,
                videoDuration ? `⏱️ Duration: ${videoDuration}` : '',
                ``,
                `📺 *Choose a quality by replying with a number:*`,
                qualityList,
                ``,
                `_Example: reply with *2* to download in 360p_`,
                `_Session expires in 3 minutes._`
            ].filter(Boolean).join('\n'),
            ...channelInfo
        }, { quoted: message });
    }
};
