import https from 'https';

function fetchUrl(url) {
    return new Promise((resolve, reject) => {
        const req = https.get(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36' },
            timeout: 10000
        }, res => {
            // Follow redirect
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                return fetchUrl(res.headers.location).then(resolve).catch(reject);
            }
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => resolve(data));
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    });
}

function stripTags(str) {
    return str.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#039;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
}

function parseRssItems(xml, keywords, limit = 5) {
    const items = [];
    const itemMatches = xml.match(/<item[\s\S]*?<\/item>/gi) || [];
    for (const item of itemMatches) {
        const titleMatch = item.match(/<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i);
        const linkMatch = item.match(/<link[^>]*>([\s\S]*?)<\/link>/i) ||
                          item.match(/<guid[^>]*>(https?:\/\/[^<]+)<\/guid>/i);
        const descMatch = item.match(/<description[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/i);
        const dateMatch = item.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i);

        const title = titleMatch ? stripTags(titleMatch[1]) : '';
        const link = linkMatch ? linkMatch[1].trim() : '';
        const desc = descMatch ? stripTags(descMatch[1]).slice(0, 120) : '';
        const date = dateMatch ? new Date(dateMatch[1]).toLocaleDateString('en-UG', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

        if (!title || !link) continue;

        // Filter by keywords if provided
        if (keywords && keywords.length > 0) {
            const combined = (title + ' ' + desc).toLowerCase();
            if (!keywords.some(k => combined.includes(k.toLowerCase()))) continue;
        }

        items.push({ title, link, desc, date });
        if (items.length >= limit) break;
    }
    return items;
}

async function fetchTechJaja(keyword) {
    try {
        const url = `https://www.techjaja.com/?s=${encodeURIComponent(keyword)}&feed=rss2`;
        const xml = await fetchUrl(url);
        return parseRssItems(xml, null, 4);
    } catch {
        return [];
    }
}

async function fetchDignited(keyword) {
    try {
        const url = `https://www.dignited.com/?s=${encodeURIComponent(keyword)}&feed=rss2`;
        const xml = await fetchUrl(url);
        return parseRssItems(xml, null, 3);
    } catch {
        return [];
    }
}

async function fetchMtnPromotions() {
    try {
        const html = await fetchUrl('https://www.mtn.co.ug/promotion/');
        // Parse promotion titles from MTN's WordPress page
        const titles = [];
        const matches = html.match(/<h[1-4][^>]*>([\s\S]{5,150}?)<\/h[1-4]>/gi) || [];
        for (const m of matches) {
            const text = stripTags(m);
            if (text.length > 10 && text.length < 120 && !/menu|nav|footer|cookie|copyright/i.test(text)) {
                titles.push(text);
            }
        }
        return titles.slice(0, 5);
    } catch {
        return [];
    }
}

const TELECOM_KEYWORDS = ['airtel', 'mtn', 'free internet', 'data', 'bundle', 'trick', 'offer', 'promo', 'discount', 'Uganda'];

export default {
    command: 'ugtrends',
    aliases: ['tricks', 'telecomug', 'airteltrend', 'mtntrend'],
    category: 'info',
    description: 'Get trending Airtel/MTN Uganda tricks, offers and free internet tips',
    usage: '.ugtrends [airtel|mtn|all]',
    async handler(sock, message, args, context) {
        const chatId = context.chatId || message.key.remoteJid;
        const filter = (args[0] || 'all').toLowerCase();

        await sock.sendMessage(chatId, {
            text: '🔍 Fetching latest Airtel/MTN Uganda trends & tricks...'
        }, { quoted: message });

        // Build search queries based on filter
        const searchQuery = filter === 'airtel'
            ? 'airtel uganda free internet offer'
            : filter === 'mtn'
            ? 'mtn uganda free internet bundle offer'
            : 'airtel mtn uganda free internet';

        // Fetch all sources in parallel
        const [tjArticles, digArticles, mtnPromos] = await Promise.all([
            fetchTechJaja(searchQuery),
            fetchDignited(searchQuery),
            filter !== 'airtel' ? fetchMtnPromotions() : Promise.resolve([])
        ]);

        let hasContent = false;

        // MTN Official Promotions
        if (mtnPromos.length > 0 && filter !== 'airtel') {
            hasContent = true;
            let msg = '📡 *MTN Uganda — Current Promotions*\n';
            msg += '🔗 mtn.co.ug/promotion\n\n';
            mtnPromos.forEach((p, i) => { msg += `${i + 1}. ${p}\n`; });
            msg += '\n_Visit mtn.co.ug for full details_';
            await sock.sendMessage(chatId, { text: msg });
        }

        // TechJaja Articles
        if (tjArticles.length > 0) {
            hasContent = true;
            let msg = '📰 *TechJaja — Trending Uganda Telecom Articles*\n\n';
            for (const a of tjArticles) {
                msg += `🔹 *${a.title}*\n`;
                if (a.date) msg += `📅 ${a.date}\n`;
                if (a.desc) msg += `${a.desc}...\n`;
                msg += `🔗 ${a.link}\n\n`;
            }
            await sock.sendMessage(chatId, { text: msg.trim() });
        }

        // Dignited Articles
        if (digArticles.length > 0) {
            hasContent = true;
            let msg = '📰 *Dignited — Uganda Tech & Telecom News*\n\n';
            for (const a of digArticles) {
                msg += `🔹 *${a.title}*\n`;
                if (a.date) msg += `📅 ${a.date}\n`;
                if (a.desc) msg += `${a.desc}...\n`;
                msg += `🔗 ${a.link}\n\n`;
            }
            await sock.sendMessage(chatId, { text: msg.trim() });
        }

        // Tips section — always shown
        const airtelTips = [
            '💡 Dial *185# → My Airtel → Offers to see your personal bundles',
            '💡 Text "BAL" to 185 to check remaining data balance',
            '💡 Airtel often gives bonus data between 12am–5am — try browsing then',
            '💡 Check *174*7# for Airtel Uganda daily free MB promotions',
            '💡 Follow @AirtelUG on Twitter/X for flash offers'
        ];
        const mtnTips = [
            '💡 Dial *165# → My MTN → Offers for personal promotions',
            '💡 MTN Pulse (*180#) often has student bundles with bonus data',
            '💡 Check MTN App daily for limited-time double-data offers',
            '💡 Text "DATA" to 153 to check your MTN data balance',
            '💡 Follow @MTNUganda on Twitter/X for flash sale alerts'
        ];

        let tipsMsg = '';
        if (filter === 'airtel') {
            tipsMsg = '✈️ *Airtel Uganda Quick Tips*\n\n' + airtelTips.join('\n');
        } else if (filter === 'mtn') {
            tipsMsg = '🟡 *MTN Uganda Quick Tips*\n\n' + mtnTips.join('\n');
        } else {
            tipsMsg = '✈️ *Airtel Uganda Tips*\n' + airtelTips.slice(0, 3).join('\n') +
                      '\n\n🟡 *MTN Uganda Tips*\n' + mtnTips.slice(0, 3).join('\n');
        }
        await sock.sendMessage(chatId, { text: tipsMsg });

        if (!hasContent) {
            await sock.sendMessage(chatId, {
                text: '⚠️ Could not fetch live articles right now — check the tips above and visit techjaja.com or dignited.com directly for more.'
            });
        }

        await sock.sendMessage(chatId, {
            text: [
                '📌 *Usage:*',
                '• `.ugtrends` — show both Airtel & MTN',
                '• `.ugtrends airtel` — Airtel only',
                '• `.ugtrends mtn` — MTN only',
                '',
                '🔁 Aliases: `.tricks` `.telecomug` `.airteltrend` `.mtntrend`'
            ].join('\n')
        }, { quoted: message });
    }
};
