import axios from 'axios';
export default {
    command: 'coding',
    aliases: ["codingimg","programming","programmingimg"],
    category: 'images',
    description: 'Get a random programming image',
    usage: '.coding',
    async handler(sock, message, args, context) {
        const chatId = context.chatId || message.key.remoteJid;
        try {
            await sock.sendMessage(chatId, { react: { text: '⏳', key: message.key } });
            const seed = Math.floor(Math.random() * 99999);
            const imgUrl = 'https://loremflickr.com/800/600/programming,coding,developer/all?lock=' + seed;
            const { data } = await axios.get(imgUrl, { responseType: 'arraybuffer', timeout: 20000, maxRedirects: 5 });
            await sock.sendMessage(chatId, { image: Buffer.from(data), caption: '💻 Programming Image' }, { quoted: message });
        } catch (err) {
            await sock.sendMessage(chatId, { text: '❌ Could not fetch image. Please try again.' }, { quoted: message });
        }
    }
};