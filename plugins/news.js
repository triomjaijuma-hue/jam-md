// Uganda feeds confirmed working (tested): Google News, Independent, KFM, Soft Power
const UGANDA_FEEDS = [
    { name: 'Google News Uganda',      url: 'https://news.google.com/rss/search?q=Uganda+news&hl=en-UG&gl=UG&ceid=UG:en' },
    { name: 'The Independent Uganda',  url: 'https://www.independent.co.ug/feed/' },
    { name: 'KFM Uganda',              url: 'https://kfm.co.ug/feed/' },
    { name: 'Soft Power News',         url: 'https://softpower.ug/feed/' },
    { name: 'Chimp Reports',           url: 'https://chimpreports.com/feed/' },
    { name: 'NBS Uganda',              url: 'https://nbstv.ug/feed/' },
    { name: 'BBC Africa',              url: 'https://feeds.bbci.co.uk/news/world/africa/rss.xml' },
];

const GLOBAL_FEEDS = [
    { name: 'BBC News',   url: 'https://feeds.bbci.co.uk/news/rss.xml' },
    { name: 'Reuters',    url: 'https://feeds.reuters.com/reuters/topNews' },
    { name: 'Al Jazeera', url: 'https://www.aljazeera.com/xml/rss/all.xml' },
    { name: 'AP News',    url: 'https://rsshub.app/apnews/topics/ap-top-news' },
];

function clean(str) {
    return (str || '')
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g,  '&')
        .replace(/&lt;/g,   '<')
        .replace(/&gt;/g,   '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g,  "'")
        .replace(/&apos;/g, "'")
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function parseRss(xml, sourceName) {
    const items = [];
    // Support both RSS <item> and Atom <entry>
    const tagRe = /<(?:item|entry)>([\s\S]*?)<\/(?:item|entry)>/g;
    let m;
    while ((m = tagRe.exec(xml)) !== null && items.length < 5) {
        const block = m[1];
        const title = clean((/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i.exec(block))?.[1]);
        const desc  = clean(
            (/<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/i.exec(block))?.[1] ||
            (/<summary[^>]*>([\s\S]*?)<\/summary>/i.exec(block))?.[1] || ''
        );
        // Google News wraps links inside CDATA differently
        const link  =
            (/<link>(?:<!\[CDATA\[)?(https?:\/\/[^<\]]+)(?:\]\]>)?<\/link>/i.exec(block))?.[1]?.trim() ||
            (/<guid[^>]*>(https?:\/\/[^<]+)<\/guid>/i.exec(block))?.[1]?.trim() ||
            (/<link[^>]+href="(https?:\/\/[^"]+)"/i.exec(block))?.[1]?.trim();
        if (title && title.length > 5 && !title.toLowerCase().includes('<!')) {
            items.push({ title, desc: desc.slice(0, 130) || '', link });
        }
    }
    return { items, sourceName };
}

async function fetchFeeds(feeds) {
    for (const feed of feeds) {
        try {
            const res = await fetch(feed.url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1)',
                    'Accept': 'application/rss+xml, application/xml, text/xml, */*'
                },
                signal: AbortSignal.timeout(12000),
                redirect: 'follow'
            });
            if (!res.ok) continue;
            const xml = await res.text();
            const parsed = parseRss(xml, feed.name);
            if (parsed.items.length >= 3) return parsed;
        } catch { continue; }
    }
    return null;
}

export default {
    command: 'news',
    aliases: ['headlines', 'latestnews', 'breakingnews', 'ug news'],
    category: 'info',
    description: 'Get the latest Uganda or world headlines',
    usage: '.news           → world news\n.news uganda    → Uganda news',

    async handler(sock, message, args, context) {
        const { chatId } = context;
        const region = args[0]?.toLowerCase();
        const isUganda = !region || region === 'uganda' || region === 'ug';

        await sock.sendMessage(chatId, {
            text: isUganda ? '📰 Fetching latest Uganda news...' : '📰 Fetching latest world news...'
        }, { quoted: message });

        const primary  = isUganda ? UGANDA_FEEDS : GLOBAL_FEEDS;
        const fallback = isUganda ? GLOBAL_FEEDS  : UGANDA_FEEDS;

        let result = await fetchFeeds(primary);
        if (!result) result = await fetchFeeds(fallback);

        if (!result || result.items.length === 0) {
            return sock.sendMessage(chatId, {
                text: [
                    '❌ *Could not fetch news right now.*',
                    '',
                    '_All news sources timed out or returned no headlines._',
                    '_Please try again in a few seconds._'
                ].join('\n')
            }, { quoted: message });
        }

        const now = new Date().toLocaleString('en-GB', {
            day: '2-digit', month: 'short', year: 'numeric',
            hour: '2-digit', minute: '2-digit',
            timeZone: 'Africa/Kampala'
        });

        const regionLabel = isUganda ? '🇺🇬 Uganda' : '🌍 World';
        let text = `📰 *${regionLabel} News — ${result.sourceName}*\n`;
        text += `🕐 _${now} (EAT)_\n`;
        text += `━━━━━━━━━━━━━━━━━━━\n\n`;
        result.items.forEach((a, i) => {
            text += `*${i + 1}.* ${a.title}\n`;
            if (a.desc) text += `_${a.desc}${a.desc.length >= 130 ? '…' : ''}_\n`;
            if (a.link) text += `🔗 ${a.link}\n`;
            text += '\n';
        });
        text += `━━━━━━━━━━━━━━━━━━━\n`;
        text += `_Source: ${result.sourceName}_\n`;
        text += `_Type *.news* for world news or *.news uganda* for Uganda news_`;

        await sock.sendMessage(chatId, { text }, { quoted: message });
    }
};
