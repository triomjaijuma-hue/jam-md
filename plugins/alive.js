import os from 'os';
import process from 'process';
export default {
    command: 'alive',
    aliases: ['status', 'bot'],
    category: 'general',
    description: 'Check bot status and system info',
    usage: '.alive',
    isPrefixless: true,
    async handler(sock, message, args, context) {
        const { chatId, config } = context;
        try {
            let uptime = Math.floor(process.uptime());
            const days = Math.floor(uptime / 86400);
            uptime %= 86400;
            const hours = Math.floor(uptime / 3600);
            uptime %= 3600;
            const minutes = Math.floor(uptime / 60);
            const seconds = (Number(uptime) % Number(60));
            const uptimeParts = [];
            if (days)
                uptimeParts.push(`${days}d`);
            if (hours)
                uptimeParts.push(`${hours}h`);
            if (minutes)
                uptimeParts.push(`${minutes}m`);
            if (seconds || uptimeParts.length === 0)
                uptimeParts.push(`${seconds}s`);
            const uptimeText = uptimeParts.join(' ');
            // Use process.memoryUsage() — accurate for Docker/Wispbyte containers.
            // os.totalmem() / os.freemem() read the HOST server (44 GB+), not the container.
            const mem = process.memoryUsage();
            const usedMem = (mem.rss / 1024 / 1024).toFixed(1);          // actual physical RAM used
            const heapUsed = (mem.heapUsed / 1024 / 1024).toFixed(1);    // JS heap used
            const heapTotal = (mem.heapTotal / 1024 / 1024).toFixed(1);  // JS heap allocated
            const cpuLoad = os.loadavg()[0].toFixed(2);
            const platform = os.platform();
            const arch = os.arch();
            const nodeVersion = process.version;
            const text = `*🤖 ${config.botName} IS ACTIVE!*\n\n` +
                `*Owner:* ${config.botOwner}\n` +
                `*Version:* ${config.version}\n` +
                `*Uptime:* ${uptimeText}\n` +
                `*RAM Usage:* ${usedMem} MB\n` +
                `*CPU Load:* ${cpuLoad}\n` +
                `*Platform:* ${platform} (${arch})\n` +
                `*Node.js:* ${nodeVersion}\n`;
            await sock.sendMessage(chatId, { text }, { quoted: message });
        }
        catch (error) {
            console.error('Error in alive command:', error);
            await sock.sendMessage(chatId, { text: '✅ Bot is alive and running!' }, { quoted: message });
        }
    }
};
