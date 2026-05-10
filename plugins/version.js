import config from '../config.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

export default {
    command: 'version',
    aliases: ['ver', 'botinfo', 'checkupdate', 'updateinfo'],
    category: 'owner',
    description: 'Show current bot version and last update info',
    usage: '.version',
    ownerOnly: false,
    async handler(sock, message, args, context) {
        const { chatId } = context;

        // Read last update record
        const infoPath = path.join(process.cwd(), 'data', 'last_update.json');
        let updateInfo = null;
        try {
            if (fs.existsSync(infoPath)) {
                updateInfo = JSON.parse(fs.readFileSync(infoPath, 'utf8'));
            }
        } catch {}

        // Uptime
        const uptimeSec = Math.floor(process.uptime());
        const h = Math.floor(uptimeSec / 3600);
        const m = Math.floor((uptimeSec % 3600) / 60);
        const s = uptimeSec % 60;
        const uptimeStr = h > 0 ? `${h}h ${m}m ${s}s` : m > 0 ? `${m}m ${s}s` : `${s}s`;

        // Memory
        const memUsed = Math.round(process.memoryUsage().rss / 1024 / 1024);
        const memTotal = Math.round(os.totalmem() / 1024 / 1024);

        // Platform
        const nodeVer = process.version;
        const platform = os.platform();

        let updateSection = '';
        if (updateInfo) {
            const date = new Date(updateInfo.timestamp);
            const dateStr = date.toLocaleString('en-GB', {
                timeZone: config.timeZone || 'Africa/Kampala',
                day: '2-digit', month: 'short', year: 'numeric',
                hour: '2-digit', minute: '2-digit', hour12: true
            });
            updateSection =
                `\n━━━━━━━━━━━━━━━━━━━` +
                `\n🔄 *Last Update*` +
                `\n📅 ${dateStr}` +
                `\n📁 Files updated: ${updateInfo.filesUpdated || '?'}` +
                (updateInfo.fixes && updateInfo.fixes.length
                    ? `\n✅ Fixes applied:\n${updateInfo.fixes.map(f => `  • ${f}`).join('\n')}`
                    : '') +
                `\n🤖 Bot stayed online: ${updateInfo.stayedOnline ? '✅ Yes' : '❌ No'}`;
        } else {
            updateSection = `\n━━━━━━━━━━━━━━━━━━━\n🔄 *Last Update:* No update run yet`;
        }

        const msg =
            `🤖 *JAM-MD INFO*\n` +
            `━━━━━━━━━━━━━━━━━━━\n` +
            `📦 *Version:* ${config.version || '?'}\n` +
            `👑 *Owner:* ${config.ownerNumber || '?'}\n` +
            `🌍 *Timezone:* ${config.timeZone || 'Africa/Kampala'}\n` +
            `⏱️ *Uptime:* ${uptimeStr}\n` +
            `💾 *Memory:* ${memUsed}MB / ${memTotal}MB\n` +
            `⚙️ *Node.js:* ${nodeVer}\n` +
            `🖥️ *Platform:* ${platform}` +
            updateSection;

        await sock.sendMessage(chatId, { text: msg }, { quoted: message });
    }
};
