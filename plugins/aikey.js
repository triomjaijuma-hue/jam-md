import fs from 'fs';
import path from 'path';
import { setApiKey, getProviderInfo, PROVIDER_LIST } from '../lib/aiProvider.js';

function writeToEnv(provider, key) {
    try {
        const envPath = path.join(process.cwd(), '.env');
        const envKey = `${provider.toUpperCase()}_API_KEY`;
        let content = '';
        if (fs.existsSync(envPath)) content = fs.readFileSync(envPath, 'utf8');
        const lines = content.split('\n');
        const idx = lines.findIndex(l => l.startsWith(`${envKey}=`));
        const newLine = `${envKey}=${key}`;
        if (idx >= 0) lines[idx] = newLine;
        else lines.push(newLine);
        fs.writeFileSync(envPath, lines.join('\n').replace(/\n+$/, '') + '\n');
    } catch {}
}

export default {
    command: 'aikey',
    aliases: ['setaikey', 'addaikey'],
    category: 'ai',
    description: 'Set API key for an AI provider',
    usage: '.aikey <provider> <api_key>',
    ownerOnly: true,
    async handler(sock, message, args, context) {
        const chatId = context.chatId || message.key.remoteJid;
        const provider = args[0]?.toLowerCase().trim();
        const key = args.slice(1).join(' ').trim();

        if (!provider) {
            const lines = await Promise.all(
                PROVIDER_LIST.map(async p => {
                    const info = await getProviderInfo(p);
                    if (!info.needsKey) return `• *${p}* — 🆓 free (no key needed)`;
                    return `• *${p}* — ${info.hasKey ? '✅ key saved' : '❌ no key'}`;
                })
            );
            return sock.sendMessage(chatId, {
                text: `🔑 *AI Key Manager*\n\n`
                    + lines.join('\n')
                    + `\n\n*Usage:* .aikey <provider> <your_api_key>\n`
                    + `*Example:* .aikey groq gsk_xxxxxxxxxxxx\n\n`
                    + `*Get free keys:*\n`
                    + `• Groq → console.groq.com\n`
                    + `• Gemini → aistudio.google.com\n`
                    + `• OpenAI → platform.openai.com`
            }, { quoted: message });
        }

        if (!key) {
            return sock.sendMessage(chatId, {
                text: `❌ Please provide the API key.\nUsage: .aikey ${provider} YOUR_API_KEY`
            }, { quoted: message });
        }

        try {
            await setApiKey(provider, key);
            writeToEnv(provider, key); // also persist to .env so it survives redeploys
            const info = await getProviderInfo(provider);
            await sock.sendMessage(chatId, {
                text: `✅ *API key saved for ${info.name}*\n\n`
                    + `Key is stored in both data store and .env — it will survive bot restarts and redeploys.\n\n`
                    + `Switch to it now: .aiswitch ${provider}`
            }, { quoted: message });
            await sock.sendMessage(chatId, { react: { text: '🔑', key: message.key } });
        } catch (err) {
            await sock.sendMessage(chatId, { text: `❌ ${err.message}` }, { quoted: message });
        }
    }
};
