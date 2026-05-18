// plugins/ugtrends.js — Uganda VPN tricks, unlimited internet, cheap bundles & deals
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
        { url: 'https://www.techjaja.com/?s=vpn+uganda+free&feed=rss2', tag: '🔐' },
        { url: 'https://www.techjaja.com/?s=mtn+airtel+trick&feed=rss2', tag: '📡' },
        { url: 'https://dignited.com/?s=free+internet+uganda&feed=rss2', tag: '💡' },
    ];
    const results = [];
    for (const feed of feeds) {
        try {
            const xml = await fetchUrl(feed.url);
            const items = [...xml.matchAll(/<item>([sS]*?)</item>/g)].slice(0, 4);
            for (const [, block] of items) {
                const title = block.match(/<title[^>]*>(?:<![CDATA[)?([sS]*?)(?:]]>)?</title>/i)?.[1]?.trim().replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>') || '';
                const link  = block.match(/<link>(.*?)</link>/i)?.[1]?.trim() || '';
                const date  = block.match(/<pubDate>(.*?)</pubDate>/i)?.[1]?.trim() || '';
                if (title && link && !results.find(r => r.link === link)) {
                    results.push({ title, link, date, tag: feed.tag });
                }
            }
        } catch {}
    }
    return results.slice(0, 10);
}

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

🎁 *Personal Offers* → Dial *165*2#
📊 *Check Balance* → Dial *165*5#
🌙 *Night Bundles (12am-6am)* → Dial *165*2*9#`;

const AIRTEL_BUNDLES = `📶 *Airtel Uganda Data Bundles*

💰 *Daily (Cheapest):*
• 50MB   — UGX 200 → Dial *185*2*1#
• 150MB  — UGX 500 → Dial *185*2*2#
• 500MB  — UGX 1,000 → Dial *185*2*3#
• 1GB    — UGX 2,000 → Dial *185*2*4#

💰 *Weekly:*
• 2GB    — UGX 4,000 → Dial *185*2*5#
• 4GB    — UGX 7,000 → Dial *185*2*6#

💰 *Monthly:*
• 5GB    — UGX 10,000 → Dial *185*2*7#
• 10GB   — UGX 17,000 → Dial *185*2*8#
• 20GB   — UGX 27,000 → Dial *185*2*9#

🎁 *Personal Offers* → Dial *174*7#
📊 *Check Balance* → Dial *185*7#
🌙 *Midnight (12am-5am)* → Dial *174*7#`;

const MTN_MINUTES = `📞 *MTN Uganda Call Bundles*

• 10 mins  — UGX 500 → Dial *165*3*1#
• 30 mins  — UGX 1,000 → Dial *165*3*2#
• 60 mins  — UGX 2,000 → Dial *165*3*3#
• 100 mins — UGX 3,000 → Dial *165*3*4#
• 300 mins — UGX 8,000 → Dial *165*3*5#

📲 MTN to MTN: 1 UGX/sec
📲 Off-net: 1.5 UGX/sec
🆘 Borrow airtime → Dial *165*6#`;

const AIRTEL_MINUTES = `📞 *Airtel Uganda Call Bundles*

• 15 mins  — UGX 500 → Dial *185*3*1#
• 30 mins  — UGX 1,000 → Dial *185*3*2#
• 60 mins  — UGX 1,500 → Dial *185*3*3#
• 200 mins — UGX 5,000 → Dial *185*3*5#

📲 Airtel to Airtel: 0.5 UGX/sec
📲 Off-net: 1 UGX/sec
🆘 Borrow airtime → Dial *185*5#`;

const VPN_TRICKS = `🔐 *Uganda VPN Tricks*

━━━ 🟡 *MTN Uganda* ━━━
📱 *HTTP Custom (SSL):*
• Host/SNI: web.whatsapp.com
• Port: 443
• Method: GET
• Payload: GET / HTTP/1.1[crlf]Host: web.whatsapp.com[crlf]Upgrade: websocket[crlf][crlf]

📱 *Alternative MTN:*
• Host: clients3.google.com
• Port: 443 (SSL)
• SNI: clients3.google.com

━━━ 🔴 *Airtel Uganda* ━━━
📱 *HTTP Custom (Port 80):*
• Host: 0.facebook.com
• Port: 80
• Method: GET
• Payload: GET / HTTP/1.1[crlf]Host: 0.facebook.com[crlf][crlf]

📱 *Alternative Airtel:*
• Host: mmg.whatsapp.net
• Port: 80
• Method: GET

━━━ ⚡ *Best VPN Apps* ━━━
1. HTTP Custom — best for configs
2. HTTP Injector — import .ehi files
3. Ha Tunnel Plus — easy setup
4. OpenVPN — stable .ovpn files
5. Psiphon Pro — no config needed
6. WireGuard — fastest speeds

📰 Use *.tricks unlimited* for latest unlimited tricks`;

const UNLIMITED_TRICKS = `♾️ *Unlimited Internet Tricks Uganda*

━━━ 🟡 *MTN Uganda Unlimited* ━━━

🔥 *Trick 1 — Ha Tunnel Plus:*
• Open Ha Tunnel Plus app
• Server: 41.189.0.1
• Port: 8080
• SNI/Host: web.whatsapp.com
• Works on 0 balance MTN SIM

🔥 *Trick 2 — HTTP Custom WS:*
• Protocol: WebSocket
• Server: 41.189.0.1:8080
• Bug: web.whatsapp.com
• Path: /
• Rewrite Host: web.whatsapp.com

🔥 *Trick 3 — MTN Promotional:*
• Dial *165*2# → Check personal offers
• Some SIMs get free 1-5GB promos
• Best after 3+ months inactivity

━━━ 🔴 *Airtel Uganda Unlimited* ━━━

🔥 *Trick 1 — Ha Tunnel Plus:*
• Server: 197.157.161.10
• Port: 8080
• SNI: 0.facebook.com
• Works on 0 balance Airtel SIM

🔥 *Trick 2 — HTTP Custom:*
• Protocol: HTTP
• Server: 197.157.161.10:8080
• Bug host: 0.facebook.com
• Payload: GET / HTTP/1.1[crlf]Host: 0.facebook.com[crlf][crlf]

🔥 *Trick 3 — Airtel Midnight Free:*
• Active: 12am – 5am daily
• Dial *174*7# to check if active
• No bundle needed on some SIMs

━━━ 💡 *Pro Tips* ━━━
• Always use a SIM with 0 credit to test
• If one server dies, try port 443 or 8080
• Join UG tech groups for fresh configs
• Use *.tricks news* for latest confirmed tricks`;

const SAVER_TIPS = `💡 *Uganda Internet Saver Tips*

✅ *Save Data:*
• Use WhatsApp on WiFi only
• YouTube: Set quality to 144p/240p
• Disable auto-download in WhatsApp
• Use Opera Mini (compresses 90%)
• Turn off background app refresh

✅ *Get More for Less:*
• MTN borrow data → Dial *165*6#
• Airtel borrow data → Dial *185*5#
• Check personal offers daily (they reset)
• Night bundles are CHEAPEST (12am–5am)
• Watch for Friday/weekend promos

✅ *Free WiFi (Kampala):*
• KFC, Nando's, most malls
• Garden City, Acacia Mall, Oasis Mall
• Makerere University campus
• Uganda Telecom hotspot zones`;

export default {
    command: 'tricks',
    aliases: ['ugdeals', 'mtndeals', 'airteldeals', 'vpnug', 'freeug', 'ugbundles', 'unlimited'],
    category: 'tools',
    description: 'Uganda unlimited internet tricks, VPN configs, cheap bundles & deals',
    usage: '.tricks [vpn|unlimited|mtn|airtel|minutes|tips|news]',
    async handler(sock, message, args, context) {
        const { chatId } = context;
        const sub = (args[0] || '').toLowerCase();

        if (sub === 'vpn') {
            return sock.sendMessage(chatId, { text: VPN_TRICKS }, { quoted: message });
        }
        if (sub === 'unlimited' || sub === 'free' || sub === 'u') {
            return sock.sendMessage(chatId, { text: UNLIMITED_TRICKS }, { quoted: message });
        }
        if (sub === 'mtn') {
            return sock.sendMessage(chatId, { text: MTN_BUNDLES }, { quoted: message });
        }
        if (sub === 'airtel') {
            return sock.sendMessage(chatId, { text: AIRTEL_BUNDLES }, { quoted: message });
        }
        if (sub === 'minutes' || sub === 'calls' || sub === 'mins') {
            return sock.sendMessage(chatId, { text: MTN_MINUTES + '

' + AIRTEL_MINUTES }, { quoted: message });
        }
        if (sub === 'tips' || sub === 'save') {
            return sock.sendMessage(chatId, { text: SAVER_TIPS }, { quoted: message });
        }
        if (sub === 'news' || sub === 'latest') {
            await sock.sendMessage(chatId, { text: '🔍 Fetching latest Uganda internet tricks & news...' }, { quoted: message });
            try {
                const articles = await fetchLatestTricks();
                if (!articles.length) {
                    return sock.sendMessage(chatId, { text: '❌ Could not fetch news right now. Try again later.' }, { quoted: message });
                }
                const text = '📰 *Latest Uganda Internet Tricks & News*

' +
                    articles.map((a, i) => `${a.tag} *${a.title}*
🔗 ${a.link}`).join('

');
                return sock.sendMessage(chatId, { text }, { quoted: message });
            } catch {
                return sock.sendMessage(chatId, { text: '❌ Failed to fetch news.' }, { quoted: message });
            }
        }

        // Default menu
        const menu = `🇺🇬 *Uganda Internet Tricks & Deals*
━━━━━━━━━━━━━━━━━━━━━

Choose a category:

♾️ *.tricks unlimited*
   New unlimited internet tricks (MTN & Airtel)

🔐 *.tricks vpn*
   Working VPN configs & bug hosts

🟡 *.tricks mtn*
   MTN Uganda data bundles & prices

🔴 *.tricks airtel*
   Airtel Uganda data bundles & prices

📞 *.tricks minutes*
   Cheap call bundles (MTN & Airtel)

💡 *.tricks tips*
   Data saving tips & free WiFi spots

📰 *.tricks news*
   Latest Uganda internet tricks (live fetch)`;

        await sock.sendMessage(chatId, { text: menu }, { quoted: message });
    }
};
