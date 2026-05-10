const FEEDS = {
    world: [
        { name: 'BBC World',    url: 'https://feeds.bbci.co.uk/news/world/rss.xml' },
        { name: 'Al Jazeera',   url: 'https://www.aljazeera.com/xml/rss/all.xml' },
        { name: 'CNN',          url: 'http://rss.cnn.com/rss/edition.rss' },
        { name: 'Reuters',      url: 'https://feeds.reuters.com/reuters/worldNews' },
        { name: 'AP News',      url: 'https://rsshub.app/apnews/topics/ap-top-news' },
        { name: 'Sky News',     url: 'https://feeds.skynews.com/feeds/rss/world.xml' },
    ],
    ug: [
        { name: 'New Vision',    url: 'https://www.newvision.co.ug/feed' },
        { name: 'Daily Monitor', url: 'https://www.monitor.co.ug/feed' },
        { name: 'Nile Post',     url: 'https://nilepost.co.ug/feed' },
        { name: 'Chimp Reports', url: 'https://chimpreports.com/feed/' },
        { name: 'SoftPower',     url: 'https://softpower.ug/feed/' },
    ],
    tech: [
        { name: 'TechCrunch',  url: 'https://techcrunch.com/feed/' },
        { name: 'The Verge',   url: 'https://www.theverge.com/rss/index.xml' },
        { name: 'Wired',       url: 'https://www.wired.com/feed/rss' },
        { name: 'Ars Technica', url: 'https://feeds.arstechnica.com/arstechnica/index' },
    ],
    sport: [
        { name: 'BBC Sport',   url: 'https://feeds.bbci.co.uk/sport/rss.xml' },
        { name: 'ESPN',        url: 'https://www.espn.com/espn/rss/news' },
        { name: 'Sky Sports',  url: 'https://www.skysports.com/rss/12040' },
    ],
    africa: [
        { name: 'AllAfrica',    url: 'https://allafrica.com/tools/headlines/rdf/latest/headlines.rdf' },
        { name: 'The East African', url: 'https://www.theeastafrican.co.ke/feed' },
        { name: 'Al Jazeera Africa', url: 'https://www.aljazeera.com/xml/rss/all.xml' },
    ],
};

const CATEGORY_LABELS = {
    world: '🌍 World News',
    ug: '🇺🇬 Uganda News',
    tech: '💻 Tech News',
    sport: '⚽ Sports News',
    africa: '🌍 Africa News',
};

function parseRss(xml, sourceName) {
    const items = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let m;
    while ((m = itemRegex.exec(xml)) !== null && items.length < 5) {
        const block = m[1];
        const title = (/<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/i.exec(block))?.[1]
            ?.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#\d+;/g, '').trim();
        const desc  = (/<description>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/description>/i.exec(block))?.[1]
            ?.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#\d+;/g, '').trim();
        const link  = (/<link>(.*?)<\/link>/i.exec(block))?.[1]?.trim() ||
                      (/<guid[^>]*>(https?:\/\/[^<]+)<\/guid>/i.exec(block))?.[1]?.trim();
        if (title && title.length > 5) {
            items.push({ title, desc: desc?.slice(0, 140) || '', link });
        }
    }
    // Also try <entry> format (Atom feeds)
    if (items.length === 0) {
        const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
        while ((m = entryRegex.exec(xml)) !== null && items.length < 5) {
            const block = m[1];
            const title = (/<title[^>]*>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/i.exec(block))?.[1]
                ?.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').trim();
            const link  = (/<link[^>]*href="([^"]+)"/i.exec(block))?.[1];
            const desc  = (/<summary[^>]*>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/summary>/i.exec(block))?.[1]
                ?.replace(/<[^>]+>/g, '').trim();
            if (title && title.length > 5) {
                items.push({ title, desc: desc?.slice(0, 140) || '', link });
            }
        }
    }
    return { items, sourceName };
}

async function tryFeeds(feedList) {
    for (const feed of feedList) {
        try {
            const res = await fetch(feed.url, {
                headers: { 'User-Agent': 'Mozilla/5.0 (compatible; JAM-MD/1.0)', Accept: 'application/rss+xml, application/xml, text/xml, */*' },
                signal: AbortSignal.timeout(12000)
            });
            if (!res.ok) continue;
            const xml = await res.text();
            const parsed = parseRss(xml, feed.name);
            if (parsed.items.length >= 2) return parsed;
        } catch { continue; }
    }
    return null;
}

export default {
    command: 'news',
    aliases: ['headlines', 'latestnews', 'breakingnews', 'newsfeed'],
    category: 'info',
    description: 'Get the latest news headlines by category',
    usage: '.news [world|ug|tech|sport|africa]',
    async handler(sock, message, args, context) {
        const { chatId } = context;
        const cat = (args[0] || 'world').toLowerCase();

        if (cat === 'menu' || cat === 'help' || !FEEDS[cat]) {
            const menu = Object.entries(CATEGORY_LABELS)
                .map(([k, v]) => `  • *.news ${k}* — ${v}`)
                .join('\n');
            return sock.sendMessage(chatId, {
                text: `📰 *JAM-MD News*\n\n*Available categories:*\n${menu}\n\n_Example: *.news ug* for Uganda news_`
            }, { quoted: message });
        }

        await sock.sendMessage(chatId, {
            text: `📰 Fetching ${CATEGORY_LABELS[cat]}...`
        }, { quoted: message });

        const result = await tryFeeds(FEEDS[cat]);

        if (!result || result.items.length === 0) {
            return sock.sendMessage(chatId, {
                text: `❌ Could not fetch ${CATEGORY_LABELS[cat]} right now. Try again later or use a different category.\n\n_Try: .news world | .news ug | .news tech | .news sport | .news africa_`
            }, { quoted: message });
        }

        const now = new Date().toLocaleString('en-UG', {
            timeZone: 'Africa/Kampala',
            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
        });

        let text = `${CATEGORY_LABELS[cat]}\n`;
        text += `📡 *Source:* ${result.sourceName}\n`;
        text += `🕐 _${now} EAT_\n`;
        text += `━━━━━━━━━━━━━━━━━━━\n\n`;
        result.items.forEach((a, i) => {
            text += `*${i + 1}.* ${a.title}\n`;
            if (a.desc && a.desc.length > 10) text += `_${a.desc}${a.desc.length >= 140 ? '...' : ''}_\n`;
            if (a.link) text += `🔗 ${a.link}\n`;
            text += '\n';
        });
        text += `━━━━━━━━━━━━━━━━━━━\n`;
        text += `_Use .news menu to see all categories_`;

        await sock.sendMessage(chatId, { text }, { quoted: message });
    }
};
