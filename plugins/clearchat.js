import isAdmin from '../lib/isAdmin.js';

export default {
    command: 'clearchat',
    aliases: ['deletechat', 'clc'],
    category: 'admin',
    description: 'Wipe entire chat history and leave it blank',
    usage: '.clearchat',
    ownerOnly: true,
    async handler(sock, message, args, context) {
        const chatId = context.chatId || message.key.remoteJid;
        const channelInfo = context.channelInfo || {};
        const isGroup = chatId.endsWith('@g.us');
        const senderId = context.senderId || message.key.participant || message.key.remoteJid;
        const senderIsOwnerOrSudo = context.senderIsOwnerOrSudo || false;

        // Permission check
        if (isGroup && !senderIsOwnerOrSudo) {
            const { isSenderAdmin } = await isAdmin(sock, chatId, senderId);
            if (!isSenderAdmin) {
                return await sock.sendMessage(chatId, {
                    text: '❌ Only group admins or bot owner can clear this chat.',
                    ...channelInfo
                }, { quoted: message });
            }
        }
        if (!isGroup && !senderIsOwnerOrSudo && !message.key.fromMe) {
            return await sock.sendMessage(chatId, {
                text: '❌ Only the bot owner can clear DM chats.',
                ...channelInfo
            }, { quoted: message });
        }

        try {
            // Step 1: Clear all messages from local chat store (wipes visible history)
            await sock.chatModify({ clear: { messages: null } }, chatId);

            // Step 2: Archive then unarchive — forces a full refresh on the client
            try {
                await sock.chatModify({ archive: true, lastMessages: [] }, chatId);
                await new Promise(r => setTimeout(r, 500));
                await sock.chatModify({ archive: false, lastMessages: [] }, chatId);
            } catch {}

            // Step 3: Send a brief confirmation, then self-delete it so chat stays blank
            const sent = await sock.sendMessage(chatId, {
                text: '🗑️ Chat cleared.',
                ...channelInfo
            });

            // Delete the confirmation message after 2 seconds — leaves chat visually blank
            if (sent?.key) {
                await new Promise(r => setTimeout(r, 2000));
                await sock.sendMessage(chatId, { delete: sent.key });
            }

        } catch (e) {
            await sock.sendMessage(chatId, {
                text: '❌ Failed to clear chat: ' + e.message,
                ...channelInfo
            }, { quoted: message });
        }
    }
};