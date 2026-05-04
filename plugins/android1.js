import axios from 'axios';
// APK search and download via discardapi (same provider already used for downloads)
const DISCARD_API = 'https://discardapi.dpdns.org';
const API_KEY = 'guru';

async function searchApks(query) {
    // Try discardapi search first
    try {
        const res = await fetch(`${DISCARD_API}/api/apk/search?apikey=${API_KEY}&q=${encodeURIComponent(query)}`);
        if (res.ok) {
            const d = await res.json();
            const list = d?.result || d?.data || [];
            if (Array.isArray(list) && list.length) return list;
        }
    } catch { }
    // Fallback: APKPure search
    const res2 = await fetch(
        `https://apkpure.net/search?q=${encodeURIComponent(query)}&t=app`,
        { headers: { 'User-Agent': 'Mozilla/5.0 (Android 13; Mobile)' } }
    );
    if (!res2.ok) throw new Error('APK search failed. Try a different name.');
    const html = await res2.text();
    const results = [];
    const re = /<a[^>]+href="(\/[^"]+?-[a-z0-9.]+\/)"[^>]*>[\s\S]*?<p class="p1">(.*?)<\/p>[\s\S]*?<img[^>]+src="([^"]+)"[\s\S]*?<\/a>/g;
    let m;
    while ((m = re.exec(html)) !== null && results.length < 8) {
        results.push({
            judul: m[2].replace(/<[^>]+>/g, '').trim(),
            link: `https://apkpure.net${m[1]}`,
            thumb: m[3],
            dev: '',
            rating: 'N/A',
        });
    }
    if (results.length === 0) throw new Error('No APKs found. Try a different search term.');
    return results;
}

export default {
    command: 'apkdl',
    aliases: ['apk', 'an1apk', 'appdl', 'app'],
    category: 'download',
    description: 'Search APKs and download by reply',
    usage: '.apkdl <app name>',
    async handler(sock, message, args, context) {
        const chatId = context.chatId || message.key.remoteJid;
        const query = args.join(' ').trim();
        if (!query) {
            return await sock.sendMessage(chatId, {
                text: '*Please provide an app name.*\nExample: .apkdl Telegram'
            }, { quoted: message });
        }
        try {
            await sock.sendMessage(chatId, { text: `🔎 Searching APKs for *${query}*...` }, { quoted: message });
            const results = await searchApks(query);
            const first = results[0];
            let caption = `📱 *APK Search: "${query}"*\n\n↩️ *Reply with a number to download*\n\n`;
            results.forEach((item, i) => {
                caption += `*${i + 1}.* ${item.judul}`;
                if (item.dev) caption += `\n👨‍💻 ${item.dev}`;
                if (item.rating && item.rating !== 'N/A') caption += `  ⭐ ${item.rating}`;
                caption += `\n🔗 ${item.link}\n\n`;
            });
            const msgOpts = first?.thumb
                ? { image: { url: first.thumb }, caption }
                : { text: caption };
            const sentMsg = await sock.sendMessage(chatId, msgOpts, { quoted: message });
            const timeout = setTimeout(async () => {
                sock.ev.off('messages.upsert', listener);
                await sock.sendMessage(chatId, {
                    text: '⏱ APK selection timed out. Search again.'
                }, { quoted: sentMsg });
            }, 5 * 60 * 1000);
            const listener = async ({ messages }) => {
                const m = messages[0];
                if (!m?.message || m.key.remoteJid !== chatId) return;
                const ctx = m.message?.extendedTextMessage?.contextInfo;
                if (!ctx?.stanzaId || ctx.stanzaId !== sentMsg.key.id) return;
                const replyText = m.message.conversation || m.message.extendedTextMessage?.text || '';
                const choice = parseInt(replyText.trim(), 10);
                if (isNaN(choice) || choice < 1 || choice > results.length) {
                    return sock.sendMessage(chatId, {
                        text: `❌ Invalid choice. Pick 1–${results.length}.`
                    }, { quoted: m });
                }
                clearTimeout(timeout);
                sock.ev.off('messages.upsert', listener);
                const selected = results[choice - 1];
                await sock.sendMessage(chatId, {
                    text: `⬇️ Downloading *${selected.judul}*...\n⏱ Please wait...`
                }, { quoted: m });
                try {
                    const dlRes = await axios.get(
                        `${DISCARD_API}/api/apk/dl/android1?apikey=${API_KEY}&url=${encodeURIComponent(selected.link)}`
                    );
                    const apk = dlRes.data?.result;
                    if (!apk?.url) throw new Error('Download link unavailable for this app.');
                    const safeName = (apk.name || selected.judul).replace(/[^\w.-]/g, '_');
                    const apkCaption =
                        `📦 *${apk.name || selected.judul}*\n\n` +
                        (apk.rating ? `⭐ Rating: ${apk.rating}\n` : '') +
                        (apk.size ? `📦 Size: ${apk.size}\n` : '') +
                        (apk.requirement ? `📱 Android: ${apk.requirement}\n` : '') +
                        (apk.rated ? `🧒 Age: ${apk.rated}\n` : '') +
                        (apk.published ? `📅 Published: ${apk.published}\n` : '') +
                        (apk.description ? `\n📝 ${apk.description}` : '');
                    await sock.sendMessage(chatId, {
                        document: { url: apk.url },
                        fileName: `${safeName}.apk`,
                        mimetype: 'application/vnd.android.package-archive',
                        caption: apkCaption
                    }, { quoted: m });
                } catch (dlErr) {
                    await sock.sendMessage(chatId, {
                        text: `❌ Download failed: ${dlErr.message}`
                    }, { quoted: m });
                }
            };
            sock.ev.on('messages.upsert', listener);
        } catch (err) {
            console.error('APK Plugin Error:', err);
            await sock.sendMessage(chatId, {
                text: `❌ ${err.message || 'Failed to process APK request.'}`
            }, { quoted: message });
        }
    }
};
