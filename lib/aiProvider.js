import axios from 'axios';
import store from './lightweight_store.js';

// ─── Persona ───────────────────────────────────────────────────────────────
const SYSTEM_PERSONA = `You are a real person chatting with a friend on WhatsApp. You follow football, pop culture, viral videos, celebrities, and internet trends.
Rules:
- ALWAYS reply in the SAME language the friend used.
- For casual chat — keep it short, 1-3 lines, use emojis like a real person texting.
- For questions about viral moments, celebrities, football, sports, movies, music, internet trends — give a real answer like someone who follows these things. Don't pretend you don't know.
- If you genuinely don't know something very specific, say it casually like a person would: "lmao idk that one 😭" not like a robot saying "I don't have access to that information".
- Never say you are an AI or bot. If asked, deflect like a human: "why would I be a bot lol 😂"
- Never say "How can I help you?" — you are a friend, not an assistant.
- Match the friend's vibe. Funny, chill, hype — whatever fits.`;

// Extract the last user message from a chatbot prompt
// Handles multiple prompt formats used across plugins:
//   chatbot.js  → "User: ..."  / "You:"
//   dmai.js     → "Friend said: ..." / "Your reply:"
//   aion.js     → "Friend said: ..." / "Your reply:"
const PROMPT_MARKERS = ['You:', 'Your reply:', 'Assistant:'];
function extractUserMessage(fullPrompt) {
    const lines = fullPrompt.split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i].trim();
        if (line.startsWith('User:')) return line.replace(/^User:\s*/i, '').trim();
        if (line.startsWith('Friend said:')) return line.replace(/^Friend said:\s*/i, '').trim();
    }
    for (let i = lines.length - 1; i >= 0; i--) {
        const l = lines[i].trim();
        if (l && !PROMPT_MARKERS.includes(l)) return l;
    }
    return fullPrompt.slice(-300);
}

// Parse full conversation history into proper messages array for chat APIs
// Supports both "Them:/Me:" format (dmai/aion) and "User:/You:" format (chatbot)
function buildMessages(fullPrompt) {
    const lines = fullPrompt.split('\n').map(l => l.trim()).filter(Boolean);
    const history = [];
    let lastUserMsg = null;

    for (const line of lines) {
        if (line.startsWith('Them:') || line.startsWith('User:') || line.startsWith('Friend said:')) {
            const content = line.replace(/^(Them|User|Friend said):\s*/i, '').trim();
            if (content) { lastUserMsg = content; history.push({ role: 'user', content }); }
        } else if (line.startsWith('Me:') || line.startsWith('You:') || line.startsWith('Assistant:')) {
            const content = line.replace(/^(Me|You|Assistant):\s*/i, '').trim();
            if (content) history.push({ role: 'assistant', content });
        }
    }

    // If nothing parsed, fall back to single user message
    if (history.length === 0) {
        const msg = extractUserMessage(fullPrompt);
        return [{ role: 'user', content: msg }];
    }

    // Ensure last message is from user
    if (history[history.length - 1].role !== 'user') {
        const msg = extractUserMessage(fullPrompt);
        if (msg) history.push({ role: 'user', content: msg });
    }

    return history;
}

// ─── Web Search ────────────────────────────────────────────────────────────

// Detect messages that likely need current/live info
function needsSearch(message) {
    const lower = message.toLowerCase();
    const triggers = [
        'who is', 'who are', 'who was', 'what is', 'what are', 'what was',
        'when did', 'when is', 'when was', 'which team', 'which game',
        'which movie', 'which song', 'which player',
        'latest', 'recent', 'new', 'today', 'yesterday', 'this week', 'last night',
        'viral', 'trending', 'news', 'match', 'score', 'won', 'winner', 'champion',
        'reaction', 'supports', 'plays for', 'signed', 'transfer', 'contract',
        'died', 'dead', 'arrested', 'released', 'dropped', 'leaked', 'rumour',
        'how much', 'net worth', 'age', 'born', 'girlfriend', 'boyfriend',
        'album', 'trailer', 'episode', 'season'
    ];
    return triggers.some(t => lower.includes(t));
}

async function searchWeb(query) {
    try {
        const { data } = await axios.get(
            `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`,
            { timeout: 7000, headers: { 'User-Agent': 'Mozilla/5.0' } }
        );
        const parts = [];
        if (data?.Answer) parts.push(data.Answer);
        if (data?.AbstractText) parts.push(data.AbstractText);
        if (data?.RelatedTopics?.length) {
            for (const t of data.RelatedTopics.slice(0, 4)) {
                if (t?.Text) parts.push(t.Text);
            }
        }
        const result = parts.join(' ').replace(/\s+/g, ' ').trim().slice(0, 700);
        return result || '';
    } catch {
        return '';
    }
}

// Build system prompt — optionally enriched with live search results
async function buildSystemPrompt(userMsg) {
    if (!needsSearch(userMsg)) return SYSTEM_PERSONA;
    const info = await searchWeb(userMsg);
    if (!info) return SYSTEM_PERSONA;
    return `${SYSTEM_PERSONA}\n\n[You found this on the web — use it naturally in your reply as if you just know it, don't mention you searched]:\n${info}`;
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
        name: 'Groq (llama-3.3-70b)',
        needsKey: true,
        async ask(fullPrompt, apiKey) {
            if (!apiKey) throw new Error('Groq API key not set. Use .aikey groq YOUR_KEY');
            const userMsg = extractUserMessage(fullPrompt);
            const system = await buildSystemPrompt(userMsg);
            const { data } = await axios.post(
                'https://api.groq.com/openai/v1/chat/completions',
                {
                    model: 'llama-3.3-70b-versatile',
                    messages: [
                        { role: 'system', content: system },
                        ...buildMessages(fullPrompt)
                    ],
                    max_tokens: 300,
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
        name: 'Gemini 2.0 Flash',
        needsKey: true,
        async ask(fullPrompt, apiKey) {
            if (!apiKey) throw new Error('Gemini API key not set. Use .aikey gemini YOUR_KEY');
            // Gemini has native Google Search grounding — always enabled so it can
            // look up current events, viral moments, football scores etc automatically
            const payload = {
                systemInstruction: { parts: [{ text: SYSTEM_PERSONA }] },
                contents: buildMessages(fullPrompt).map(m => ({
                    role: m.role === 'assistant' ? 'model' : 'user',
                    parts: [{ text: m.content }]
                })),
                tools: [{ google_search: {} }],
                generationConfig: { maxOutputTokens: 300, temperature: 0.9 }
            };
            const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
            const opts = { headers: { 'Content-Type': 'application/json' }, timeout: 30000 };
            let res;
            try {
                res = await axios.post(url, payload, opts);
            } catch (err) {
                const status = err?.response?.status;
                if (status === 429) {
                    await new Promise(r => setTimeout(r, 5000));
                    try {
                        res = await axios.post(url, payload, opts);
                    } catch (err2) {
                        const s2 = err2?.response?.status;
                        if (s2 === 429) throw new Error('Gemini rate limit hit — free tier quota exceeded. Try again in a minute or switch: .aiswitch groq');
                        throw err2;
                    }
                } else {
                    throw err;
                }
            }
            const reply = res.data?.candidates?.[0]?.content?.parts?.[0]?.text;
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
            const system = await buildSystemPrompt(userMsg);
            const { data } = await axios.post(
                'https://api.openai.com/v1/chat/completions',
                {
                    model: 'gpt-4o-mini',
                    messages: [
                        { role: 'system', content: system },
                        ...buildMessages(fullPrompt)
                    ],
                    max_tokens: 300,
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
        if (s) return s;
    } catch {}
    // Fallback: read from .env (set by .aiswitch and .aikey commands)
    const envProvider = process.env.AI_PROVIDER;
    const keys = {};
    for (const p of Object.keys(PROVIDERS)) {
        const envKey = process.env[`${p.toUpperCase()}_API_KEY`];
        if (envKey) keys[p] = envKey;
    }
    return { provider: envProvider || 'mistral', keys };
}

async function setState(state) {
    await store.saveSetting('global', 'aiProviderConfig', state);
    // Also update process.env immediately so current session uses it
    if (state.provider) process.env.AI_PROVIDER = state.provider;
    if (state.keys) {
        for (const [p, key] of Object.entries(state.keys)) {
            process.env[`${p.toUpperCase()}_API_KEY`] = key;
        }
    }
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
    try {
        return await provider.ask(prompt, apiKey);
    } catch (err) {
        const isRateLimit = err.message?.toLowerCase().includes('rate limit') || err.message?.includes('429');
        if (!isRateLimit) throw err;

        // Rate limited — try other premium providers with keys first
        const premiumFallbacks = Object.keys(PROVIDERS).filter(name =>
            name !== providerName &&
            PROVIDERS[name].needsKey &&
            !!(state.keys?.[name] || process.env[`${name.toUpperCase()}_API_KEY`])
        );
        for (const name of premiumFallbacks) {
            try {
                const key = state.keys?.[name] || process.env[`${name.toUpperCase()}_API_KEY`];
                return await PROVIDERS[name].ask(prompt, key);
            } catch { continue; }
        }

        // All premium providers failed — silently fall back to free providers
        const freeFallbacks = Object.keys(PROVIDERS).filter(name =>
            name !== providerName && !PROVIDERS[name].needsKey
        );
        for (const name of freeFallbacks) {
            try {
                return await PROVIDERS[name].ask(prompt);
            } catch { continue; }
        }

        // Nothing worked — throw so caller can handle
        throw err;
    }
}
