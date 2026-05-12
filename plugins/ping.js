export default {
    command: 'ping',
    aliases: ['p', 'pong'],
    category: 'general',
    description: 'Check bot response time',
    usage: '.ping',
    isPrefixless: true,
    async handler(sock, message, _args) {
        const start = Date.now();
        const chatId = message.key.remoteJid;
        const end = Date.now();
        await sock.sendMessage(chatId, {
            text: `🏓 *Pong!*\nLatency: *${end - start}ms*`,
        }, { quoted: message });
    }
};
