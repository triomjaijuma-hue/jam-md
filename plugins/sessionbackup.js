import { getSessionBase64, saveToGist } from '../lib/sessionBackup.js';

export default {
    command: 'getsession',
    aliases: ['sessionbackup', 'savesession', 'myid'],
    category: 'owner',
    description: 'Get your SESSION_ID for Railway Variables — never lose your session again',
    usage: '.getsession',
    ownerOnly: true,
    async handler(sock, message, args, context) {
        const { chatId } = context;
        try {
            await sock.sendMessage(chatId, {
                text: '🔐 Generating your session backup...'
            }, { quoted: message });

            const sessionBase64 = getSessionBase64();
            const token = process.env.GITHUB_PERSONAL_ACCESS_TOKEN || process.env.GITHUB_TOKEN;
            let sessionIdLine = '';
            let backupNote = '';

            if (token) {
                try {
                    const gistId = await saveToGist(sessionBase64);
                    if (gistId) {
                        sessionIdLine = `JAM-MD_${gistId}`;
                        backupNote = `✅ *Saved to your private GitHub Gist automatically.*\n_Short ID — easy to copy._`;
                    }
                } catch (e) {
                    console.error('[SessionBackup] Gist save failed:', e.message);
                }
            }

            if (!sessionIdLine) {
                sessionIdLine = sessionBase64;
                backupNote = `_(No GitHub token found — using base64 format. It's longer but works the same.)_`;
            }

            const msg =
                `🔐 *YOUR SESSION BACKUP*\n\n` +
                `${backupNote}\n\n` +
                `📌 *SESSION_ID:*\n` +
                `\`${sessionIdLine}\`\n\n` +
                `*How to save it:*\n` +
                `1. Copy the SESSION_ID above\n` +
                `2. Railway → your service → *Variables*\n` +
                `3. Add  \`SESSION_ID = <paste>\`\n` +
                `4. Save — Railway will redeploy once\n\n` +
                `✅ After that, every redeploy and every *.update* will restore your WhatsApp session automatically — *no re-pairing ever again.*\n\n` +
                `⚠️ _Keep this private. Anyone with this ID can access your WhatsApp._`;

            await sock.sendMessage(chatId, { text: msg }, { quoted: message });
        } catch (error) {
            await sock.sendMessage(chatId, {
                text: `❌ ${error.message}`
            }, { quoted: message });
        }
    }
};
