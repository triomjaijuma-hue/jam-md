import fetch from 'node-fetch';

const BASE_URL = process.env.AIRTEL_CONFIG_URL
    ? process.env.AIRTEL_CONFIG_URL.replace('/api/airtel', '')
    : 'https://b7a31e27-b2db-4aba-baf4-c04898f6ecb4-00-125u8d6u0oodo.sisko.replit.dev';

const FILES = [
    {
        key: 'fire',
        url: `${BASE_URL}/api/jez/fire`,
        fileName: 'Airtel_Fire.jez',
        label: '🔥 Fire Config',
        description: 'Fast & stable'
    },
    {
        key: 'daily',
        url: `${BASE_URL}/api/jez/daily`,
        fileName: 'Uganda_Airtel_Daily_1.5GB.jez',
        label: '📦 Daily 1.5GB Config',
        description: 'Daily 1.5GB bundle'
    }
];

export default {
    command: 'jez',
    aliases: ['jezconfig', 'airtelfire', 'airteljez'],
    category: 'tools',
    description: 'Get Airtel Uganda .jez config files for your VPN app',
    usage: '.jez — sends all configs\n.jez fire — Fire config only\n.jez daily — Daily 1.5GB only',
    async handler(sock, message, args, context) {
        const chatId = context.chatId || message.key.remoteJid;
        const filter = args[0]?.toLowerCase();

        const toSend = filter
            ? FILES.filter(f => f.key === filter)
            : FILES;

        if (toSend.length === 0) {
            return await sock.sendMessage(chatId, {
                text: `❌ Unknown config *"${filter}"*\n\nAvailable:\n• .jez fire\n• .jez daily\n• .jez (sends all)`
            }, { quoted: message });
        }

        try {
            await sock.sendMessage(chatId, {
                text: `⏳ *Fetching ${toSend.length} Airtel .jez config(s)...*\nPlease wait.`
            }, { quoted: message });

            for (const file of toSend) {
                const res = await fetch(file.url, {
                    headers: { 'User-Agent': 'JAM-MD-Bot/1.0' },
                    timeout: 20000
                });

                if (!res.ok) {
                    await sock.sendMessage(chatId, {
                        text: `❌ Failed to fetch *${file.label}* (${res.status}). Try again later.`
                    }, { quoted: message });
                    continue;
                }

                const arrayBuffer = await res.arrayBuffer();
                const fileBuffer = Buffer.from(arrayBuffer);

                const caption =
                    `📡 *${file.label}*\n` +
                    `📝 ${file.description}\n\n` +
                    `✅ *Ready to import into your VPN app*\n\n` +
                    `*How to use:*\n` +
                    `1️⃣ Save the .jez file\n` +
                    `2️⃣ Open your VPN app\n` +
                    `3️⃣ Import the .jez config file\n` +
                    `4️⃣ Connect & enjoy!\n\n` +
                    `🌐 Network: Airtel Uganda\n` +
                    `_Powered by ${context?.config?.botName || 'JAM-MD'}_`;

                await sock.sendMessage(chatId, {
                    document: fileBuffer,
                    mimetype: 'application/octet-stream',
                    fileName: file.fileName,
                    caption
                }, { quoted: message });
            }

        } catch (error) {
            console.error('[Jez Plugin Error]', error);
            await sock.sendMessage(chatId, {
                text: `❌ *Error fetching .jez config*\n\n${error.message || 'Unknown error'}\n\nContact the bot owner.`
            }, { quoted: message });
        }
    }
};
