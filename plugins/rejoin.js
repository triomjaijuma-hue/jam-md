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

        // ── Helper: check if bot is admin in a group ──────────────────────────
        async function getBotAdminStatus(groupId) {
            try {
                const meta = await sock.groupMetadata(groupId);
                const botNum = (sock.user?.id || '').split(':')[0].split('@')[0];
                const botP = meta.participants?.find(p =>
                    p.id.split('@')[0].split(':')[0] === botNum
                );
                return {
                    meta,
                    isAdmin: botP?.admin === 'admin' || botP?.admin === 'superadmin',
                    inGroup: !!botP
                };
            } catch {
                return { meta: null, isAdmin: false, inGroup: false };
            }
        }

        // ── Helper: try getting invite code (admin only) ───────────────────────
        async function tryGetInviteLink(groupId) {
            try {
                const code = await sock.groupInviteCode(groupId);
                return code ? 'https://chat.whatsapp.com/' + code : null;
            } catch {
                return null;
            }
        }

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
                    text: '❌ *Could not join via that link.*\n\n*Reason:* ' + e.message + '\n\n_The link may be expired or revoked. Ask a group member for a fresh link._',
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
                    'Two ways to rejoin a group:',
                    '1️⃣  Leave a group while the bot is online — it records it automatically.',
                    '2️⃣  Paste the invite link:',
                    '   *.rejoin https://chat.whatsapp.com/XXXX*'
                ].join('\n'),
                ...channelInfo
            }, { quoted: message });
        }

        let record;
        try { record = JSON.parse(fs.readFileSync(dataPath, 'utf-8')); }
        catch {
            return await sock.sendMessage(chatId, {
                text: '❌ *Failed to read saved group data. The file may be corrupted.*\n\nTry: *.rejoin https://chat.whatsapp.com/XXXX*',
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

        // Check if bot is still in the group and get admin status
        const { meta: groupMeta, isAdmin: isBotAdmin, inGroup: isBotInGroup } = await getBotAdminStatus(groupId);

        if (!isBotInGroup) {
            // Bot was also removed — can't do anything from inside
            return await sock.sendMessage(chatId, {
                text: [
                    '❌ *Bot is no longer in that group.*',
                    '',
                    '*Group:* ' + groupName,
                    '',
                    'Since the bot was removed too, it cannot generate a link.',
                    'Ask someone still in the group to send you an invite link, then use:',
                    '*.rejoin https://chat.whatsapp.com/XXXX*'
                ].join('\n'),
                ...channelInfo
            }, { quoted: message });
        }

        // Check if owner is already back in the group
        const isOwnerInGroup = groupMeta?.participants?.some(p =>
            p.id.split('@')[0].split(':')[0] === ownerNumber
        );
        if (isOwnerInGroup) {
            return await sock.sendMessage(chatId, {
                text: '✅ *You are already in this group!*\n\n*Group:* ' + groupName,
                ...channelInfo
            }, { quoted: message });
        }

        // ── Try 1: Bot is admin → add owner directly ──────────────────────────
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
                }

                if (status === '408') {
                    // Invite was sent — notify owner
                    return await sock.sendMessage(chatId, {
                        text: '📨 *Invite sent to your number!*\n\n*Group:* ' + groupName + '\n\nCheck your WhatsApp notifications and accept the group invite.',
                        ...channelInfo
                    }, { quoted: message });
                }

                if (status === '403') {
                    // Privacy settings block direct add — fall through to invite link
                }
                // Any other status — fall through to invite link
            } catch (_addErr) {
                // Adding failed — fall through to invite link
            }
        }

        // ── Try 2: Generate invite link (works if bot is admin or group allows it) ──
        const inviteLink = await tryGetInviteLink(groupId);
        if (inviteLink) {
            return await sock.sendMessage(chatId, {
                text: [
                    '🔗 *Your rejoin link:*',
                    '',
                    '*Group:* ' + groupName,
                    '',
                    inviteLink,
                    '',
                    '_Tap the link to rejoin. Do not share it with others._'
                ].join('\n'),
                ...channelInfo
            }, { quoted: message });
        }

        // ── Try 3: Bot in group but not admin and can't get link ──────────────
        return await sock.sendMessage(chatId, {
            text: [
                '⚠️ *Could not auto-rejoin.*',
                '',
                '*Group:* ' + groupName,
                '*Bot admin:* ' + (isBotAdmin ? 'Yes' : 'No ← make bot admin for best results'),
                '',
                'To fix this:',
                '1. Ask a group member to promote the bot to admin.',
                '2. Then run *.rejoin* again.',
                '',
                'Or ask any group member to send you an invite link and use:',
                '*.rejoin https://chat.whatsapp.com/XXXX*'
            ].join('\n'),
            ...channelInfo
        }, { quoted: message });
    }
};
