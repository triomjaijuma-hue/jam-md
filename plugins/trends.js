// Google Trends daily trending searches via public RSS — no API key needed
const COUNTRY_CODES = {
    'argentina': 'AR', 'australia': 'AU', 'austria': 'AT', 'belgium': 'BE',
    'brazil': 'BR', 'canada': 'CA', 'chile': 'CL', 'colombia': 'CO',
    'czechia': 'CZ', 'denmark': 'DK', 'egypt': 'EG', 'finland': 'FI',
    'france': 'FR', 'germany': 'DE', 'greece': 'GR', 'hongkong': 'HK',
    'hong kong': 'HK', 'hungary': 'HU', 'india': 'IN', 'indonesia': 'ID',
    'ireland': 'IE', 'israel': 'IL', 'italy': 'IT', 'japan': 'JP',
    'kenya': 'KE', 'malaysia': 'MY', 'mexico': 'MX', 'netherlands': 'NL',
    'newzealand': 'NZ', 'new zealand': 'NZ', 'nigeria': 'NG', 'norway': 'NO',
    'pakistan': 'PK', 'peru': 'PE', 'philippines': 'PH', 'poland': 'PL',
    'portugal': 'PT', 'romania': 'RO', 'russia': 'RU', 'saudi arabia': 'SA',
    'saudiarabia': 'SA', 'singapore': 'SG', 'southafrica': 'ZA',
    'south africa': 'ZA', 'southkorea': 'KR', 'south korea': 'KR',
    'spain': 'ES', 'sweden': 'SE', 'switzerland': 'CH', 'taiwan': 'TW',
    'thailand': 'TH', 'turkey': 'TR', 'ukraine': 'UA', 'uk': 'GB',
    'unitedkingdom': 'GB', 'united kingdom': 'GB', 'usa': 'US',
    'united states': 'US', 'unitedstates': 'US', 'vietnam': 'VN',
    'zimbabwe': 'ZW', 'ghana': 'GH', 'ethiopia': 'ET', 'tanzania': 'TZ',
    'uganda': 'UG', 'cameroon': 'CM', 'senegal': 'SN',
};

export default {
    command: 'trends',
    aliases: ['trend', 'trending'],
    category: 'info',
    description: 'Get Google daily trending searches for a country',
    usage: '.trends <country-name>',
    async handler(sock, message, args, context) {
        const chatId = context.chatId || message.key.remoteJid;
        const country = args.join(' ').trim();
        if (!country) {
            return await sock.sendMessage(chatId, {
                text: '*Please provide a country name.*\nExample: .trends Nigeria\n.trends Pakistan\n.trends USA'
            }, { quoted: message });
        }
        const geo = COUNTRY_CODES[country.toLowerCase()];
        if (!geo) {
            const available = [...new Set(Object.values(COUNTRY_CODES))].sort().join(', ');
            return await sock.sendMessage(chatId, {
                text: `❌ Country *"${country}"* not found.\n\nTry names like: Nigeria, Pakistan, USA, India, Kenya, UK, Indonesia, etc.`
            }, { quoted: message });
        }
        try {
            await sock.sendMessage(chatId, { text: `🔎 Fetching trends for *${country.toUpperCase()}*...` }, { quoted: message });
            const res = await fetch(
                `https://trends.google.com/trends/trendingsearches/daily/rss?geo=${geo}`,
                { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; JAM-MD-Bot/1.0)' } }
            );
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const xml = await res.text();
            // Extract <title> tags (skip the first one which is the feed title)
            const titles = [...xml.matchAll(/<title><!\[CDATA\[(.+?)\]\]><\/title>/g)].map(m => m[1]);
            const approxTitles = titles.length ? titles : [...xml.matchAll(/<title>([^<]+)<\/title>/g)].map(m => m[1]).slice(1);
            if (!approxTitles.length) throw new Error('No trending data found in feed');
            const top20 = approxTitles.slice(0, 20);
            let output = `📈 *Google Trending Searches*\n*Country:* ${country.toUpperCase()} 🌍\n\n`;
            top20.forEach((t, i) => { output += `${i + 1}. ${t}\n`; });
            output += `\n_Updated daily by Google Trends_`;
            await sock.sendMessage(chatId, { text: output }, { quoted: message });
        } catch (error) {
            console.error('Trends error:', error);
            await sock.sendMessage(chatId, {
                text: `❌ Failed to fetch trends for ${country}.\n\nError: ${error.message}`
            }, { quoted: message });
        }
    }
};
