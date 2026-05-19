const mathGames = {};
let mathListenerRegistered = false;

const modes = {
    noob:        [-3,               3,               -3,              3,              '+-',   15000],
    easy:        [-10,              10,              -10,             10,              '*/+-', 20000],
    normal:      [-40,              40,              -20,             20,              '*/+-', 40000],
    hard:        [-100,             100,             -70,             70,              '*/+-', 60000],
    extreme:     [-999999,          999999,          -999999,         999999,          '*/',   99999],
    impossible:  [-99999999999,     99999999999,     -99999999999,    999999999999,    '*/',   30000],
    impossible2: [-999999999999999, 999999999999999, -999,            999,             '/',    30000],
};
const operators = { '+': '+', '-': '-', '*': '×', '/': '÷' };

function genMath(mode) {
    const [a1, a2, b1, b2, ops, time] = modes[mode];
    let a = randomInt(a1, a2);
    const b = randomInt(b1, b2);
    const op = pickRandom([...ops]);
    const expr = `${a} ${op.replace('/', '*')} ${b < 0 ? `(${b})` : b}`;
    let result = eval(expr);
    if (op === '/') [a, result] = [result, a];
    return { str: `${a} ${operators[op]} ${b}`, mode, time, result };
}
function randomInt(from, to) {
    if (from > to) [from, to] = [to, from];
    return Math.floor(Math.random() * (Math.floor(to) - Math.ceil(from) + 1) + Math.ceil(from));
}
function pickRandom(list) { return list[Math.floor(Math.random() * list.length)]; }

async function startGame(sock, chat, mode, quotedMsg) {
    const math = genMath(mode);
    const modeLabel = mode.charAt(0).toUpperCase() + mode.slice(1);
    const text = `🧮 *Math Challenge* — _${modeLabel}_\n\n*${math.str} = ?*\n\n⏱ ${(math.time / 1000).toFixed(0)}s | 4 attempts`;
    const sentMsg = await sock.sendMessage(chat, { text }, { quoted: quotedMsg });
    mathGames[chat] = {
        msg: sentMsg, math, attempts: 4,
        timeout: setTimeout(() => {
            if (mathGames[chat]) {
                sock.sendMessage(chat, { text: `⏳ *Time's up!*\nAnswer was: *${math.result}*` }, { quoted: mathGames[chat].msg });
                delete mathGames[chat];
            }
        }, math.time)
    };
}

export default {
    command: 'math',
    aliases: ['maths'],
    category: 'games',
    description: 'Solve a math problem',
    usage: '.math [noob|easy|normal|hard|extreme|impossible|impossible2]',
    async handler(sock, message, args, context) {
        const { chatId } = context;

        if (mathGames[chatId]) {
            return sock.sendMessage(chatId, {
                text: `⚠️ Finish the current problem first!\nOr type *.stopmath* to cancel.`
            }, { quoted: mathGames[chatId].msg });
        }

        const input = args[0]?.toLowerCase();
        const mode = (input && input in modes) ? input : 'normal';

        if (input && !(input in modes)) {
            return sock.sendMessage(chatId, {
                text: `❓ Unknown difficulty: *${input}*\n\nChoose: ${Object.keys(modes).join(' | ')}\n\nExample: *.math hard*`
            }, { quoted: message });
        }

        await startGame(sock, chatId, mode, message);

        if (!mathListenerRegistered) {
            mathListenerRegistered = true;
            sock.ev.on('messages.upsert', async (upsert) => {
                const m = upsert.messages[0];
                if (!m || !m.message || m.key.fromMe) return;
                const chat = m.key.remoteJid;
                if (!mathGames[chat]) return;

                const body = (
                    m.message.conversation ||
                    m.message.extendedTextMessage?.text ||
                    ''
                ).trim();

                // stopmath cancels the game
                if (/^[.!]?stopmath$/i.test(body)) {
                    clearTimeout(mathGames[chat].timeout);
                    const ans = mathGames[chat].math.result;
                    delete mathGames[chat];
                    return sock.sendMessage(chat, { text: `🛑 Game stopped.\nAnswer was: *${ans}*` }, { quoted: m });
                }

                if (!/^-?[0-9]+(\.[0-9]+)?$/.test(body)) return;

                const game = mathGames[chat];
                if (Number(body) === game.math.result) {
                    clearTimeout(game.timeout);
                    delete mathGames[chat];
                    return sock.sendMessage(chat, { text: `✅ *Correct!* Well done 🎉` }, { quoted: m });
                }

                game.attempts--;
                if (game.attempts <= 0) {
                    clearTimeout(game.timeout);
                    delete mathGames[chat];
                    return sock.sendMessage(chat, { text: `❌ *Game Over!*\nCorrect answer: *${game.math.result}*` }, { quoted: m });
                }
                return sock.sendMessage(chat, { text: `❎ Wrong! *${game.attempts}* attempt${game.attempts === 1 ? '' : 's'} left.` }, { quoted: m });
            });
        }
    }
};
