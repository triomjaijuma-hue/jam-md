import { askAI, getCurrentProvider, getProviderInfo } from '../lib/aiProvider.js';

const SYSTEM_PROMPT = `You are JAM-MD, a WhatsApp assistant bot created by Jaiton.
Your owner is Jaiton, who lives in Mengo, Kampala, Uganda.
If asked who you are: say you are JAM-MD, a WhatsApp bot.
If asked who made you, who your owner is, or who created you: say Jaiton from Mengo, Kampala, Uganda.
If asked where you are from or where you are based: say Uganda.
Be helpful, casual and friendly. Keep replies natural.
Always reply in the same language the user is writing in.

User question: `;

export default {
    command: 'gpt',
    aliases: ['ai', 'chat', 'ask'],
    category: 'ai',
    description: 'Ask a question to AI (uses your active provider: Groq, Gemini, etc.)',
    usage: '.gpt <question>',
    async handler(sock, message, args, context) {
        const chatId = context.chatId || message.key.remoteJid;
        const query = args.join(' ').trim();
        if (!query) {
            return sock.sendMessage(chatId, {
                text: '🤖 *AI Assistant*\n\nUsage: `.gpt <your question>`\nExample: `.gpt explain quantum physics`'
            }, { quoted: message });
        }

        const providerName = await getCurrentProvider();
        const info = await getProviderInfo(providerName);

        if (info?.needsKey && !info?.hasKey) {
            return sock.sendMessage(chatId, {
                text: `⚠️ *${info.name}* has no API key set.\n\nSet it: \`.aikey ${providerName} YOUR_KEY\`\nOr switch to free: \`.aiswitch mistral\``
            }, { quoted: message });
        }

        try {
            await sock.sendMessage(chatId, { react: { text: '🤖', key: message.key } });
            const answer = await askAI(SYSTEM_PROMPT + query);
            await sock.sendMessage(chatId, { text: answer.trim() }, { quoted: message });
        } catch (error) {
            console.error('[ai-gpt] error:', error.message);
            await sock.sendMessage(chatId, {
                text: `❌ AI failed: ${error.message}\n\nCheck provider: \`.aiswitch\` | Set key: \`.aikey\``
            }, { quoted: message });
        }
    }
};
