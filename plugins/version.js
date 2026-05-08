import os from 'os';
import process from 'process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function getGitInfo() {
    try {
        const headPath = path.join(__dirname, '..', '.git', 'HEAD');
        if (!fs.existsSync(headPath)) return null;
        const head = fs.readFileSync(headPath, 'utf8').trim();
        let branch = head.startsWith('ref: refs/heads/') ? head.replace('ref: refs/heads/', '') : head.slice(0, 7);
        let commitHash = '';
        let commitMsg = '';
        try {
            const refPath = path.join(__dirname, '..', '.git', head.replace('ref: ', ''));
            if (fs.existsSync(refPath)) commitHash = fs.readFileSync(refPath, 'utf8').trim().slice(0, 7);
            const msgPath = path.join(__dirname, '..', '.git', 'COMMIT_EDITMSG');
            if (fs.existsSync(msgPath)) commitMsg = fs.readFileSync(msgPath, 'utf8').trim().split('\n')[0].slice(0, 50);
        } catch {}
        return { branch, commitHash, commitMsg };
    } catch { return null; }
}

function getPackageVersion() {
    try {
        const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
        return { version: pkg.version || '?', baileys: pkg.dependencies?.['@whiskeysockets/baileys'] || pkg.dependencies?.['baileys'] || '?' };
    } catch { return { version: '?', baileys: '?' }; }
}

export default {
    command: 'version',
    aliases: ['ver', 'v', 'botversion', 'checkversion'],
    category: 'general',
    description: 'Show bot version, Node.js, Baileys version and loaded plugins',
    usage: '.version',
    async handler(sock, message, _args, context) {
        const { chatId, config, channelInfo } = context;
        try {
            const { version, baileys } = getPackageVersion();
            const git = getGitInfo();
            let pluginCount = '?';
            try { pluginCount = fs.readdirSync(__dirname).filter(f => f.endsWith('.js')).length; } catch {}
            let upSec = Math.floor(process.uptime());
            const upDays = Math.floor(upSec / 86400); upSec %= 86400;
            const upHrs  = Math.floor(upSec / 3600);  upSec %= 3600;
            const upMins = Math.floor(upSec / 60);     upSec %= 60;
            const uptimeParts = [];
            if (upDays) uptimeParts.push(upDays + 'd');
            if (upHrs)  uptimeParts.push(upHrs  + 'h');
            if (upMins) uptimeParts.push(upMins + 'm');
            uptimeParts.push(upSec + 's');
            const usedMB = (process.memoryUsage().rss / 1024 / 1024).toFixed(1);
            const lines = [
                '*╔══════════════════════════╗*',
                '*║       JAM-MD VERSION       ║*',
                '*╚══════════════════════════╝*',
                '',
                '📦 *Bot Version:* v' + version,
                '🔧 *Node.js:* ' + process.version,
                '📡 *Baileys:* ' + baileys,
                '🔌 *Plugins Loaded:* ' + pluginCount,
                '⏱️ *Uptime:* ' + uptimeParts.join(' '),
                '💾 *RAM:* ' + usedMB + ' MB',
                '💻 *Platform:* ' + os.platform() + ' (' + os.arch() + ')',
            ];
            if (git) {
                lines.push('');
                lines.push('🌿 *Branch:* ' + git.branch);
                if (git.commitHash) lines.push('🔖 *Commit:* ' + git.commitHash);
                if (git.commitMsg)  lines.push('📝 *Last:* ' + git.commitMsg);
            }
            lines.push('');
            lines.push('🤖 *Bot:* ' + (config.botName || 'JAM-MD'));
            lines.push('👤 *Owner:* ' + (config.botOwner || 'Jaiton fangs'));
            lines.push('🌐 github.com/jumatjai-create/jam-md');
            await sock.sendMessage(chatId, { text: lines.join('\n'), ...channelInfo }, { quoted: message });
        } catch (err) {
            await sock.sendMessage(chatId, { text: '❌ Version error: ' + err.message, ...channelInfo }, { quoted: message });
        }
    }
};
