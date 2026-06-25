import fetch from 'node-fetch';

const AIRTEL_FILE_URL = process.env.AIRTEL_CONFIG_URL || 'https://b7a31e27-b2db-4aba-baf4-c04898f6ecb4-00-125u8d6u0oodo.sisko.replit.dev/api/airtel';

export default {
    command: 'airtel',
    aliases: ['airtelconfig', 'airtelv2', 'v2airtel', 'airtelvpn'],
    category: 'tools',
    description: 'Get free Airtel Uganda v2ray config file for JZ PRO VPN',
    usage: '.airtel',
    async handler(sock, message, args, context) {
        const chatId = context.chatId || message.key.remoteJid;

        try {
            await sock.sendMessage(chatId, {
                text: '⏳ *Fetching Airtel v2ray config...*\nPlease wait a moment.'
            }, { quoted: message });

            const res = await fetch(AIRTEL_FILE_URL, {
                headers: { 'User-Agent': 'JAM-MD-Bot/1.0' },
                timeout: 20000
            });

            if (!res.ok) {
                return await sock.sendMessage(chatId, {
                    text: `❌ *Failed to get config file*\nError: ${res.status} ${res.statusText}\n\nTry again later or contact the owner.`
                }, { quoted: message });
            }

            const arrayBuffer = await res.arrayBuffer();
            const fileBuffer = Buffer.from(arrayBuffer);

            if (fileBuffer.length === 0) {
                return await sock.sendMessage(chatId, {
                    text: '⚠️ *Config file is empty.*\nContact the bot owner to add configs.'
                }, { quoted: message });
            }

            const caption =
                `📡 *Airtel Uganda v2ray Config*\n\n` +
                `✅ *Ready to use with JZ PRO VPN*\n\n` +
                `*How to use:*\n` +
                `1️⃣ Save the file below\n` +
                `2️⃣ Open *JZ PRO VPN*\n` +
                `3️⃣ Tap *Custom Setup* → *V2Ray Tunnel*\n` +
                `4️⃣ Import the .mludp file\n` +
                `5️⃣ Tap *SAVE* then *START*\n\n` +
                `🌐 Network: Airtel UG\n` +
                `🇺🇬 Server: Uganda GCP\n` +
                `📦 Data: 2GB\n\n` +
                `_Powered by ${context?.config?.botName || 'JAM-MD'}_`;

            await sock.sendMessage(chatId, {
                document: fileBuffer,
                mimetype: 'application/octet-stream',
                fileName: 'Uganda_Airtel_GCP.mludp',
                caption
            }, { quoted: message });

        } catch (error) {
            console.error('[Airtel Plugin Error]', error);
            await sock.sendMessage(chatId, {
                text: `❌ *Error fetching Airtel config*\n\n${error.message || 'Unknown error occurred'}\n\nContact the bot owner.`
            }, { quoted: message });
        }
    }
};
