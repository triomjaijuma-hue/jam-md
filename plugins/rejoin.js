/*****************************************************************************
 *                                                                           *
 *                     Developed By Jaiton fangs                                *
 *                                                                           *
 *  🌐  GitHub   : https://github.com/JAM-MD                         *
 *  ▶️  YouTube  : https://youtube.com/@JAM-MD                       *
 *  💬  WhatsApp :                                                           *
 *                                                                           *
 *    © 2026 JAM-MD. All rights reserved.                            *
 *                                                                           *
 *    Description: Rejoin the last group owner left, without needing a link. *
 *                                                                           *
 *****************************************************************************/
import fs from 'fs';

export default {
    command: 'rejoin',
    aliases: ['rjoin', 'backjoin'],
    category: 'owner',
    description: 'Rejoin the last group you left — no link needed',
    usage: '.rejoin',
    ownerOnly: true,
    async handler(sock, message, args, context) {
        const { chatId, channelInfo, config } = context;

        const dataPath = './data/last_left_group.json';
        if (!fs.existsSync(dataPath)) {
            return await sock.sendMessage(chatId, {
                text: '❌ *No group recorded yet.*\n\nThe bot will remember the next group you leave, then *.rejoin* will bring you back instantly.',
                ...channelInfo
            }, { quoted: message });
        }

        let record;
        try { record = JSON.parse(fs.readFileSync(dataPath, 'utf-8')); }
        catch {
            return await sock.sendMessage(chatId, {
                text: '❌ *Failed to read saved group data.*',
                ...channelInfo
            }, { quoted: message });
        }

        const { groupId, groupName, leftAt } = record;
        const ownerJid = (config.ownerNumber || '').replace(/[^0-9]/g, '') + '@s.whatsapp.net';
        const timeAgo = leftAt ? Math.round((Date.now() - leftAt) / 60000) : '?';

        await sock.sendMessage(chatId, {
            text: '🔄 *Trying to rejoin...*\n\n*Group:* ' + groupName + '\n*Left:* ' + timeAgo + ' minute(s) ago',
            ...channelInfo
        }, { quoted: message });

        // Check if bot is still in the group
        let groupMeta;
        try {
            groupMeta = await sock.groupMetadata(groupId);
        } catch {
            return await sock.sendMessage(chatId, {
                text: '❌ *Bot is no longer in that group.*\n\n*Group:* ' + groupName + '\n\nAsk someone inside for an invite link.',
                ...channelInfo
            }, { quoted: message });
        }

        const botId = (sock.user?.id?.split(':')[0] || '') + '@s.whatsapp.net';
        const botParticipant = groupMeta.participants?.find(p =>
            p.id.split('@')[0] === botId.split('@')[0]
        );
        const isBotAdmin = botParticipant?.admin === 'admin' || botParticipant?.admin === 'superadmin';

        // Check if owner is already back
        const isOwnerInGroup = groupMeta.participants?.some(p =>
            p.id.split('@')[0] === ownerJid.split('@')[0]
        );
        if (isOwnerInGroup) {
            return await sock.sendMessage(chatId, {
                text: '✅ *You are already in this group!*\n\n*Group:* ' + groupName,
                ...channelInfo
            }, { quoted: message });
        }

        // Bot is admin → add owner directly
        if (isBotAdmin) {
            try {
                const result = await sock.groupParticipantsUpdate(groupId, [ownerJid], 'add');
                const status = result?.[0]?.status;
                if (status === '200') {
                    try { fs.unlinkSync(dataPath); } catch {}
                    return await sock.sendMessage(chatId, {
                        text: '✅ *Rejoined successfully!*\n\n*Group:* ' + groupName + '\n\nWelcome back!',
                        ...channelInfo
                    }, { quoted: message });
                } else if (status === '408') {
                    return await sock.sendMessage(chatId, {
                        text: '⚠️ *Invite sent!*\n\n*Group:* ' + groupName + '\n\nCheck your WhatsApp notifications and accept the invite.',
                        ...channelInfo
                    }, { quoted: message });
                }
                // 403 or other → fall through to invite link
            } catch (_e) { /* fall through */ }
        }

        // Fallback: generate and send invite link
        try {
            const inviteCode = await sock.groupInviteCode(groupId);
            const inviteLink = 'https://chat.whatsapp.com/' + inviteCode;
            return await sock.sendMessage(chatId, {
                text: '🔗 *Your rejoin link:*\n\n*Group:* ' + groupName + '\n\n' + inviteLink + '\n\n_Tap to rejoin. Do not share this link._',
                ...channelInfo
            }, { quoted: message });
        } catch (e) {
            return await sock.sendMessage(chatId, {
                text: '❌ *Could not generate link.*\n\n*Reason:* ' + e.message + '\n\nMake the bot an admin in the group for best results.',
                ...channelInfo
            }, { quoted: message });
        }
    }
};
