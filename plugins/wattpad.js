export default {
    command: 'wattpad',
    aliases: ['wattpadsearch', 'searchwattpad'],
    category: 'search',
    description: 'Search for stories on Wattpad',
    usage: '.wattpad <query>',
    async handler(sock, message, args, context) {
        const chatId = context.chatId || message.key.remoteJid;
        const query = args.join(' ').trim();
        if (!query) {
            return await sock.sendMessage(chatId, {
                text: '*Please provide a search term.*\nExample: .wattpad The Hunger Games'
            }, { quoted: message });
        }
        try {
            await sock.sendMessage(chatId, { text: `🔎 Searching Wattpad for *${query}*...` }, { quoted: message });
            const url = `https://www.wattpad.com/api/v3/search/stories/?query=${encodeURIComponent(query)}&limit=9&fields=id,title,user(name),numReads,voteCount,mainCategory,cover,url,description`;
            const res = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Accept': 'application/json'
                }
            });
            if (!res.ok) throw new Error(`Wattpad API error (HTTP ${res.status})`);
            const data = await res.json();
            const stories = data?.stories || data?.data || [];
            if (!Array.isArray(stories) || stories.length === 0) {
                throw new Error('No stories found for your query.');
            }
            const formatted = stories.map((s, i) => {
                const title = s.title || 'Untitled';
                const author = s.user?.name || 'Unknown';
                const reads = s.numReads ? Number(s.numReads).toLocaleString() : '?';
                const votes = s.voteCount ? Number(s.voteCount).toLocaleString() : '?';
                const category = s.mainCategory || 'General';
                const link = s.url?.startsWith('http') ? s.url : `https://www.wattpad.com${s.url || ''}`;
                return `*${i + 1}. ${title}*\n👤 ${author} | 📚 ${category}\n👁 ${reads} reads  ❤️ ${votes} votes\n🔗 ${link}`;
            }).join('\n\n');
            await sock.sendMessage(chatId, {
                text: `📖 *Wattpad Results for "${query}":*\n\n${formatted}`
            }, { quoted: message });
        } catch (error) {
            console.error('Wattpad error:', error);
            await sock.sendMessage(chatId, {
                text: `❌ Failed to search Wattpad.\n\nError: ${error.message}`
            }, { quoted: message });
        }
    }
};
