import fetch from 'node-fetch';

const API_BASE = process.env.AIRTEL_CONFIG_URL
    ? process.env.AIRTEL_CONFIG_URL.replace('/api/airtel', '').replace('/api/jez', '')
    : 'https://b7a31e27-b2db-4aba-baf4-c04898f6ecb4-00-125u8d6u0oodo.sisko.replit.dev';

export default {
    command: 'jez',
    aliases: ['v2ray', 'airtelv2', 'configs', 'freeconfigs', 'airtel'],
    category: 'tools',
    description: 'Get TCP-tested v2ray configs, fastest servers first — for JZ PRO VPN on Airtel UG',
    usage: '.jez',
    async handler(sock, message, args, context) {
        const chatId = context.chatId || message.key.remoteJid;

        try {
            await sock.sendMessage(chatId, {
                text: '🔍 *Fetching tested v2ray configs...*\n\n🇺🇬 Uganda & East Africa servers prioritised.\nEvery config is TCP-checked and ranked by speed. Please wait up to 30s.'
            }, { quoted: message });

            const res = await fetch(`${API_BASE}/api/jez`, {
                headers: { 'User-Agent': 'JAM-MD-Bot/1.0' },
                timeout: 60000
            });

            if (!res.ok) {
                return await sock.sendMessage(chatId, {
                    text: `❌ *Server error (${res.status})*\n\nTry again in a few minutes.`
                }, { quoted: message });
            }

            const data = await res.json();

            if (!data.sample || data.sample.length === 0) {
                return await sock.sendMessage(chatId, {
                    text: '⚠️ *No working configs found right now.*\n\nAll tested servers appear offline. Try again in 10–15 minutes.'
                }, { quoted: message });
            }

            const configs = data.sample;
            const protocols = data.protocols || [];
            const tags = data.tags || [];
            const latencies = data.latencyMs || [];
            const updatedAt = data.updated
                ? new Date(data.updated).toLocaleString('en-UG', { timeZone: 'Africa/Kampala' })
                : 'Just now';

            const offlineNotice = data.allOffline
                ? '⚠️ *Note:* none of these passed the live check just now — sending anyway in case it was a fluke.\n\n'
                : '';

            // Build file with comments
            const fileLines = [
                '# Tested v2ray configs — JAM-MD bot',
                `# TCP-verified: ${data.count} working servers, ranked fastest first`,
                `# Sorted: Uganda/East Africa/Cloudflare, lowest latency first`,
                `# Updated: ${updatedAt}`,
                '#',
                '# HOW TO USE:',
                '# 1. Copy any line below (starting with vmess/vless/trojan/ss)',
                '# 2. Open JZ PRO VPN',
                '# 3. Tap Custom Setup > V2Ray Tunnel',
                '# 4. Paste the line > SAVE > START',
                '# 5. If one fails on Airtel UG, try the next line',
                '',
                ...configs
            ];

            const fileBuffer = Buffer.from(fileLines.join('\n'), 'utf-8');

            const topRegions = tags
                .slice(0, 3)
                .map((t, i) => {
                    if (!t) return null;
                    const ms = latencies[i];
                    return ms != null ? `• ${t} (${ms}ms)` : `• ${t}`;
                })
                .filter(Boolean)
                .join('\n') || '• Mixed regions';

            const caption =
                `📡 *Tested v2ray Configs* ✅\n\n` +
                offlineNotice +
                `🔬 *TCP-verified:* ${data.count} working servers\n` +
                `📦 *Sending:* ${configs.length} configs (fastest first)\n` +
                `🏆 *Top servers:*\n${topRegions}\n\n` +
                `*How to use with JZ PRO VPN:*\n` +
                `1️⃣ Open the .txt file\n` +
                `2️⃣ Copy any config line\n` +
                `3️⃣ Open JZ PRO VPN → *Custom Setup* → *V2Ray Tunnel*\n` +
                `4️⃣ Paste → *SAVE* → *START*\n\n` +
                `💡 First lines = fastest for Airtel UG\n` +
                `🕒 *Tested:* ${updatedAt}\n` +
                `_Powered by ${context?.config?.botName || 'JAM-MD'}_`;

            await sock.sendMessage(chatId, {
                document: fileBuffer,
                mimetype: 'text/plain',
                fileName: `jam_md_configs_${new Date().toISOString().slice(0, 10)}.txt`,
                caption
            }, { quoted: message });

            // Send each config as its own message — long-press to copy the full string
            await sock.sendMessage(chatId, {
                text: `📋 *Top 3 fastest configs — long-press each message below to copy:*`
            }, { quoted: message });

            for (let i = 0; i < Math.min(3, configs.length); i++) {
                const proto = protocols[i] ? `[${protocols[i].toUpperCase()}]` : '';
                const tag = tags[i] ? ` ${tags[i]}` : '';
                const ms = latencies[i] != null ? ` — ${latencies[i]}ms` : '';
                // Label first
                await sock.sendMessage(chatId, {
                    text: `*${i + 1}.* ${proto}${tag}${ms} ⬇️ copy message below`
                }, { quoted: message });
                // Config alone — long-press this message to copy just the vmess/vless/trojan/ss string
                await sock.sendMessage(chatId, {
                    text: configs[i]
                });
            }

        } catch (error) {
            console.error('[Jez Plugin Error]', error);
            await sock.sendMessage(chatId, {
                text: `❌ *Error fetching configs*\n\n${error.message || 'Unknown error'}\n\nContact the bot owner.`
            }, { quoted: message });
        }
    }
};
