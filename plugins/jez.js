import fetch from 'node-fetch';

const API_BASE = process.env.AIRTEL_CONFIG_URL
    ? process.env.AIRTEL_CONFIG_URL.replace('/api/airtel', '')
    : 'https://b7a31e27-b2db-4aba-baf4-c04898f6ecb4-00-125u8d6u0oodo.sisko.replit.dev';

export default {
    command: 'jez',
    aliases: ['v2ray', 'airtelv2', 'configs', 'freeconfigs'],
    category: 'tools',
    description: 'Get fresh daily free v2ray configs for JZ PRO VPN (Airtel Uganda)',
    usage: '.jez',
    async handler(sock, message, args, context) {
        const chatId = context.chatId || message.key.remoteJid;

        try {
            await sock.sendMessage(chatId, {
                text: '🔄 *Fetching fresh v2ray configs...*\nGrabbing today\'s working configs, please wait.'
            }, { quoted: message });

            const res = await fetch(`${API_BASE}/api/jez`, {
                headers: { 'User-Agent': 'JAM-MD-Bot/1.0' },
                timeout: 25000
            });

            if (!res.ok) {
                return await sock.sendMessage(chatId, {
                    text: `❌ *Failed to get configs (${res.status})*\n\nTry again in a few minutes.`
                }, { quoted: message });
            }

            const data = await res.json();

            if (!data.sample || data.sample.length === 0) {
                return await sock.sendMessage(chatId, {
                    text: '⚠️ *No configs available right now.*\n\nServers may be updating. Try again in 10 minutes.'
                }, { quoted: message });
            }

            const configs = data.sample;
            const updatedAt = data.updated
                ? new Date(data.updated).toLocaleString('en-UG', { timeZone: 'Africa/Kampala' })
                : 'Just now';

            // Send as a text file so it's easy to copy from
            const fileContent = configs.join('\n');
            const fileBuffer = Buffer.from(fileContent, 'utf-8');

            const caption =
                `📡 *Fresh v2ray Configs*\n\n` +
                `✅ *${configs.length} configs from ${data.count}+ available*\n` +
                `🕒 *Updated:* ${updatedAt}\n\n` +
                `*How to use with JZ PRO VPN:*\n` +
                `1️⃣ Open the file & copy any config line\n` +
                `2️⃣ Open JZ PRO VPN\n` +
                `3️⃣ Tap *Custom Setup* → *V2Ray Tunnel*\n` +
                `4️⃣ Paste the config line in the box\n` +
                `5️⃣ Tap *SAVE* → *START*\n\n` +
                `💡 *If one doesn't work, try the next line*\n` +
                `🌐 Network: Airtel Uganda\n\n` +
                `_Powered by ${context?.config?.botName || 'JAM-MD'}_`;

            await sock.sendMessage(chatId, {
                document: fileBuffer,
                mimetype: 'text/plain',
                fileName: `v2ray_configs_${new Date().toISOString().slice(0, 10)}.txt`,
                caption
            }, { quoted: message });

            // Also send first 3 configs inline for quick copy-paste
            const preview =
                `📋 *Quick Copy (first 3 configs):*\n\n` +
                configs.slice(0, 3).map((c, i) => `*${i + 1}.* \`${c.slice(0, 80)}...\``).join('\n\n');

            await sock.sendMessage(chatId, { text: preview }, { quoted: message });

        } catch (error) {
            console.error('[Jez Plugin Error]', error);
            await sock.sendMessage(chatId, {
                text: `❌ *Error fetching configs*\n\n${error.message || 'Unknown error'}\n\nContact the bot owner.`
            }, { quoted: message });
        }
    }
};
