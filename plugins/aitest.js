import { askAI, getCurrentProvider, getProviderInfo, PROVIDER_LIST } from '../lib/aiProvider.js';

const TEST_PROMPTS = [
    { label: 'General knowledge', msg: 'Do you know a TV series called "From"? Tell me what it\'s about in 1-2 sentences.' },
    { label: 'Casual chat', msg: 'What do you think about travelling to Japan?' },
    { label: 'Language awareness', msg: 'Sema kitu kimoja kuhusu Afrika ya Mashariki.' }
];

export default {
    command: 'aitest',
    aliases: ['testai', 'pingai'],
    category: 'ai',
    description: 'Test the active AI provider with a real message to verify quality',
    usage: '.aitest [prompt]',
    ownerOnly: true,
    async handler(sock, message, args, context) {
        const chatId = context.chatId || message.key.remoteJid;
        const provider = await getCurrentProvider();
        const info = await getProviderInfo(provider);

        if (info.needsKey && !info.hasKey) {
            return sock.sendMessage(chatId, {
                text: `❌ *${info.name}* has no API key.\n\nSet it: .aikey ${provider} YOUR_KEY\nOr switch to free: .aiswitch mistral`
            }, { quoted: message });
        }

        // If user provided a custom prompt, test with that
        const customPrompt = args.join(' ').trim();
        const testPrompt = customPrompt || TEST_PROMPTS[0].msg;
        const testLabel = customPrompt ? 'Custom prompt' : TEST_PROMPTS[0].label;

        await sock.sendMessage(chatId, {
            text: `🔄 Testing *${info.name}*...\n_Prompt: "${testPrompt}"_`
        }, { quoted: message });

        const start = Date.now();
        try {
            const fullPrompt = `You are JAM-MD, a casual human chatting on WhatsApp. Reply in the same language as the question. Keep it short (1-2 sentences).\n\nUser: ${testPrompt}\nYou:`;
            const reply = await askAI(fullPrompt);
            const ms = Date.now() - start;

            const keyStatus = info.needsKey
                ? `🔑 API key: ✅ set`
                : `🆓 Free provider (no key needed)`;

            await sock.sendMessage(chatId, {
                text: `✅ *${info.name}* is working!\n\n`
                    + `📋 *Test:* ${testLabel}\n`
                    + `💬 *Reply:* ${reply.slice(0, 300)}\n\n`
                    + `⏱ Response time: ${ms}ms\n`
                    + `${keyStatus}\n\n`
                    + `_If reply looks good → use .aionall to enable DM auto-reply_\n`
                    + `_To test another prompt → .aitest your message here_`
            }, { quoted: message });
        } catch (err) {
            const ms = Date.now() - start;
            await sock.sendMessage(chatId, {
                text: `❌ *${info.name}* failed after ${ms}ms\n\n`
                    + `⚠️ *Error:* ${err.message}\n\n`
                    + `*Possible fixes:*\n`
                    + `• Check key: .aikey ${provider} YOUR_NEW_KEY\n`
                    + `• Switch to free: .aiswitch mistral\n`
                    + `• Check all providers: .aiswitch`
            }, { quoted: message });
        }
    }
};
