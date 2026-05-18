// plugins/ugtrends.js — Uganda internet tricks, real APN settings & deals
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
        { url: 'https://www.techjaja.com/?s=free+internet+uganda&feed=rss2', tag: '🌐' },
        { url: 'https://www.techjaja.com/?s=unlimited+internet+uganda&feed=rss2', tag: '♾️' },
        { url: 'https://www.techjaja.com/?s=apn+uganda&feed=rss2', tag: '📡' },
        { url: 'https://www.techjaja.com/?s=mtn+airtel+trick+uganda&feed=rss2', tag: '🔐' },
        { url: 'https://dignited.com/?s=free+internet+uganda&feed=rss2', tag: '💡' },
    ];
    const results = [];
    for (const feed of feeds) {
        try {
            const xml = await fetchUrl(feed.url);
            const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 4);
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
    return results.slice(0, 10);
}

const APN_SETTINGS = `📡 *Uganda APN Settings*

━━━━━━ 🟡 MTN UGANDA ━━━━━━

✅ *Official APN:*
• Name: MTN Uganda
• APN: internet
• Username: (blank)
• Password: (blank)
• APN Type: default,supl

📶 *MMS Settings:*
• MMSC: http://mmsc.mtn.co.ug
• MMS Proxy: 10.0.0.138
• MMS Port: 9201

⚡ *Speed Trick — Change DNS:*
• Keep APN as: internet
• DNS 1: 1.1.1.1 (Cloudflare)
• DNS 2: 8.8.8.8 (Google)
• This gives faster browsing on same bundle

🎮 *Gaming/Low Ping Trick:*
• APN: internet
• Bearer: LTE (force 4G only)
• APN Protocol: IPv4 only
• DNS 1: 8.8.8.8
• DNS 2: 8.8.4.4

📊 Buy bundles → Dial *165#
📊 Check balance → Dial *165#

━━━━━━ 🔴 AIRTEL UGANDA ━━━━━━

✅ *Official APN:*
• Name: Airtel Uganda
• APN: internet
• Username: (blank)
• Password: (blank)
• APN Type: default,supl

📶 *MMS Settings:*
• MMSC: http://100.1.201.171:10021/mmsc
• MMS Proxy: 100.1.201.172
• MMS Port: 8799

⚡ *Speed Trick — Change DNS:*
• Keep APN as: internet
• DNS 1: 1.1.1.1 (Cloudflare)
• DNS 2: 8.8.8.8 (Google)
• Noticeably faster page loads

🌙 *Midnight Free Data Trick:*
• APN: internet
• Proxy: 197.157.161.10
• Port: 8080
• Active: 12am – 5am (check if still works)

📊 Buy bundles → Dial *185#
📊 Check balance → Dial *185#

━━━━━━ 💡 Tips ━━━━━━
• After changing APN → restart phone or toggle airplane mode
• Set network to LTE/4G only for faster speeds
• Settings → Mobile Networks → Network Mode → LTE only`;

const MTN_INFO = `🟡 *MTN Uganda*

📡 *APN:* internet | DNS: 1.1.1.1 / 8.8.8.8

📶 *Data Bundles:*
Dial *165# → Select Data → Choose bundle
• Daily bundles from ~UGX 500
• Weekly bundles from ~UGX 3,000
• Monthly bundles from ~UGX 10,000

🎁 *Personal/Special Offers:*
Dial *165# → My Offers (often cheaper than standard)

🌙 *Night Bundles (12am–6am):*
Dial *165# → Data → Night bundles

⏰ *Midnight Promo:*
Some SIMs get free midnight data — dial *165# after midnight to check

📞 *Call Bundles:*
Dial *165# → Voice → Choose bundle

🆘 *Borrow Data/Airtime:*
Dial *165# → Borrow

📊 *Check Balance:* Dial *165#
📞 *Customer Care:* 100 (free call)`;

const AIRTEL_INFO = `🔴 *Airtel Uganda*

📡 *APN:* internet | DNS: 1.1.1.1 / 8.8.8.8

📶 *Data Bundles:*
Dial *185# → Select Data → Choose bundle
• Daily bundles from ~UGX 200
• Weekly bundles from ~UGX 4,000
• Monthly bundles from ~UGX 10,000

🎁 *Personal/Special Offers:*
Dial *185# → My Offers (check daily — resets)

🌙 *Midnight Free Data (12am–5am):*
Some SIMs get free midnight data automatically
Dial *185# after midnight to check your offers

📞 *Call Bundles:*
Dial *185# → Voice → Choose bundle

🆘 *Borrow Data/Airtime:*
Dial *185# → Borrow

📊 *Check Balance:* Dial *185#
📞 *Customer Care:* 100 (free call)

💡 *Tip:* Dormant Airtel SIMs (unused 2+ months)
often get big welcome-back data offers when reactivated`;

const OTHER_TRICKS = `🛠️ *Uganda Internet Tricks*

━━━ 📶 Force Faster Speed ━━━
• Go to Settings → Mobile Networks → Network Mode
• Select LTE/4G only (not 3G/2G/Auto)
• This alone makes a huge speed difference
• Best MTN 4G bands: B3, B7, B20
• Best Airtel 4G bands: B3, B28
• Use app *NetMonster* to check your band

━━━ 🌐 DNS Trick (Works on Any Network) ━━━
• Android: Settings → Private DNS → one.one.one.one
• Or set in APN: DNS 1.1.1.1, DNS 2: 8.8.8.8
• Cloudflare DNS is fastest — less lag, faster loading

━━━ 💳 SIM Tricks ━━━
• New SIM: MTN gives welcome data (1GB+) to new activations
• Old unused SIM: Reactivate after 2+ months → get comeback offers
• Check *personal offers* daily on both MTN & Airtel — they change
• MTN: Dial *165# → My Offers
• Airtel: Dial *185# → My Offers

━━━ 📱 Save Data (App Tricks) ━━━
• *Opera Mini* → Settings → Data Savings → Extreme (saves 90%)
• *Brave Browser* → built-in ad blocker saves lots of data
• *YouTube* → tap video → Quality → 144p or 240p
• *WhatsApp* → Settings → Storage → disable auto-download on mobile data
• *Chrome* → turn on Lite Mode in settings

━━━ 📡 Free Internet Apps ━━━
These work without buying data on some networks:
1. *Psiphon Pro* — tries many servers automatically
2. *Ha Tunnel Plus* — best for Uganda configs
3. *HTTP Custom* — for APN/VPN configs
4. *KPN Tunnel Rev* — easy HTTP tunnel
5. *Tor Browser* — slow but free and anonymous
6. *Ultrasurf* — simple, no setup needed`;

const MENU = `🇺🇬 *Uganda Internet Tricks & Deals*
━━━━━━━━━━━━━━━━━━━━━

📡 *.tricks apn*
   Real APN settings for MTN & Airtel
   + DNS tricks & speed tips

🟡 *.tricks mtn*
   MTN Uganda bundles & useful codes

🔴 *.tricks airtel*
   Airtel Uganda bundles & useful codes

🛠️ *.tricks other*
   Force 4G, DNS tricks, SIM tricks,
   data saving apps, free internet apps

📰 *.tricks news*
   Latest Uganda internet tricks (live)`;

export default {
    command: 'tricks',
    aliases: ['ugdeals', 'mtndeals', 'airteldeals', 'ugapn', 'apntricks', 'ugbundles'],
    category: 'tools',
    description: 'Uganda real APN settings, internet tricks, bundles & deals for MTN and Airtel',
    usage: '.tricks [apn|mtn|airtel|other|news]',
    async handler(sock, message, args, context) {
        const { chatId } = context;
        const sub = (args[0] || '').toLowerCase();

        if (sub === 'apn' || sub === 'apns') {
            return sock.sendMessage(chatId, { text: APN_SETTINGS }, { quoted: message });
        }
        if (sub === 'mtn') {
            return sock.sendMessage(chatId, { text: MTN_INFO }, { quoted: message });
        }
        if (sub === 'airtel') {
            return sock.sendMessage(chatId, { text: AIRTEL_INFO }, { quoted: message });
        }
        if (sub === 'other' || sub === 'more' || sub === 'tips' || sub === 'data' || sub === 'minutes') {
            return sock.sendMessage(chatId, { text: OTHER_TRICKS }, { quoted: message });
        }
        if (sub === 'news' || sub === 'latest') {
            await sock.sendMessage(chatId, { text: '🔍 Fetching latest Uganda internet tricks & news...' }, { quoted: message });
            try {
                const articles = await fetchLatestTricks();
                if (!articles.length) {
                    return sock.sendMessage(chatId, { text: '❌ Could not fetch news right now. Try again later.' }, { quoted: message });
                }
                const text = '📰 *Latest Uganda Internet Tricks & News*\n\n' +
                    articles.map(a => `${a.tag} *${a.title}*\n🔗 ${a.link}`).join('\n\n');
                return sock.sendMessage(chatId, { text }, { quoted: message });
            } catch {
                return sock.sendMessage(chatId, { text: '❌ Failed to fetch news.' }, { quoted: message });
            }
        }

        return sock.sendMessage(chatId, { text: MENU }, { quoted: message });
    }
};
