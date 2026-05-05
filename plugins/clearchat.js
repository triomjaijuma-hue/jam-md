import isAdmin from '../lib/isAdmin.js';

export default {
    command: 'clearchat',
    aliases: ['deletechat', 'clc'],
    category: 'owner',
    description: 'Clear bot\'s local view of the current chat',
    usage: '.clearchat',

    async handler(sock, message, args, context) {
        const { chatId, channelInfo = {}, senderIsOwnerOrSudo = false } = context;
        const senderId = context.senderId || message.key.participant || message.key.remoteJid;
        const isGroup = chatId.endsWith('@g.us');

        if (isGroup && !senderIsOwnerOrSudo) {
            const { isSenderAdmin } = await isAdmin(sock, chatId, senderId);
            if (!isSenderAdmin) {
                return sock.sendMessage(chatId, {
                    text: '❌ Only group admins or the bot owner can use this.',
                    ...channelInfo
                }, { quoted: message });
            }
        }
        if (!isGroup && !senderIsOwnerOrSudo && !message.key.fromMe) {
            return sock.sendMessage(chatId, {
                text: '❌ Only the bot owner can clear DM chats.',
                ...channelInfo
            }, { quoted: message });
        }

        let cleared = false;

        // 1. Clear the bot's in-memory message store for this chat
        try {
            if (sock.store?.messages?.[chatId]) {
                sock.store.messages[chatId].clear?.();
                delete sock.store.messages[chatId];
                cleared = true;
            }
        } catch (_) {}

        // 2. Mark the entire chat as read (cleans unread badge)
        try { await sock.readMessages([message.key]); } catch (_) {}

        // 3. Try chatModify as best-effort (may silently fail on some sessions)
        try {
            await sock.chatModify({ clear: { messages: null } }, chatId);
            cleared = true;
        } catch (_) {}

        return sock.sendMessage(chatId, {
            text: cleared
                ? '🗑️ *Chat cleared from bot view!*\n_Messages removed from the bot\'s local storage for this chat._'
                : [
                    '✅ *Chat marked as read.*',
                    '',
                    '_Note: WhatsApp\'s API does not allow bots to delete chat history server-side.',
                    'To fully clear a chat, open WhatsApp → long-press the chat → More → Clear chat._'
                ].join('\n'),
            ...channelInfo
        }, { quoted: message });
    }
};
