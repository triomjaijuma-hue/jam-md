import { getProviderInfo, getCurrentProvider, PROVIDER_LIST, askAI } from '../lib/aiProvider.js';

  // ─── Free API pool (used by chatbot & DM auto-reply) ──────────────────────
  const FREE_APIS = [
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

  async function testFreeApi(api) {
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
          if (!reply || typeof reply !== 'string' || !reply.trim())
              return { name: api.name, status: 'broken', ms, reason: 'empty reply' };
          return { name: api.name, status: 'online', ms };
      } catch (e) {
          const ms = Date.now() - start;
          return { name: api.name, status: 'offline', ms, reason: e.name === 'AbortError' ? 'timeout' : e.message };
      }
  }

  async function testProviderApi(providerName, info) {
      if (!info.hasKey) {
          return { name: info.name, status: 'nokey', ms: 0 };
      }
      const start = Date.now();
      try {
          await askAI.__testProvider
              ? await askAI.__testProvider(providerName, 'Reply OK')
              : await (async () => {
                  // Swap to this provider temporarily just for test
                  const { setProvider, askAI: ask, getCurrentProvider: getCurrent, setProvider: setP } = await import('../lib/aiProvider.js');
                  const prev = await getCurrent();
                  await setP(providerName);
                  try { await ask('Reply OK'); } finally { await setP(prev); }
              })();
          return { name: info.name, status: 'online', ms: Date.now() - start };
      } catch (e) {
          return { name: info.name, status: 'offline', ms: Date.now() - start, reason: e.message.slice(0, 60) };
      }
  }

  export default {
      command: 'aicheck',
      aliases: ['aistatus', 'whichai', 'aiping'],
      category: 'ai',
      description: 'Test all AI APIs and providers, show full status',
      usage: '.aicheck',
      ownerOnly: true,
      async handler(sock, message, args, context) {
          const { chatId } = context;

          await sock.sendMessage(chatId, {
              text: '🤖 Checking all AIs... (up to 10s)'
          }, { quoted: message });

          // Run free API tests and provider info lookup in parallel
          const [freeResults, providerInfos, activeProvider] = await Promise.all([
              Promise.all(FREE_APIS.map(testFreeApi)),
              Promise.all(PROVIDER_LIST.map(async p => ({ name: p, info: await getProviderInfo(p) }))),
              getCurrentProvider()
          ]);

          const speedTag = ms => ms < 2000 ? ' ⚡' : ms < 5000 ? ' 🐢' : ' 🐌';
          const icon = s => s === 'online' ? '✅' : s === 'broken' ? '⚠️' : s === 'nokey' ? '🔒' : '❌';

          // ── Section 1: Free APIs ──────────────────────────────────────────
          let text = '🤖 *AI FULL STATUS*\n';
          text += '─────────────────────\n\n';
          text += '*📡 Free APIs* _(chatbot & DM auto-reply)_\n';

          const firstWorking = freeResults.find(r => r.status === 'online');
          freeResults.forEach((r, i) => {
              const speed = r.status === 'online' ? speedTag(r.ms) : '';
              const reason = r.reason ? ` _(${r.reason})_` : '';
              text += `${icon(r.status)} ${i + 1}. *${r.name}* — ${r.ms}ms${speed}${reason}\n`;
          });

          text += `\n🎯 *Active free API:* ${firstWorking ? firstWorking.name : '⚠️ ALL OFFLINE'}\n`;
          text += '_(picks first working one in order)_\n\n';

          // ── Section 2: Key-based providers ───────────────────────────────
          text += '─────────────────────\n';
          text += '*🔑 AI Providers* _(.aiswitch / .askme)_\n';

          providerInfos.forEach((p, i) => {
              const { name: provName, info } = p;
              const isActive = provName === activeProvider ? ' ◀ *active*' : '';
              if (!info.needsKey) {
                  text += `✅ ${i + 1}. *${info.name}* — free, no key needed${isActive}\n`;
              } else if (!info.hasKey) {
                  text += `🔒 ${i + 1}. *${info.name}* — no key set${isActive}\n`;
                  text += `   _Use: .aikey ${provName} YOUR_KEY_\n`;
              } else {
                  text += `✅ ${i + 1}. *${info.name}* — key saved${isActive}\n`;
              }
          });

          text += `\n🎯 *Active provider:* ${activeProvider}\n`;
          text += '_Use .aiswitch to change | .aikey to add key_';

          await sock.sendMessage(chatId, { text }, { quoted: message });
      }
  };
  