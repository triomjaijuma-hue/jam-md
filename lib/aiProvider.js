import axios from 'axios';
import store from './lightweight_store.js';

// ─── Persona ───────────────────────────────────────────────────────────────
const SYSTEM_PERSONA = `You are JAM-MD, a cool casual human chatting on WhatsApp.
Rules:
- ALWAYS reply in the SAME language the user wrote in. If they write Arabic, reply in Arabic. If Swahili, reply in Swahili. If English, reply in English. Match their language exactly.
- Keep replies short — 1 to 2 lines max
- Be witty, natural, and casual — never robotic
- Use emojis naturally
- Never say you are an AI or bot
- Match the user's energy and tone`;

// Extract the last user message from a chatbot prompt (works with chatbot.js prompt format)
function extractUserMessage(fullPrompt) {
    const lines = fullPrompt.split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
        if (lines[i].trim().startsWith('User:')) {
            return lines[i].replace(/^User:\s*/i, '').trim();
        }
    }
    for (let i = lines.length - 1; i >= 0; i--) {
        const l = lines[i].trim();
        if (l && l !== 'You:') return l;
    }
    return fullPrompt.slice(-300);
}

// ─── Provider definitions ──────────────────────────────────────────────────

const PROVIDERS = {
    mistral: {
        name: 'Mistral (Free)',
        needsKey: false,
        async ask(fullPrompt) {
            const userMsg = extractUserMessage(fullPrompt);
            const shortPrompt = `You're JAM-MD, a witty human WhatsApp friend. Reply in the SAME language the user used. Be casual, short (1-2 lines), use emojis. Message: ${userMsg}`;
            const endpoints = [
                `https://mistral.stacktoy.workers.dev/?apikey=Suhail&text=${encodeURIComponent(shortPrompt)}`,
                `https://mistral.gtech-apiz.workers.dev/?apikey=Suhail&text=${encodeURIComponent(shortPrompt)}`,
                `https://llama.gtech-apiz.workers.dev/?apikey=Suhail&text=${encodeURIComponent(shortPrompt)}`
            ];
            for (const url of endpoints) {
                try {
                    const { data } = await axios.get(url, { timeout: 20000 });
                    const reply = data?.data?.response;
                    if (reply && typeof reply === 'string' && reply.trim()) return reply.trim();
                } catch { continue; }
            }
            throw new Error('Mistral APIs all failed');
        }
    },
    llama: {
        name: 'LLaMA (Free)',
        needsKey: false,
        async ask(fullPrompt) {
            const userMsg = extractUserMessage(fullPrompt);
            const shortPrompt = `You're JAM-MD, a witty human WhatsApp friend. Reply in the SAME language the user used. Be casual, short (1-2 lines), use emojis. Message: ${userMsg}`;
            const endpoints = [
                `https://llama.gtech-apiz.workers.dev/?apikey=Suhail&text=${encodeURIComponent(shortPrompt)}`,
                `https://discardapi.dpdns.org/api/bot/llama?apikey=guru&text=${encodeURIComponent(shortPrompt)}`
            ];
            for (const url of endpoints) {
                try {
                    const { data } = await axios.get(url, { timeout: 20000 });
                    const reply = data?.data?.response || data?.result;
                    if (reply && typeof reply === 'string' && reply.trim()) return reply.trim();
                } catch { continue; }
            }
            throw new Error('LLaMA APIs all failed');
        }
    },
    groq: {
        name: 'Groq (llama3-70b)',
        needsKey: true,
        async ask(fullPrompt, apiKey) {
            if (!apiKey) throw new Error('Groq API key not set. Use .aikey groq YOUR_KEY');
            const userMsg = extractUserMessage(fullPrompt);
            const { data } = await axios.post(
                'https://api.groq.com/openai/v1/chat/completions',
                {
                    model: 'llama3-70b-8192',
                    messages: [
                        { role: 'system', content: SYSTEM_PERSONA },
                        { role: 'user', content: userMsg }
                    ],
                    max_tokens: 256,
                    temperature: 0.9
                },
                {
                    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
                    timeout: 30000
                }
            );
            const reply = data?.choices?.[0]?.message?.content;
            if (!reply) throw new Error('Groq returned empty response');
            return reply.trim();
        }
    },
    gemini: {
        name: 'Gemini (Google)',
        needsKey: true,
        async ask(fullPrompt, apiKey) {
            if (!apiKey) throw new Error('Gemini API key not set. Use .aikey gemini YOUR_KEY');
            const userMsg = extractUserMessage(fullPrompt);
            const { data } = await axios.post(
                `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
                {
                    systemInstruction: { parts: [{ text: SYSTEM_PERSONA }] },
                    contents: [{ role: 'user', parts: [{ text: userMsg }] }],
                    generationConfig: { maxOutputTokens: 256, temperature: 0.9 }
                },
                { headers: { 'Content-Type': 'application/json' }, timeout: 30000 }
            );
            const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!reply) throw new Error('Gemini returned empty response');
            return reply.trim();
        }
    },
    openai: {
        name: 'OpenAI (GPT-4o-mini)',
        needsKey: true,
        async ask(fullPrompt, apiKey) {
            if (!apiKey) throw new Error('OpenAI API key not set. Use .aikey openai YOUR_KEY');
            const userMsg = extractUserMessage(fullPrompt);
            const { data } = await axios.post(
                'https://api.openai.com/v1/chat/completions',
                {
                    model: 'gpt-4o-mini',
                    messages: [
                        { role: 'system', content: SYSTEM_PERSONA },
                        { role: 'user', content: userMsg }
                    ],
                    max_tokens: 256,
                    temperature: 0.9
                },
                {
                    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
                    timeout: 30000
                }
            );
            const reply = data?.choices?.[0]?.message?.content;
            if (!reply) throw new Error('OpenAI returned empty response');
            return reply.trim();
        }
    }
};

export const PROVIDER_LIST = Object.keys(PROVIDERS);

// ─── State helpers ─────────────────────────────────────────────────────────

async function getState() {
    try {
        const s = await store.getSetting('global', 'aiProviderConfig');
        return s || { provider: 'mistral', keys: {} };
    } catch { return { provider: 'mistral', keys: {} }; }
}

async function setState(state) {
    await store.saveSetting('global', 'aiProviderConfig', state);
}

// ─── Public API ────────────────────────────────────────────────────────────

export async function getCurrentProvider() {
    const state = await getState();
    return state.provider || 'mistral';
}

export async function setProvider(name) {
    if (!PROVIDERS[name]) throw new Error(`Unknown provider: ${name}. Choose from: ${PROVIDER_LIST.join(', ')}`);
    const state = await getState();
    state.provider = name;
    await setState(state);
}

export async function setApiKey(provider, key) {
    if (!PROVIDERS[provider]) throw new Error(`Unknown provider: ${provider}. Choose from: ${PROVIDER_LIST.join(', ')}`);
    const state = await getState();
    if (!state.keys) state.keys = {};
    state.keys[provider] = key;
    await setState(state);
}

export async function getProviderInfo(name) {
    const p = PROVIDERS[name];
    if (!p) return null;
    const state = await getState();
    return {
        name: p.name,
        needsKey: p.needsKey,
        hasKey: !p.needsKey || !!(state.keys?.[name] || process.env[`${name.toUpperCase()}_API_KEY`])
    };
}

export async function askAI(prompt) {
    const state = await getState();
    const providerName = state.provider || 'mistral';
    const provider = PROVIDERS[providerName];
    if (!provider) throw new Error(`Provider "${providerName}" not found`);
    const apiKey = state.keys?.[providerName] || process.env[`${providerName.toUpperCase()}_API_KEY`];
    return await provider.ask(prompt, apiKey);
}
