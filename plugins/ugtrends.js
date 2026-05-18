// plugins/ugtrends.js — Live Uganda internet tricks from Kiberu Data & Uganda tech sites
import https from 'https';
import http from 'http';

function fetchUrl(url, opts = {}) {
    return new Promise((resolve, reject) => {
        const lib = url.startsWith('https') ? https : http;
        const reqOpts = {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Linux; Android 11; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Mobile Safari/537.36',
                'Accept-Language': 'en-US,en;q=0.9',
                ...opts.headers
            },
            timeout: 14000,
        };
        const req = lib.get(url, reqOpts, res => {
            // follow one redirect
            if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
                return fetchUrl(res.headers.location, opts).then(resolve).catch(reject);
            }
            let d = '';
            res.on('data', c => d += c);
            res.on('end', () => resolve(d));
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    });
}

function cleanHtml(str) {
    return str
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&#33;/g, '!')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&nbsp;/g, ' ')
        .replace(/&#\d+;/g, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

async function fetchKiberuData() {
    const html = await fetchUrl('https://t.me/s/kiberudata');

    // extract text blocks
    const textMatches = [...html.matchAll(/class="tgme_widget_message_text js-message_text"[^>]*>([\s\S]*?)<\/div>/g)];
    // extract message links (for "View post" links)
    const linkMatches = [...html.matchAll(/href="(https:\/\/t\.me\/KiberuData\/\d+)"/g)].map(m => m[1]);
    // extract dates
    const dateMatches = [...html.matchAll(/datetime="([^"]+)"/g)].map(m => m[1]);

    const results = [];
    textMatches.forEach((m, i) => {
        const raw = cleanHtml(m[1]);
        if (!raw || raw.length < 15) return;
        // skip posts that are mostly just links or academic content
        const lower = raw.toLowerCase();
        if (lower.includes('exoticnotes') && !lower.includes('vpn') && !lower.includes('trick') && !lower.includes('internet')) return;
        if (lower.includes('results ranked') || lower.includes('a level subject')) return;

        const date = dateMatches[i] ? new Date(dateMatches[i]).toLocaleDateString('en-UG', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
        const link = linkMatches[i] || '';
        // shorten long posts — show first 280 chars
        const preview = raw.length > 280 ? raw.substring(0, 280).replace(/\n[\s\S]*$/, '') + '...' : raw;
        results.push({ preview, date, link });
    });

    // return last 6 (most recent are at the end)
    return results.slice(-6).reverse();
}

async function fetchUgandaSites() {
    const feeds = [
        'https://www.techjaja.com/?s=MTN+Airtel+Uganda+internet&feed=rss2',
        'https://www.techjaja.com/?s=free+internet+Uganda+VPN&feed=rss2',
        'https://www.techjaja.com/?s=Uganda+data+bundles&feed=rss2',
    ];
    const results = [];
    for (const url of feeds) {
        try {
            const xml = await fetchUrl(url);
            const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)];
            for (const [, block] of items) {
                const title = block.match(/<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i)?.[1]
                    ?.replace(/&amp;/g, '&').replace(/&#\d+;/g, '').trim() || '';
                const link = block.match(/<link>(.*?)<\/link>/i)?.[1]?.trim() || '';
                const pubDate = block.match(/<pubDate>(.*?)<\/pubDate>/i)?.[1]?.trim() || '';
                const date = pubDate ? new Date(pubDate).toLocaleDateString('en-UG', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
                const skip = ['equity bank', 'phone calls', 'streaming experience', 'chrome browser', 'gaming experience', 'dataking'];
                if (title && link && !results.find(r => r.link === link) && !skip.some(s => title.toLowerCase().includes(s))) {
                    results.push({ title, link, date });
                }
            }
        } catch {}
    }
    return results.slice(0, 5);
}

export default {
    command: 'tricks',
    aliases: ['ugdeals', 'ugapn', 'uginternet', 'freeug', 'latesttricks', 'kiberudata'],
    category: 'tools',
    description: 'Live Uganda internet tricks from Kiberu Data Telegram, Uganda tech sites + YouTube/TikTok links',
    usage: '.tricks',
    async handler(sock, message, args, context) {
        const { chatId } = context;

        await sock.sendMessage(chatId, { text: '🔍 Fetching latest Uganda internet tricks...' }, { quoted: message });

        let telegramPart = '';
        let sitesPart = '';
        let hasContent = false;

        // --- Kiberu Data Telegram ---
        try {
            const posts = await fetchKiberuData();
            if (posts.length) {
                hasContent = true;
                telegramPart = `📲 *Latest from Kiberu Data Telegram*\n`
                    + `_(t.me/KiberuData)_\n`
                    + `━━━━━━━━━━━━━━━━━\n\n`
                    + posts.map(p => {
                        let out = p.preview;
                        if (p.date) out += `\n🗓️ ${p.date}`;
                        if (p.link) out += `\n🔗 ${p.link}`;
                        return out;
                    }).join('\n\n─────────────\n\n');
            }
        } catch {}

        // --- Uganda tech sites ---
        try {
            const articles = await fetchUgandaSites();
            if (articles.length) {
                hasContent = true;
                sitesPart = `🌐 *Uganda Tech Sites — Latest Articles*\n`
                    + `━━━━━━━━━━━━━━━━━\n\n`
                    + articles.map(a => `📰 *${a.title}*${a.date ? `\n🗓️ ${a.date}` : ''}\n🔗 ${a.link}`).join('\n\n');
            }
        } catch {}

        if (!hasContent) {
            return sock.sendMessage(chatId, {
                text: '❌ Could not reach sources right now. Try again in a moment.\n\nManual search:\n🎬 https://www.youtube.com/results?search_query=Uganda+free+internet+tricks+2025\n📲 https://t.me/KiberuData'
            }, { quoted: message });
        }

        // --- YouTube & TikTok search links (can't scrape, give links) ---
        const searchLinks = `🎬 *YouTube — Search for Latest Tricks*\n`
            + `━━━━━━━━━━━━━━━━━\n`
            + `🔍 Uganda free internet trick:\nhttps://www.youtube.com/results?search_query=Uganda+free+internet+trick+2025\n\n`
            + `🔍 MTN Uganda free data:\nhttps://www.youtube.com/results?search_query=MTN+Uganda+free+internet+2025\n\n`
            + `🔍 Airtel Uganda trick:\nhttps://www.youtube.com/results?search_query=Airtel+Uganda+free+internet+trick+2025\n\n`
            + `🎵 *TikTok — Uganda Internet Tricks*\n`
            + `━━━━━━━━━━━━━━━━━\n`
            + `🔍 https://www.tiktok.com/search?q=Uganda+free+internet+trick\n`
            + `🔍 https://www.tiktok.com/search?q=MTN+Uganda+trick+2025`;

        const parts = [telegramPart, sitesPart, searchLinks].filter(Boolean);

        // send each section as a separate message so nothing gets cut off
        for (const part of parts) {
            await sock.sendMessage(chatId, { text: part }, { quoted: message });
        }
    }
};
