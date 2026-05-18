// plugins/ugtrends.js — Uganda VPN tricks, cheap bundles & deals
// Commands: .tricks  .ugdeals  .mtndeals  .airteldeals  .vpnug

import https from 'https';

function fetchUrl(url) {
    return new Promise((resolve, reject) => {
        const mod = url.startsWith('https') ? https : (await import('http')).default;
        const req = https.get(url, { headers: { 'User-Agent': 'JAM-MD/1.0' }, timeout: 10000 }, res => {
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
        'https://www.techjaja.com/?s=free+internet+uganda&feed=rss2',
        'https://www.techjaja.com/?s=vpn+uganda&feed=rss2',
        'https://www.techjaja.com/?s=mtn+airtel+uganda&feed=rss2',
    ];
    const results = [];
    for (const feed of feeds) {
        try {
            const xml = await fetchUrl(feed);
            const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 3);
            for (const [, block] of items) {
                const title = block.match(/<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i)?.[1]?.trim() || '';
                const link  = block.match(/<link>(.*?)<\/link>/i)?.[1]?.trim() || '';
                if (title && link && !results.find(r => r.link === link)) {
                    results.push({ title, link });
                }
            }
        } catch {}
    }
    return results.slice(0, 6);
}

// ── Static bundle data (updated regularly) ──────────────────────────────────
const MTN_BUNDLES = [
`📶 *MTN Uganda Data Bundles*

💰 *Cheap Daily:*
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
🌙 *Night Bundles (12am-6am)* → Dial *165*2*9#`
];

const AIRTEL_BUNDLES = [
`📶 *Airtel Uganda Data Bundles*

💰 *Cheap Daily:*
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
🌙 *Midnight (12am-5am)* → Dial *174*7#`
];

const MTN_MINUTES = `📞 *MTN Uganda Call Bundles*

• 10 mins  — UGX 500 → Dial *165*3*1#
• 30 mins  — UGX 1,000 → Dial *165*3*2#
• 60 mins  — UGX 2,000 → Dial *165*3*3#
• 100 mins — UGX 3,000 → Dial *165*3*4#
• 300 mins — UGX 8,000 → Dial *165*3*5#

📲 *On-net (MTN to MTN):* 1 UGX/sec
📲 *Off-net (MTN to other):* 1.5 UGX/sec
💬 *Missed call alert* → Dial *160#`;

const AIRTEL_MINUTES = `📞 *Airtel Uganda Call Bundles*

• 15 mins  — UGX 500 → Dial *185*3*1#
• 30 mins  — UGX 1,000 → Dial *185*3*2#
• 60 mins  — UGX 1,500 → Dial *185*3*3#
• 200 mins — UGX 5,000 → Dial *185*3*5#

📲 *Airtel to Airtel:* 0.5 UGX/sec
📲 *Off-net:* 1 UGX/sec`;

const VPN_TRICKS = `🔐 *Uganda VPN Tricks (Free Internet)*

━━━━ 🟡 *MTN Uganda* ━━━━
📱 *HTTP Custom Config:*
• Server: web.whatsapp.com
• Port: 443 (SSL)
• SNI: web.whatsapp.com
• Bug host: web.whatsapp.com
• Method: GET

📱 *HTTP Injector:*
• Payload: GET / HTTP/1.1[crlf]Host: web.whatsapp.com[crlf]Upgrade: websocket[crlf][crlf]
• Server: 41.189.0.1 (MTN Uganda)
• Port: 8080

━━━━ 🔴 *Airtel Uganda* ━━━━
📱 *HTTP Custom:*
• Server: 0.facebook.com  
• Port: 80
• Bug host: 0.facebook.com
• Method: GET

📱 *HTTP Injector:*
• Payload: GET / HTTP/1.1[crlf]Host: 0.facebook.com[crlf][crlf]
• Server: 197.157.161.10
• Port: 8080

━━━━ ⚡ *Best Free VPN Apps* ━━━━
1. *HTTP Custom* — Best for configs above
2. *HTTP Injector* — Import .ehi files
3. *OpenVPN* — For .ovpn files
4. *WireGuard* — Fastest speeds
5. *Psiphon Pro* — No config needed

⚠️ _Tricks may stop working. Join Uganda tech groups for latest configs._`;

const SAVER_TIPS = `💡 *Uganda Internet Saver Tips*

✅ *Save Data:*
• Use WhatsApp on WiFi only → Settings > Storage
• YouTube: Set quality to 144p or 240p
• Disable auto-download in WhatsApp
• Use Opera Mini browser (compresses data 90%)
• Turn off background app refresh

✅ *Get More Data for Less:*
• MTN *Borrow Data* → Dial *165*6#
• Airtel *Borrow Data* → Dial *185*5#
• Check personal offers daily — they reset
• Night bundles are CHEAPEST (12am–5am)
• Weekend promos — always check Friday

✅ *Free WiFi Spots (Kampala):*
• KFC, Nando's, most malls
• Makerere University campus
• Garden City, Acacia Mall
• Uganda Telecom WiFi zones`;

export default {
    command: 'tricks',
    aliases: ['ugdeals', 'mtndeals', 'airteldeals', 'vpnug', 'freeug', 'ugbundles'],
    category: 'tools',
    description: 'Uganda VPN tricks, cheap bundles, data & call deals for MTN and Airtel',
    usage: '.tricks [vpn|mtn|airtel|minutes|tips|news]',
    async handler(sock, message, args, context) {
        const { chatId } = context;
        const sub = (args[0] || '').toLowerCase();

        if (sub === 'vpn') {
            return sock.sendMessage(chatId, { text: VPN_TRICKS }, { quoted: message });
        }
        if (sub === 'mtn') {
            return sock.sendMessage(chatId, { text: MTN_BUNDLES[0] }, { quoted: message });
        }
        if (sub === 'airtel') {
            return sock.sendMessage(chatId, { text: AIRTEL_BUNDLES[0] }, { quoted: message });
        }
        if (sub === 'minutes' || sub === 'calls' || sub === 'mins') {
            const text = MTN_MINUTES + '\n\n' + AIRTEL_MINUTES;
            return sock.sendMessage(chatId, { text }, { quoted: message });
        }
        if (sub === 'tips' || sub === 'save') {
            return sock.sendMessage(chatId, { text: SAVER_TIPS }, { quoted: message });
        }
        if (sub === 'news' || sub === 'latest') {
            await sock.sendMessage(chatId, { text: '🔍 Fetching latest Uganda internet news...' }, { quoted: message });
            try {
                const articles = await fetchLatestTricks();
                if (!articles.length) {
                    return sock.sendMessage(chatId, { text: '❌ Could not fetch news right now. Try again later.' }, { quoted: message });
                }
                const text = '📰 *Latest Uganda Internet News & Tricks*\n\n' +
                    articles.map((a, i) => `${i + 1}. *${a.title}*\n   🔗 ${a.link}`).join('\n\n');
                return sock.sendMessage(chatId, { text }, { quoted: message });
            } catch {
                return sock.sendMessage(chatId, { text: '❌ Failed to fetch news.' }, { quoted: message });
            }
        }

        // Default — show full menu
        const menu = `🇺🇬 *Uganda Internet Tricks & Deals*
━━━━━━━━━━━━━━━━━━━━━

📡 *Available Commands:*

🔐 *.tricks vpn*
   Working VPN configs for MTN & Airtel

🟡 *.tricks mtn*
   MTN Uganda data bundles & prices

🔴 *.tricks airtel*
   Airtel Uganda data bundles & prices

📞 *.tricks minutes*
   Cheap call bundles (MTN & Airtel)

💡 *.tricks tips*
   Data saving tips & free WiFi spots

📰 *.tricks news*
   Latest Uganda internet tricks (live)`;

        await sock.sendMessage(chatId, { text: menu }, { quoted: message });
    }
};
