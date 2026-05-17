import fs from 'fs';
import store from '../lib/lightweight_store.js';
import { dataFile } from '../lib/paths.js';
import { getCurrentProvider, getProviderInfo } from '../lib/aiProvider.js';

const AUTO_AI_FILE = dataFile('autoAi.json');
const DM_AI_FILE = dataFile('dmAiAll.json');
const HAS_DB = !!(process.env.MONGO_URL || process.env.POSTGRES_URL || process.env.MYSQL_URL || process.env.DB_URL);

async function getAutoAiChats() {
    try {
        if (HAS_DB) return (await store.getSetting('global', 'autoAi')) || {};
        if (!fs.existsSync(AUTO_AI_FILE)) return {};
        return JSON.parse(fs.readFileSync(AUTO_AI_FILE, 'utf8'));
    } catch { return {}; }
}

async function getDmAiState() {
    try {
        if (HAS_DB) return (await store.getSetting('global', 'dmAiAll')) || { enabled: false };
        if (!fs.existsSync(DM_AI_FILE)) return { enabled: false };
        return JSON.parse(fs.readFileSync(DM_AI_FILE, 'utf8'));
    } catch { return { enabled: false }; }
}

export default {
    command: 'aistatus',
    aliases: ['ailist', 'aichats'],
    category: 'ai',
    description: 'Show all chats with always-on AI enabled and current provider',
    usage: '.aistatus',
    ownerOnly: true,
    async handler(sock, message, args, context) {
        const { chatId } = context;

        const [chatsMap, dmState, providerName] = await Promise.all([
            getAutoAiChats(),
            getDmAiState(),
            getCurrentProvider()
        ]);
        const info = await getProviderInfo(providerName);

        const chatEntries = Object.keys(chatsMap).filter(k => chatsMap[k]);
        const dmOn = dmState.enabled;

        const providerLine = info
            ? (info.needsKey
                ? (info.hasKey ? `🔑 ${info.name} ✅` : `⚠️ ${info.name} — NO KEY (use .aikey ${providerName} YOUR_KEY)`)
                : `🆓 ${info.name} (free)`)
            : providerName;

        if (chatEntries.length === 0 && !dmOn) {
            return sock.sendMessage(chatId, {
                text: `🤖 *AI Status*\n\n`
                    + `*Provider:* ${providerLine}\n\n`
                    + `❌ No chats have always-on AI enabled.\n\n`
                    + `_Use *.aion* in any chat to enable per-chat AI._\n`
                    + `_Use *.aionall* to enable AI for all DMs._`
            }, { quoted: message });
        }

        let text = `🤖 *AI Status*\n\n`;
        text += `*Provider:* ${providerLine}\n`;
        text += `*DM auto-reply (all):* ${dmOn ? '✅ ON' : '❌ OFF'}\n\n`;

        if (chatEntries.length > 0) {
            text += `*Per-chat AI enabled in ${chatEntries.length} chat(s):*\n`;
            chatEntries.forEach((jid, i) => {
                const isGroup = jid.endsWith('@g.us');
                const label = isGroup ? '👥 Group' : '👤 DM';
                const number = jid.split('@')[0];
                text += `${i + 1}. ${label} — \`${number}\`\n`;
            });
            text += `\n`;
        }

        text += `_Use *.aioff* in a chat to disable per-chat AI._\n`;
        text += `_Use *.aioffall* to disable all-DM auto-reply._`;

        return sock.sendMessage(chatId, { text }, { quoted: message });
    }
};
