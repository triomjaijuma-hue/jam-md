// Same 4 APIs used by both chatbot.js and dmai.js
const AI_APIS = [
    {
        name: 'ZellAPI',
        url: t => `https://zellapi.autos/ai/chatbot?text=${encodeURIComponent(t)}`,
        parse: d => d?.result
    },
    {
        name: 'Hercai',
        url: t => `https://hercai.onrender.com/gemini/hercai?question=${encodeURIComponent(t)}`,
        parse: d => d?.reply
    },
    {
        name: 'SparkAPI',
        url: t => `https://discardapi.dpdns.org/api/chat/spark?apikey=guru&text=${encodeURIComponent(t)}`,
        parse: d => d?.result?.answer
    },
    {
        name: 'LlamaAPI',
        url: t => `https://discardapi.dpdns.org/api/bot/llama?apikey=guru&text=${encodeURIComponent(t)}`,
        parse: d => d?.result
    }
];

async function testApi(api) {
    const start = Date.now();
    try {
        const controller = new AbortController();
        const tid = setTimeout(() => controller.abort(), 10000);
        const res = await fetch(api.url('hi'), { signal: controller.signal });
        clearTimeout(tid);
        const ms = Date.now() - start;
        if (!res.ok) return { name: api.name, status: 'offline', ms, reason: `HTTP ${res.status}` };
        const data = await res.json();
        const reply = api.parse(data);
        if (!reply || typeof reply !== 'string' || reply.trim() === '') {
            return { name: api.name, status: 'broken', ms, reason: 'no valid reply' };
        }
        return { name: api.name, status: 'online', ms };
    } catch (e) {
        const ms = Date.now() - start;
        return { name: api.name, status: 'offline', ms, reason: e.name === 'AbortError' ? 'timeout' : e.message };
    }
}

export default {
    command: 'aicheck',
    aliases: ['aistatus', 'whichai', 'aiping'],
    category: 'owner',
    description: 'Test all AI APIs and show which one the bot is currently using',
    usage: '.aicheck',
    ownerOnly: true,
    async handler(sock, message, args, context) {
        const { chatId } = context;
        await sock.sendMessage(chatId, {
            text: '🤖 Testing all AI APIs... please wait (up to 10s per API).'
        }, { quoted: message });

        // Test all 4 in parallel for speed
        const results = await Promise.all(AI_APIS.map(testApi));

        const statusIcon = s => s === 'online' ? '✅' : s === 'broken' ? '⚠️' : '❌';
        const activeApi = results.find(r => r.status === 'online');

        let text = `🤖 *AI API STATUS*\n`;
        text += `─────────────────────\n\n`;
        results.forEach((r, i) => {
            const icon = statusIcon(r.status);
            const speed = r.status === 'online'
                ? (r.ms < 2000 ? ' ⚡ fast' : r.ms < 5000 ? ' 🐢 slow' : ' 🐌 very slow')
                : '';
            const reason = r.reason ? ` _(${r.reason})_` : '';
            text += `${icon} *${i + 1}. ${r.name}*\n`;
            text += `   ${r.status.toUpperCase()} — ${r.ms}ms${speed}${reason}\n\n`;
        });

        text += `─────────────────────\n`;
        if (activeApi) {
            text += `🎯 *Currently Using:* ${activeApi.name}\n`;
            text += `_(bot picks the first working API in order)_`;
        } else {
            text += `⚠️ *ALL APIs are currently offline!*\n`;
            text += `AI features (.chatbot, .aionall) won't work until at least one API comes back online.`;
        }

        await sock.sendMessage(chatId, { text }, { quoted: message });
    }
};
