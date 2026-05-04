const FEEDS = [
    { name: 'BBC News', url: 'https://feeds.bbci.co.uk/news/rss.xml' },
    { name: 'Reuters',  url: 'https://feeds.reuters.com/reuters/topNews' },
    { name: 'AP News',  url: 'https://rsshub.app/apnews/topics/ap-top-news' }
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

export default {
    command: 'news',
    aliases: ['headlines', 'latestnews', 'breakingnews'],
    category: 'info',
    description: 'Get the latest top 5 news headlines',
    usage: '.news',
    async handler(sock, message, args, context) {
        const { chatId } = context;
        await sock.sendMessage(chatId, { text: '📰 Fetching latest news...' }, { quoted: message });

        let result = null;
        for (const feed of FEEDS) {
            try {
                const res = await fetch(feed.url, {
                    headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/rss+xml, application/xml, text/xml' },
                    signal: AbortSignal.timeout(10000)
                });
                if (!res.ok) continue;
                const xml = await res.text();
                const parsed = parseRss(xml, feed.name);
                if (parsed.items.length >= 3) { result = parsed; break; }
            } catch { continue; }
        }

        if (!result || result.items.length === 0) {
            return sock.sendMessage(chatId, {
                text: '❌ Could not fetch news right now. Please try again later.'
            }, { quoted: message });
        }

        const now = new Date().toLocaleString('en-US', {
            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
        });
        let text = `📰 *Latest News — ${result.sourceName}*\n`;
        text += `🕐 _Updated: ${now}_\n`;
        text += `━━━━━━━━━━━━━━━━━━━\n\n`;
        result.items.forEach((a, i) => {
            text += `*${i + 1}.* ${a.title}\n`;
            if (a.desc) text += `_${a.desc}${a.desc.length >= 120 ? '...' : ''}_\n`;
            text += '\n';
        });
        text += `━━━━━━━━━━━━━━━━━━━\n`;
        text += `_Source: ${result.sourceName}_`;

        await sock.sendMessage(chatId, { text }, { quoted: message });
    }
};
