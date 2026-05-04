const GLOBAL_FEEDS = [
    { name: 'BBC News',  url: 'https://feeds.bbci.co.uk/news/rss.xml' },
    { name: 'Reuters',   url: 'https://feeds.reuters.com/reuters/topNews' },
    { name: 'AP News',   url: 'https://rsshub.app/apnews/topics/ap-top-news' },
];

const UGANDA_FEEDS = [
    { name: 'Daily Monitor',  url: 'https://www.monitor.co.ug/monitor/rss' },
    { name: 'New Vision',     url: 'https://www.newvision.co.ug/rss' },
    { name: 'Chimp Reports',  url: 'https://chimpreports.com/feed/' },
    { name: 'NBS Uganda',     url: 'https://nbstv.ug/feed/' },
];

function parseRss(xml, sourceName) {
    const items = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let m;
    while ((m = itemRegex.exec(xml)) !== null && items.length < 5) {
        const block = m[1];
        const title = (/<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/i.exec(block))?.[1]
            ?.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
        const desc  = (/<description>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/description>/i.exec(block))?.[1]
            ?.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
        const link  = (/<link>(.*?)<\/link>/i.exec(block))?.[1]?.trim() ||
                      (/<guid[^>]*>(https?:\/\/[^<]+)<\/guid>/i.exec(block))?.[1]?.trim();
        if (title && title.length > 3) {
            items.push({ title, desc: desc?.slice(0, 120) || '', link });
        }
    }
    return { items, sourceName };
}

async function fetchFeeds(feeds) {
    for (const feed of feeds) {
        try {
            const res = await fetch(feed.url, {
                headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/rss+xml, application/xml, text/xml' },
                signal: AbortSignal.timeout(10000)
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
    aliases: ['headlines', 'latestnews', 'breakingnews'],
    category: 'info',
    description: 'Get the latest top 5 news headlines',
    usage: '.news [uganda|ug]',
    async handler(sock, message, args, context) {
        const { chatId } = context;
        const region = args[0]?.toLowerCase();
        const isUganda = region === 'uganda' || region === 'ug';

        await sock.sendMessage(chatId, {
            text: isUganda ? '📰 Fetching latest Uganda news...' : '📰 Fetching latest news...'
        }, { quoted: message });

        // For Uganda: try Uganda feeds first, fall back to global
        // For global: try global feeds first, fall back to Uganda
        const primary   = isUganda ? UGANDA_FEEDS : GLOBAL_FEEDS;
        const fallback  = isUganda ? GLOBAL_FEEDS  : UGANDA_FEEDS;

        let result = await fetchFeeds(primary);
        if (!result) result = await fetchFeeds(fallback);

        if (!result || result.items.length === 0) {
            return sock.sendMessage(chatId, {
                text: '❌ Could not fetch news right now. Please try again later.'
            }, { quoted: message });
        }

        const now = new Date().toLocaleString('en-US', {
            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
            timeZone: 'Africa/Kampala'
        });

        const regionLabel = isUganda ? '🇺🇬 Uganda' : '🌍 World';
        let text = `📰 *${regionLabel} News — ${result.sourceName}*\n`;
        text += `🕐 _Updated: ${now} (EAT)_\n`;
        text += `━━━━━━━━━━━━━━━━━━━\n\n`;
        result.items.forEach((a, i) => {
            text += `*${i + 1}.* ${a.title}\n`;
            if (a.desc) text += `_${a.desc}${a.desc.length >= 120 ? '...' : ''}_\n`;
            text += '\n';
        });
        text += `━━━━━━━━━━━━━━━━━━━\n`;
        text += `_Source: ${result.sourceName}_\n`;
        text += `_Use *.news uganda* for Uganda news_`;

        await sock.sendMessage(chatId, { text }, { quoted: message });
    }
};
