export default {
    command: 'tiktokaudio',
    aliases: ['ttaudio', 'ttmp3', 'tiktokmp3'],
    category: 'download',
    description: 'Download audio/music from a TikTok video',
    usage: '.tiktokaudio <TikTok URL>',
    async handler(sock, message, args, context) {
        const { chatId } = context;
        const url = args.join(' ').trim();
        if (!url) {
            return sock.sendMessage(chatId, {
                text: '🎵 *TikTok Audio Downloader*\n\nProvide a TikTok URL.\nExample: _.tiktokaudio https://vm.tiktok.com/XXXX_'
            }, { quoted: message });
        }
        if (!url.match(/tiktok\.com|vm\.tiktok|vt\.tiktok/i)) {
            return sock.sendMessage(chatId, {
                text: '❌ That doesn\'t look like a TikTok link.\nExample: _.tiktokaudio https://vm.tiktok.com/XXXX_'
            }, { quoted: message });
        }
        await sock.sendMessage(chatId, { text: '⏳ Extracting TikTok audio...' }, { quoted: message });
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
            const audioUrl = d.music;
            if (!audioUrl) throw new Error('No audio found for this TikTok');

            const likeCount = Number(d.digg_count || 0);
            const likes = likeCount >= 1000000
                ? (likeCount / 1000000).toFixed(1) + 'M'
                : likeCount >= 1000 ? (likeCount / 1000).toFixed(1) + 'K'
                : String(likeCount);

            const caption = `🎵 *TikTok Audio*
━━━━━━━━━━━━━━━━━━━
👤 *Creator:* ${d.author?.nickname || 'Unknown'}
🆔 *Username:* @${d.author?.unique_id || ''}
⏱️ *Duration:* ${d.duration || '?'}s

❤️ *Likes:* ${likes}
💬 *Comments:* ${d.comment_count || 0}

🎧 *Sound:* ${d.music_info?.title || 'Original'}
━━━━━━━━━━━━━━━━━━━`;

            const audioRes = await fetch(audioUrl, {
                headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://www.tikwm.com/' },
                signal: AbortSignal.timeout(60000)
            });
            if (!audioRes.ok) throw new Error(`Audio fetch failed: ${audioRes.status}`);
            const audioBuffer = Buffer.from(await audioRes.arrayBuffer());

            await sock.sendMessage(chatId, {
                audio: audioBuffer,
                mimetype: 'audio/mpeg',
                ptt: false,
                caption
            }, { quoted: message });

            await sock.sendMessage(chatId, { text: caption }, { quoted: message });
        } catch (err) {
            const msg = err.name === 'TimeoutError'
                ? '⏱️ Request timed out. Please try again.'
                : `❌ Failed to extract audio.\nReason: ${err.message}`;
            await sock.sendMessage(chatId, { text: msg }, { quoted: message });
        }
    }
};
