import isAdmin from '../lib/isAdmin.js';

export default {
    command: 'clearchat',
    aliases: ['deletechat', 'clc'],
    category: 'owner',
    description: 'Delete all messages in the current chat (bot\'s view)',
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

        // Collect all message keys from local store for this chat
        const storedMsgs = [];
        try {
            const chatMsgs = sock.store?.messages?.[chatId];
            if (Array.isArray(chatMsgs)) {
                for (const m of chatMsgs) {
                    if (m?.key?.id) storedMsgs.push(m.key);
                }
            }
        } catch (_) {}

        // Always include the triggering .clearchat message itself
        if (!storedMsgs.some(k => k.id === message.key.id)) {
            storedMsgs.push(message.key);
        }

        if (storedMsgs.length === 0) {
            // Nothing in store — wipe the store entry and mark read
            try { await sock.readMessages([message.key]); } catch (_) {}
            return sock.sendMessage(chatId, {
                text: '✅ *Chat is already empty in bot memory.*\n_No messages were found to delete._',
                ...channelInfo
            }, { quoted: message });
        }

        // Delete every message individually — no app state keys needed
        let deleted = 0;
        let failed = 0;
        for (const key of storedMsgs) {
            try {
                await sock.sendMessage(chatId, { delete: key });
                deleted++;
            } catch (_) {
                failed++;
            }
        }

        // Wipe the bot's local store for this chat
        try {
            if (sock.store?.messages?.[chatId]) {
                delete sock.store.messages[chatId];
            }
        } catch (_) {}

        // Mark as read
        try { await sock.readMessages([message.key]); } catch (_) {}

        const total = storedMsgs.length;
        return sock.sendMessage(chatId, {
            text: deleted === total
                ? `🗑️ *Chat cleared!*\n_${deleted} message${deleted !== 1 ? 's' : ''} deleted._`
                : `🗑️ *Cleared ${deleted}/${total} messages.*\n_${failed} could not be deleted (may have already been removed)._`,
            ...channelInfo
        }, { quoted: message });
    }
};
