// plugins/ugtrends.js — Uganda APN tricks, VPN configs, cheap bundles & deals
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
        { url: 'https://www.techjaja.com/?s=mtn+airtel+trick&feed=rss2', tag: '🔐' },
        { url: 'https://dignited.com/?s=free+internet+uganda&feed=rss2', tag: '💡' },
    ];
    const results = [];
    for (const feed of feeds) {
        try {
            const xml = await fetchUrl(feed.url);
            const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 4);
            for (const [, block] of items) {
                const title = block.match(/<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i)?.[1]?.trim().replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>') || '';
                const link = block.match(/<link>(.*?)<\/link>/i)?.[1]?.trim() || '';
                if (title && link && !results.find(r => r.link === link)) {
                    results.push({ title, link, tag: feed.tag });
                }
            }
        } catch {}
    }
    return results.slice(0, 10);
}

const ALL_APN = `📡 *Uganda APN Settings & Tricks*

━━━━━━ 🟡 *MTN UGANDA* ━━━━━━

✅ *Standard APN:*
• APN: internet
• Username/Password: (leave blank)
• APN Type: default,supl,mms

🔥 *Trick 1 — Faster Speed:*
• APN: mtnweb  |  Port: 8080
• DNS 1: 8.8.8.8  |  DNS 2: 8.8.4.4

🔥 *Trick 2 — Bypass Throttle:*
• APN: internet.mtn.co.ug
• DNS 1: 1.1.1.1  |  DNS 2: 1.0.0.1

🔥 *Trick 3 — Low Ping Gaming:*
• APN: mtnmobile  |  Bearer: LTE only
• DNS 1: 8.8.8.8  |  DNS 2: 4.4.4.4
• APN Protocol: IPv4/IPv6

📊 Check MTN data balance → Dial *165#

━━━━━━ 🔴 *AIRTEL UGANDA* ━━━━━━

✅ *Standard APN:*
• APN: internet
• Username/Password: (leave blank)
• APN Type: default,supl,mms

🔥 *Trick 1 — Faster Speed:*
• APN: airtelweb  |  Port: 8080
• DNS 1: 8.8.8.8  |  DNS 2: 8.8.4.4

🔥 *Trick 2 — Bypass Throttle:*
• APN: airtelmada
• DNS 1: 1.1.1.1  |  DNS 2: 1.0.0.1

🔥 *Trick 3 — Midnight Free Data:*
• APN: internet  |  Proxy: 197.157.161.10
• Port: 8080  |  DNS: 8.8.8.8
• Active: 12am – 5am daily

📊 Check Airtel data balance → Dial *185#

━━━━━━ 💡 *Tips (Both Networks)* ━━━━━━
• Restart phone after changing APN
• Toggle airplane mode ON then OFF
• Set Bearer to LTE for fastest 4G speeds`;

const OTHER_TRICKS = `🛠️ *Other Uganda Internet Tricks*

━━━ 📶 *Signal & Speed Tricks* ━━━
• Force 4G only: Settings → Mobile Networks → Preferred → LTE only
• Band locking: Use NetMonster or Network Signal Guru app
• Best MTN 4G bands in Uganda: B3, B7, B20
• Best Airtel 4G bands in Uganda: B3, B28

━━━ 🌐 *DNS Tricks (Faster Browsing)* ━━━
• Cloudflare: 1.1.1.1 and 1.0.0.1 (fastest)
• Google: 8.8.8.8 and 8.8.4.4
• On Android: Settings → WiFi → Private DNS → one.one.one.one
• Works on any network — faster page loads

━━━ 📱 *App Data Saver Tricks* ━━━
• Opera Mini: turn on extreme savings mode (saves 90%)
• Brave Browser: built-in VPN + ad block = faster + saves data
• YouTube: long press video → Quality → 144p saves 80% data
• WhatsApp: Settings → Storage → auto-download off on mobile data
• Telegram: Settings → Data & Storage → reduce to minimum

━━━ 💳 *SIM Card Tricks* ━━━
• New SIM = free data promos (MTN gives 1GB to new SIMs)
• Dormant SIM reactivation = personal offers (leave SIM 2+ months)
• MTN birthday offer → dial *165*2# on your birthday
• Airtel loyalty offer → dial *174*7# daily to check freebies

━━━ 📡 *Free Internet Apps (No APN Needed)* ━━━
1. Psiphon Pro — auto-finds working servers
2. Lantern — peer-to-peer free browsing
3. Ultrasurf — simple, no config needed
4. Tor Browser — anonymous + bypasses throttling
5. KPN Tunnel Rev — HTTP tunnel, easy setup
6. Ha Tunnel Plus — best for Uganda configs`;

const MTN_BUNDLES = `📶 *MTN Uganda Data Bundles*

💰 *Daily (Cheapest):*
• 250MB — UGX 500 → Dial *165*2*6*1#
• 500MB — UGX 999 → Dial *165*2*6*2#
• 1GB   — UGX 1,500 → Dial *165*2*6*3#

💰 *Weekly:*
• 1.5GB — UGX 3,000 → Dial *165*2*6*4#
• 3GB   — UGX 5,000 → Dial *165*2*6*5#

💰 *Monthly:*
• 5GB   — UGX 10,000 → Dial *165*2*6*6#
• 10GB  — UGX 18,000 → Dial *165*2*6*7#
• 20GB  — UGX 30,000 → Dial *165*2*6*8#

🎁 Personal Offers → Dial *165*2#
🌙 Night Bundles (12am-6am) → Dial *165*2*9#
🆘 Borrow data → Dial *165*6#`;

const AIRTEL_BUNDLES = `📶 *Airtel Uganda Data Bundles*

💰 *Daily (Cheapest):*
• 50MB  — UGX 200 → Dial *185*2*1#
• 150MB — UGX 500 → Dial *185*2*2#
• 500MB — UGX 1,000 → Dial *185*2*3#
• 1GB   — UGX 2,000 → Dial *185*2*4#

💰 *Weekly:*
• 2GB — UGX 4,000 → Dial *185*2*5#
• 4GB — UGX 7,000 → Dial *185*2*6#

💰 *Monthly:*
• 5GB  — UGX 10,000 → Dial *185*2*7#
• 10GB — UGX 17,000 → Dial *185*2*8#
• 20GB — UGX 27,000 → Dial *185*2*9#

🎁 Personal Offers → Dial *174*7#
🌙 Midnight (12am-5am) → Dial *174*7#
🆘 Borrow data → Dial *185*5#`;

const MINUTES_BUNDLES = `📞 *Uganda Call Bundles*

🟡 *MTN Uganda:*
• 10 mins  — UGX 500 → Dial *165*3*1#
• 30 mins  — UGX 1,000 → Dial *165*3*2#
• 60 mins  — UGX 2,000 → Dial *165*3*3#
• 100 mins — UGX 3,000 → Dial *165*3*4#
• 300 mins — UGX 8,000 → Dial *165*3*5#
• Borrow airtime → Dial *165*6#

🔴 *Airtel Uganda:*
• 15 mins  — UGX 500 → Dial *185*3*1#
• 30 mins  — UGX 1,000 → Dial *185*3*2#
• 60 mins  — UGX 1,500 → Dial *185*3*3#
• 200 mins — UGX 5,000 → Dial *185*3*5#
• Borrow airtime → Dial *185*5#`;

const MENU = `🇺🇬 *Uganda Internet Tricks & Deals*
━━━━━━━━━━━━━━━━━━━━━

📡 *.tricks apn*
   APN settings tricks for MTN & Airtel
   (faster speed, bypass throttle, gaming)

🟡 *.tricks mtn*
   MTN APN tricks + cheapest bundle prices

🔴 *.tricks airtel*
   Airtel APN tricks + cheapest bundle prices

📊 *.tricks data*
   All data bundle prices (both networks)

📞 *.tricks minutes*
   Cheapest call bundles + USSD codes

🛠️ *.tricks other*
   Signal, DNS, SIM tricks & free internet apps

📰 *.tricks news*
   Latest Uganda internet tricks (live fetch)`;

export default {
    command: 'tricks',
    aliases: ['ugdeals', 'mtndeals', 'airteldeals', 'vpnug', 'freeug', 'ugbundles', 'apn', 'ugapn'],
    category: 'tools',
    description: 'Uganda APN tricks, VPN configs, cheap bundles, data & call deals',
    usage: '.tricks [apn|mtn|airtel|data|minutes|other|news]',
    async handler(sock, message, args, context) {
        const { chatId } = context;
        const sub = (args[0] || '').toLowerCase();

        if (sub === 'apn' || sub === 'apns') {
            return sock.sendMessage(chatId, { text: ALL_APN }, { quoted: message });
        }
        if (sub === 'mtn') {
            return sock.sendMessage(chatId, { text: MTN_BUNDLES }, { quoted: message });
        }
        if (sub === 'airtel') {
            return sock.sendMessage(chatId, { text: AIRTEL_BUNDLES }, { quoted: message });
        }
        if (sub === 'data') {
            await sock.sendMessage(chatId, { text: MTN_BUNDLES }, { quoted: message });
            return sock.sendMessage(chatId, { text: AIRTEL_BUNDLES }, { quoted: message });
        }
        if (sub === 'minutes' || sub === 'calls' || sub === 'mins') {
            return sock.sendMessage(chatId, { text: MINUTES_BUNDLES }, { quoted: message });
        }
        if (sub === 'other' || sub === 'more' || sub === 'tips') {
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
