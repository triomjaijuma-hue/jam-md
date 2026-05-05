export default {
    command: 'images',
    aliases: ['wallpics', 'pics'],
    category: 'images',
    description: 'Send 3 random images for a given category',
    usage: '.images <category>',
    async handler(sock, message, args, context) {
        const chatId = context.chatId || message.key.remoteJid;
        const keywords = {
            chinese: 'china,asian', korean: 'korea,kpop', japanese: 'japan,anime',
            thai: 'thailand', vietnamese: 'vietnam', indo: 'indonesia', malay: 'malaysia',
            hijab: 'hijab,muslim', cat: 'cat,kitten', dog: 'dog,puppy', car: 'car,automobile',
            bike: 'motorcycle,bike', rose: 'rose,flower', pubg: 'pubg,gaming',
            kpop: 'kpop,music', aesthetic: 'aesthetic,minimal', cosplay: 'cosplay,anime',
            couple: 'couple,love', nature: 'nature,landscape', city: 'city,cityscape',
            wallpaper: 'wallpaper,colorful', anime: 'anime,cartoon', random: 'colorful,abstract',
        };
        const category = (args[0] || '').toLowerCase();
        if (!category || !keywords[category]) {
            const list = Object.keys(keywords).map((c, i) => (i + 1) + '. ' + c).join('\n');
            return await sock.sendMessage(chatId, {
                text: '*📷 IMAGES*\n━━━━━━━━━━━━━━\n' + list + '\n\n*Usage:* .images cat'
            }, { quoted: message });
        }
        await sock.sendMessage(chatId, { react: { text: '⏳', key: message.key } });
        const kw = keywords[category];
        try {
            for (let i = 0; i < 3; i++) {
                const seed = Math.floor(Math.random() * 99999);
                const { default: axios } = await import('axios');
                const { data } = await axios.get('https://loremflickr.com/800/600/' + kw + '/all?lock=' + seed, {
                    responseType: 'arraybuffer', timeout: 20000, maxRedirects: 5
                });
                await sock.sendMessage(chatId, { image: Buffer.from(data), caption: '📷 ' + category + ' image ' + (i + 1) + '/3' }, { quoted: message });
                await new Promise(r => setTimeout(r, 800));
            }
        } catch (err) {
            await sock.sendMessage(chatId, { text: '❌ Could not fetch images. Please try again.' }, { quoted: message });
        }
    }
};