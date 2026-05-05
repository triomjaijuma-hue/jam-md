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
import { dataFile } from '../lib/paths.js';

export default {
    command: 'rejoin',
    aliases: ['rjoin', 'backjoin'],
    category: 'owner',
    description: 'Rejoin the last group you left — or pass an invite link to join any group',
    usage: '.rejoin  OR  .rejoin https://chat.whatsapp.com/XXXX',
    ownerOnly: true,
    async handler(sock, message, args, context) {
        const { chatId, channelInfo, config } = context;
        const arg = (args || []).join(' ').trim();

        // ── MODE 1: invite link passed directly ───────────────────────────────
        const linkMatch = arg.match(/chat\.whatsapp\.com\/([A-Za-z0-9_-]+)/);
        if (linkMatch) {
            const code = linkMatch[1];
            try {
                await sock.sendMessage(chatId, {
                    text: '🔄 *Joining via invite link...*',
                    ...channelInfo
                }, { quoted: message });
                const groupId = await sock.groupAcceptInvite(code);
                return await sock.sendMessage(chatId, {
                    text: '✅ *Joined successfully!*\n\n*Group ID:* ' + (groupId || 'unknown') + '\n\nWelcome back!',
                    ...channelInfo
                }, { quoted: message });
            } catch (e) {
                return await sock.sendMessage(chatId, {
                    text: '❌ *Could not join via that link.*\n\n*Reason:* ' + e.message + '\n\n_The link may be expired or revoked._',
                    ...channelInfo
                }, { quoted: message });
            }
        }

        // ── MODE 2: use last-left-group record ────────────────────────────────
        const dataPath = dataFile('last_left_group.json');
        if (!fs.existsSync(dataPath)) {
            return await sock.sendMessage(chatId, {
                text: [
                    '❌ *No group recorded yet.*',
                    '',
                    'Two ways to rejoin:',
                    '1️⃣  Leave a group while the bot is online — it will remember automatically.',
                    '2️⃣  Paste the group invite link: *.rejoin https://chat.whatsapp.com/XXXX*'
                ].join('\n'),
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
        const ownerNumber = (config.ownerNumber || '').replace(/[^0-9]/g, '');
        const ownerJid = ownerNumber + '@s.whatsapp.net';
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
                text: '❌ *Bot is no longer in that group or the group no longer exists.*\n\n*Group:* ' + groupName + '\n\n_Ask someone inside for an invite link, then use:_\n*.rejoin https://chat.whatsapp.com/XXXX*',
                ...channelInfo
            }, { quoted: message });
        }

        const botNumber = (sock.user?.id || '').split(':')[0].split('@')[0];
        const botParticipant = groupMeta.participants?.find(p =>
            p.id.split('@')[0].split(':')[0] === botNumber
        );
        const isBotAdmin = botParticipant?.admin === 'admin' || botParticipant?.admin === 'superadmin';

        // Check if owner is already back
        const isOwnerInGroup = groupMeta.participants?.some(p =>
            p.id.split('@')[0].split(':')[0] === ownerNumber
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
                const status = String(result?.[0]?.status || '');
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
                // status 403 = privacy blocked → fall through to invite link
            } catch (_) { /* fall through to invite link */ }
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
