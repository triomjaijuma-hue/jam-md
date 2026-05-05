import isAdmin from '../lib/isAdmin.js';

export default {
    command: 'clearchat',
    aliases: ['deletechat', 'clc'],
    category: 'owner',
    description: 'Clear messages in the current chat (bot device view)',
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

        // ── Attempt 1: direct chatModify clear ────────────────────────────────
        const tryClear = async () => {
            await sock.chatModify({ clear: { messages: null } }, chatId);
        };

        try {
            await tryClear();
            return sock.sendMessage(chatId, {
                text: '🗑️ *Chat cleared!*\n_Messages removed from the bot device view._',
                ...channelInfo
            }, { quoted: message });
        } catch (e1) {
            const isKeyError = e1.message?.includes('AppStateKey') ||
                               e1.message?.includes('appStateKey') ||
                               e1.message?.includes('myAppStateKey') ||
                               e1.message?.includes('not present');

            if (!isKeyError) {
                // Some other error — surface it
                return sock.sendMessage(chatId, {
                    text: `❌ Clear failed: ${e1.message}`,
                    ...channelInfo
                }, { quoted: message });
            }

            // ── Attempt 2: trigger app-state resync, then retry ───────────────
            await sock.sendMessage(chatId, {
                text: '🔄 _Syncing session keys — retrying clear…_',
                ...channelInfo
            }, { quoted: message });

            try {
                if (typeof sock.resyncAppState === 'function') {
                    await sock.resyncAppState([
                        'critical_block', 'critical_unblock_low',
                        'regular_high', 'regular_low', 'default'
                    ]);
                    // Give Baileys a moment to apply the sync
                    await new Promise(r => setTimeout(r, 3000));
                }
                await tryClear();
                return sock.sendMessage(chatId, {
                    text: '🗑️ *Chat cleared!*\n_Messages removed from the bot device view._',
                    ...channelInfo
                }, { quoted: message });
            } catch (e2) {
                // Resync attempt also failed — tell user what to do
                return sock.sendMessage(chatId, {
                    text: [
                        '⚠️ *Chat could not be cleared automatically.*',
                        '',
                        '_WhatsApp requires the bot session to be fully synced before it can modify chat history. This usually resolves itself within a few minutes after the bot starts._',
                        '',
                        '*What you can do:*',
                        '  1. Wait 2–3 minutes and try again.',
                        '  2. Restart the bot and wait for the session sync to complete, then try again.',
                        '  3. Clear the chat manually from your WhatsApp app.',
                        '',
                        `_Technical detail: ${e2.message}_`
                    ].join('\n'),
                    ...channelInfo
                }, { quoted: message });
            }
        }
    }
};
