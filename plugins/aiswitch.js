import fs from 'fs';
import path from 'path';
import { getCurrentProvider, setProvider, getProviderInfo, PROVIDER_LIST } from '../lib/aiProvider.js';

function writeProviderToEnv(providerName) {
    try {
        const envPath = path.join(process.cwd(), '.env');
        let content = '';
        if (fs.existsSync(envPath)) content = fs.readFileSync(envPath, 'utf8');
        const lines = content.split('\n');
        const idx = lines.findIndex(l => l.startsWith('AI_PROVIDER='));
        const newLine = `AI_PROVIDER=${providerName}`;
        if (idx >= 0) lines[idx] = newLine;
        else lines.push(newLine);
        fs.writeFileSync(envPath, lines.join('\n').replace(/\n+$/, '') + '\n');
        // Also update the running process immediately
        process.env.AI_PROVIDER = providerName;
    } catch {}
}

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
                        ? (info.hasKey ? '✅ key set' : '❌ needs key')
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
            writeProviderToEnv(choice); // persist to .env so it survives redeploys
            const info = await getProviderInfo(choice);
            let msg = `✅ *AI switched to: ${info.name}*\n_Provider saved to .env — will survive restarts & redeploys_`;
            if (info.needsKey && !info.hasKey) {
                msg += `\n\n⚠️ *This provider needs an API key!*\nRun: .aikey ${choice} YOUR_KEY\n\nUntil then, chatbot will show a "no key" warning instead of using cheap free APIs.`;
            } else if (!info.needsKey) {
                msg += `\n\n_This is a free provider — no key needed. Chatbot is ready!_`;
            } else {
                msg += `\n\n_Key is set ✅ — chatbot will use ${info.name} from now on._`;
            }
            await sock.sendMessage(chatId, { text: msg }, { quoted: message });
            await sock.sendMessage(chatId, { react: { text: '🤖', key: message.key } });
        } catch (err) {
            await sock.sendMessage(chatId, { text: `❌ ${err.message}` }, { quoted: message });
        }
    }
};
