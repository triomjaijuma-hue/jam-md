export default {
    command: 'tiktok',
    aliases: ['tt', 'ttdl', 'tiktokdl'],
    category: 'download',
    description: 'Download TikTok video without watermark',
    usage: '.tiktok <TikTok URL>',
    async handler(sock, message, args, context) {
        const { chatId } = context;
        const url = args.join(' ').trim();
        if (!url) {
            return sock.sendMessage(chatId, {
                text: '🎵 *TikTok Downloader*\n\nProvide a TikTok URL.\nExample: _.tiktok https://vm.tiktok.com/XXXX_'
            }, { quoted: message });
        }
        if (!url.match(/tiktok\.com|vm\.tiktok|vt\.tiktok/i)) {
            return sock.sendMessage(chatId, {
                text: '❌ That doesn\'t look like a TikTok link.\nExample: _.tiktok https://vm.tiktok.com/XXXX_'
            }, { quoted: message });
        }
        await sock.sendMessage(chatId, { text: '⏳ Downloading TikTok video...' }, { quoted: message });
        try {
            const apiUrl = `https://www.tikwm.com/api/?url=${encodeURIComponent(url)}&hd=0`;
            const res = await fetch(apiUrl, {
                headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://www.tikwm.com/' },
                signal: AbortSignal.timeout(30000)
            });
            const json = await res.json();
            if (!json || json.code !== 0 || !json.data) {
                throw new Error(json?.msg || 'Invalid API response');
            }
            const d = json.data;

            // Prefer d.play (H.264, universally compatible) over d.hdplay (often HEVC/H.265
            // which WhatsApp plays audio-only on many devices).
            const videoUrl = d.play || d.hdplay;
            if (!videoUrl) throw new Error('No downloadable video found');

            const likeCount = Number(d.digg_count || 0);
            const likes = likeCount >= 1000000
                ? (likeCount / 1000000).toFixed(1) + 'M'
                : likeCount >= 1000 ? (likeCount / 1000).toFixed(1) + 'K'
                : String(likeCount);

            const caption = `🎵 *TikTok Downloader*
━━━━━━━━━━━━━━━━━━━
👤 *Creator:* ${d.author?.nickname || 'Unknown'}
🆔 *Username:* @${d.author?.unique_id || ''}
⏱️ *Duration:* ${d.duration || '?'}s

❤️ *Likes:* ${likes}
💬 *Comments:* ${d.comment_count || 0}
🔁 *Shares:* ${d.share_count || 0}
👀 *Views:* ${d.play_count || 0}

🎧 *Sound:* ${d.music_info?.title || 'Original'}

📝 *Caption:*
${d.title || 'No caption'}

✨ *Quality:* No Watermark
━━━━━━━━━━━━━━━━━━━`;

            // Download as buffer so WhatsApp receives a complete, decodable mp4
            const videoRes = await fetch(videoUrl, {
                headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://www.tikwm.com/' },
                signal: AbortSignal.timeout(60000)
            });
            if (!videoRes.ok) throw new Error(`Video fetch failed: ${videoRes.status}`);
            const videoBuffer = Buffer.from(await videoRes.arrayBuffer());

            await sock.sendMessage(chatId, {
                video: videoBuffer,
                mimetype: 'video/mp4',
                caption
            }, { quoted: message });
        } catch (err) {
            const msg = err.name === 'TimeoutError'
                ? '⏱️ Request timed out. Please try again.'
                : `❌ Failed to download.\nReason: ${err.message}`;
            await sock.sendMessage(chatId, { text: msg }, { quoted: message });
        }
    }
};
