// plugins/ugtrends.js — Confirmed Uganda internet tricks (no fake USSD, no guesswork)
import https from 'https';

function fetchUrl(url) {
    return new Promise((resolve, reject) => {
        const req = https.get(url, { headers: { 'User-Agent': 'JAM-MD/1.0' }, timeout: 12000 }, res => {
            let d = '';
            res.on('data', c => d += c);
            res.on('end', () => resolve(d));
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    });
}

async function fetchLatestTricks() {
    const feeds = [
        { url: 'https://www.techjaja.com/?s=free+internet+trick+uganda&feed=rss2', tag: '🌐' },
        { url: 'https://www.techjaja.com/?s=mtn+airtel+uganda+internet&feed=rss2', tag: '🔐' },
        { url: 'https://dignited.com/?s=free+internet+uganda&feed=rss2', tag: '💡' },
        { url: 'https://dignited.com/?s=mtn+airtel+bundles+uganda&feed=rss2', tag: '📶' },
    ];
    const results = [];
    for (const feed of feeds) {
        try {
            const xml = await fetchUrl(feed.url);
            const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 5);
            for (const [, block] of items) {
                const title = block.match(/<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i)?.[1]
                    ?.trim().replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>') || '';
                const link = block.match(/<link>(.*?)<\/link>/i)?.[1]?.trim() || '';
                if (title && link && !results.find(r => r.link === link)) {
                    results.push({ title, link, tag: feed.tag });
                }
            }
        } catch {}
    }
    return results.slice(0, 8);
}

const TRICKS_TEXT = `🇺🇬 *Confirmed Uganda Internet Tricks*
━━━━━━━━━━━━━━━━━━━━━

📶 *(1) MTN Uganda — Bundles & Codes*
• Dial *165# → browse all bundle options
• Personal offers (often cheaper): *165# → My Offers
• Night bundles (12am–6am): *165# → Data → Night
• Borrow data when empty: *165# → Borrow
• Check balance & expiry: *165#
• Customer care (free): 100

🔴 *(2) Airtel Uganda — Bundles & Codes*
• Dial *185# → browse all bundle options
• Personal offers (check daily): *185# → My Offers
• Midnight promo (12am–5am): some SIMs get free data automatically — check *185# after midnight
• Borrow data when empty: *185# → Borrow
• Check balance & expiry: *185#
• Customer care (free): 100

📡 *(3) Real APN Settings*
Both MTN & Airtel official APN is just:
• APN: *internet*
• Username & Password: leave blank
• APN Type: default,supl,mms
• MCC: 641 | MNC: 10 (MTN) or 14 (Airtel)
If internet is not working → reset APN to these defaults

⚡ *(4) DNS Trick — Faster Browsing (Confirmed)*
Works on MTN, Airtel & any WiFi — no extra cost:
• Android: Settings → Private DNS → type: *one.one.one.one*
• Or in APN settings:
  DNS 1: 1.1.1.1 (Cloudflare — fastest)
  DNS 2: 8.8.8.8 (Google — backup)
• Makes pages load noticeably faster

📶 *(5) Force 4G Only — Faster Speed*
• Settings → Mobile Networks → Preferred Network → LTE only
• If not available: dial *#*#4636#*#* → Phone Info → LTE only
• Stops your phone dropping to slow 3G/2G
• Best MTN 4G bands in Uganda: B3, B7, B20
• Best Airtel 4G bands in Uganda: B3, B28
• Use app *NetMonster* (free) to see your band

💳 *(6) SIM Offer Tricks (Confirmed)*
• New Airtel SIM → you get welcome data on first activation
• Dormant SIM trick: leave a SIM unused for 30–60 days then reactivate → both MTN & Airtel send personal comeback offers
• Check your personal offers every day — they reset and change
  MTN: *165# → My Offers
  Airtel: *185# → My Offers

📱 *(7) Save Mobile Data — Confirmed Methods*
• *Opera Mini*: Menu → Settings → Data Savings → High (compresses pages 70–90%)
• *Brave Browser*: free built-in ad blocker stops data-wasting ads
• *YouTube*: hold any video → Quality → 144p (saves 80%+ data)
• *WhatsApp*: Settings → Storage & Data → disable auto-download on mobile data
• *Chrome*: Settings → Lite Mode → ON
• *Telegram*: Settings → Data & Storage → set all to WiFi only

🌐 *(8) Free Internet Apps (Tested in Uganda)*
These use VPN/tunnel to browse without paying:
• *Psiphon Pro* — most reliable, auto-switches servers
• *Ha Tunnel Plus* — popular in Uganda, needs a config file
  (search "Ha Tunnel Plus Uganda MTN config 2024" on YouTube)
• *HTTP Injector* — advanced, needs payload config
• *KPN Tunnel Rev* — simple to set up
• *Tor Browser* — slow but completely free, no config

💡 *(9) Quick Tips*
• After changing APN → toggle airplane mode ON then OFF
• If data stops working → airplane mode ON/OFF usually fixes it
• Restart phone fully after changing APN settings
• Set Bearer to LTE for fastest speeds in APN settings

━━━━━━━━━━━━━━━━━━━━━
📰 For latest tricks → *.tricks news*
(Live fetch from TechJaja & Dignited)`;

export default {
    command: 'tricks',
    aliases: ['ugdeals', 'ugapn', 'apntricks', 'ugbundles', 'uginternet', 'freeug'],
    category: 'tools',
    description: 'Confirmed Uganda internet tricks — MTN, Airtel, APN, DNS, free internet apps',
    usage: '.tricks | .tricks news',
    async handler(sock, message, args, context) {
        const { chatId } = context;
        const sub = (args[0] || '').toLowerCase();

        if (sub === 'news' || sub === 'latest') {
            await sock.sendMessage(chatId, { text: '🔍 Fetching latest Uganda internet tricks...' }, { quoted: message });
            try {
                const articles = await fetchLatestTricks();
                if (!articles.length) {
                    return sock.sendMessage(chatId, { text: '❌ No results right now. Try again later.' }, { quoted: message });
                }
                const text = '📰 *Latest Uganda Internet Tricks & News*\n\n' +
                    articles.map(a => `${a.tag} *${a.title}*\n🔗 ${a.link}`).join('\n\n');
                return sock.sendMessage(chatId, { text }, { quoted: message });
            } catch {
                return sock.sendMessage(chatId, { text: '❌ Failed to fetch news. Try again later.' }, { quoted: message });
            }
        }

        return sock.sendMessage(chatId, { text: TRICKS_TEXT }, { quoted: message });
    }
};
