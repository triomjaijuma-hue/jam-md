import isAdmin from '../lib/isAdmin.js';
export default {
    command: 'clearchat',
    aliases: ['deletechat', 'clc'],
    category: 'owner',
    description: 'Clear messages in the current chat',
    usage: '.clearchat',
    async handler(sock, message, args, context) {
        const chatId = context.chatId || message.key.remoteJid;
        const channelInfo = context.channelInfo || {};
        const isGroup = chatId.endsWith('@g.us');
        const senderId = context.senderId || message.key.participant || message.key.remoteJid;
        const senderIsOwnerOrSudo = context.senderIsOwnerOrSudo || false;
        if (isGroup && !senderIsOwnerOrSudo) {
            const { isSenderAdmin } = await isAdmin(sock, chatId, senderId);
            if (!isSenderAdmin) {
                return await sock.sendMessage(chatId, { text: '❌ Only group admins or bot owner can clear this chat.', ...channelInfo }, { quoted: message });
            }
        }
        if (!isGroup && !senderIsOwnerOrSudo && !message.key.fromMe) {
            return await sock.sendMessage(chatId, { text: '❌ Only the bot owner can clear DM chats.', ...channelInfo }, { quoted: message });
        }
        try {
            await sock.chatModify({ clear: { messages: null } }, chatId);
            await sock.sendMessage(chatId, { text: '🗑️ *Chat cleared successfully!*', ...channelInfo }, { quoted: message });
        } catch (e) {
            try { await sock.readMessages([message.key]); } catch {}
            await sock.sendMessage(chatId, {
                text: '❌ Failed to clear chat: ' + e.message + '\n\n_WhatsApp limits clearing to the bot device view only._',
                ...channelInfo
            }, { quoted: message });
        }
    }
};