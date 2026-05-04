import axios from 'axios';
export default {
    command: 'game',
    aliases: ["gaming","gameimg"],
    category: 'images',
    description: 'Get a random gaming image',
    usage: '.game',
    async handler(sock, message, args, context) {
        const chatId = context.chatId || message.key.remoteJid;
        try {
            await sock.sendMessage(chatId, { react: { text: '⏳', key: message.key } });
            const seed = Math.floor(Math.random() * 99999);
            const imgUrl = 'https://loremflickr.com/800/600/gaming,videogame,esports/all?lock=' + seed;
            const { data } = await axios.get(imgUrl, { responseType: 'arraybuffer', timeout: 20000, maxRedirects: 5 });
            await sock.sendMessage(chatId, { image: Buffer.from(data), caption: '🎮 Gaming Image' }, { quoted: message });
        } catch (err) {
            await sock.sendMessage(chatId, { text: '❌ Could not fetch image. Please try again.' }, { quoted: message });
        }
    }
};