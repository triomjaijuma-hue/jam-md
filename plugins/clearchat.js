import isAdmin from '../lib/isAdmin.js';

export default {
    command: 'clearchat',
    aliases: ['deletechat', 'clc'],
    category: 'owner',
    description: 'Clear all messages in the current chat',
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

        // Build lastMessages list from local store (Baileys requires this for clear to work)
        const lastMessages = [];
        try {
            const chatMsgs = sock.store?.messages?.[chatId];
            if (chatMsgs?.array) {
                for (const m of [...chatMsgs.array].slice(-50)) {
                    if (m?.key?.id) {
                        lastMessages.push({ key: m.key, messageTimestamp: m.messageTimestamp });
                    }
                }
            }
        } catch (_) {}

        // Always include the triggering message as a reference point
        if (!lastMessages.some(m => m.key.id === message.key.id)) {
            lastMessages.push({ key: message.key, messageTimestamp: message.messageTimestamp });
        }

        // Also wipe bot's in-memory store for this chat
        try {
            if (sock.store?.messages?.[chatId]) {
                sock.store.messages[chatId].clear?.();
                delete sock.store.messages[chatId];
            }
        } catch (_) {}

        // Mark chat as read
        try { await sock.readMessages([message.key]); } catch (_) {}

        // Call chatModify clear with lastMessages — this is what WhatsApp actually needs
        try {
            await sock.chatModify({
                clear: { messages: null, keepStarred: false },
                lastMessages
            }, chatId);

            return sock.sendMessage(chatId, {
                text: '🗑️ *Chat cleared!*\n_All messages have been wiped from this chat._',
                ...channelInfo
            }, { quoted: message });
        } catch (e) {
            // Second attempt: use specific message keys from lastMessages
            try {
                const msgKeys = lastMessages.map(m => ({
                    id: m.key.id,
                    fromMe: m.key.fromMe || false,
                    timestamp: Number(m.messageTimestamp || 0)
                }));
                await sock.chatModify({
                    clear: { messages: msgKeys },
                    lastMessages
                }, chatId);

                return sock.sendMessage(chatId, {
                    text: '🗑️ *Chat cleared!*\n_Recent messages wiped from this chat._',
                    ...channelInfo
                }, { quoted: message });
            } catch (e2) {
                return sock.sendMessage(chatId, {
                    text: [
                        '⚠️ *Could not clear chat automatically.*',
                        '',
                        '_WhatsApp\'s API rejected the request: ' + e2.message + '_',
                        '',
                        'To fully clear, open WhatsApp → long-press this chat → *More* → *Clear chat*.'
                    ].join('\n'),
                    ...channelInfo
                }, { quoted: message });
            }
        }
    }
};
