import { getCurrentProvider, setProvider, getProviderInfo, PROVIDER_LIST } from '../lib/aiProvider.js';

export default {
    command: 'aiswitch',
    aliases: ['switchai', 'setai'],
    category: 'ai',
    description: 'Switch between AI providers',
    usage: '.aiswitch <provider>',
    ownerOnly: true,
    async handler(sock, message, args, context) {
        const chatId = context.chatId || message.key.remoteJid;
        const choice = args[0]?.toLowerCase().trim();

        if (!choice) {
            const current = await getCurrentProvider();
            const infoLines = await Promise.all(
                PROVIDER_LIST.map(async p => {
                    const info = await getProviderInfo(p);
                    const active = p === current ? ' ◀ *active*' : '';
                    const keyStatus = info.needsKey
                        ? (info.hasKey ? '🔑 key set' : '🔒 needs key')
                        : '🆓 free';
                    return `• *${p}* — ${info.name} [${keyStatus}]${active}`;
                })
            );
            return sock.sendMessage(chatId, {
                text: `🤖 *AI Provider Manager*\n\n`
                    + `*Current:* ${current}\n\n`
                    + `*Available providers:*\n${infoLines.join('\n')}\n\n`
                    + `*Switch:* .aiswitch <provider>\n`
                    + `*Set key:* .aikey <provider> <your_api_key>\n\n`
                    + `*Get free keys:*\n`
                    + `• Groq → console.groq.com (free tier)\n`
                    + `• Gemini → aistudio.google.com (free tier)\n`
                    + `• OpenAI → platform.openai.com`
            }, { quoted: message });
        }

        try {
            await setProvider(choice);
            const info = await getProviderInfo(choice);
            let msg = `✅ *AI switched to: ${info.name}*`;
            if (info.needsKey && !info.hasKey) {
                msg += `\n\n⚠️ This provider needs an API key.\nUse: .aikey ${choice} YOUR_KEY`;
            }
            await sock.sendMessage(chatId, { text: msg }, { quoted: message });
        } catch (err) {
            await sock.sendMessage(chatId, { text: `❌ ${err.message}` }, { quoted: message });
        }
    }
};
