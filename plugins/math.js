const mathGames = {};
let mathListenerRegistered = false;

const LEVELS = ['noob', 'easy', 'normal', 'hard', 'extreme', 'impossible', 'impossible2'];

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

function levelBar(levelIndex) {
    return LEVELS.map((l, i) => i < levelIndex ? '✅' : i === levelIndex ? '🔵' : '⬜').join(' ');
}

async function startLevel(sock, chat, levelIndex, quotedMsg) {
    const mode = LEVELS[levelIndex];
    const math = genMath(mode);
    const label = mode.charAt(0).toUpperCase() + mode.slice(1);
    const bar = levelBar(levelIndex);
    const text = `🧮 *Math Challenge* — Level ${levelIndex + 1}/${LEVELS.length}: *${label}*\n${bar}\n\n*${math.str} = ?*\n\n⏱ ${(math.time / 1000).toFixed(0)}s to answer`;
    const sentMsg = await sock.sendMessage(chat, { text }, { quoted: quotedMsg });
    if (mathGames[chat]?.timeout) clearTimeout(mathGames[chat].timeout);
    mathGames[chat] = {
        msg: sentMsg, math, levelIndex,
        timeout: setTimeout(async () => {
            if (mathGames[chat]) {
                const ans = mathGames[chat].math.result;
                const reached = LEVELS[mathGames[chat].levelIndex];
                delete mathGames[chat];
                await sock.sendMessage(chat, {
                    text: `⏳ *Time's up!*\nAnswer was: *${ans}*\n\n🏁 You reached: *${reached.charAt(0).toUpperCase() + reached.slice(1)}*\nType *.math* to try again.`
                }, { quoted: sentMsg });
            }
        }, math.time)
    };
}

export default {
    command: 'math',
    aliases: ['maths'],
    category: 'games',
    description: 'Math challenge — progress from Noob to Impossible2',
    usage: '.math',
    async handler(sock, message, args, context) {
        const { chatId } = context;

        if (mathGames[chatId]) {
            return sock.sendMessage(chatId, {
                text: `⚠️ A math game is already running!\nSolve it or type *.stopmath* to cancel.`
            }, { quoted: mathGames[chatId].msg });
        }

        await sock.sendMessage(chatId, {
            text: `🧮 *Math Challenge Started!*\n\nAnswer correctly to advance through all 7 levels:\n*Noob → Easy → Normal → Hard → Extreme → Impossible → Impossible2*\n\nGetting ready…`
        }, { quoted: message });

        await startLevel(sock, chatId, 0, message);

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

                if (/^[.!]?stopmath$/i.test(body)) {
                    clearTimeout(mathGames[chat].timeout);
                    const reached = LEVELS[mathGames[chat].levelIndex];
                    delete mathGames[chat];
                    return sock.sendMessage(chat, {
                        text: `🛑 Game stopped.\n🏁 You reached: *${reached.charAt(0).toUpperCase() + reached.slice(1)}*`
                    }, { quoted: m });
                }

                if (!/^-?[0-9]+(\.[0-9]+)?$/.test(body)) return;

                const game = mathGames[chat];
                const correct = Number(body) === game.math.result;

                if (correct) {
                    clearTimeout(game.timeout);
                    const nextIndex = game.levelIndex + 1;

                    if (nextIndex >= LEVELS.length) {
                        // Beat all levels!
                        delete mathGames[chat];
                        return sock.sendMessage(chat, {
                            text: `✅ *Correct!*\n\n🏆 *YOU BEAT ALL 7 LEVELS!* 🏆\n\nNoob → Easy → Normal → Hard → Extreme → Impossible → Impossible2 ✅\n\n🎉 You're a math genius! Type *.math* to play again.`
                        }, { quoted: m });
                    }

                    const nextName = LEVELS[nextIndex];
                    await sock.sendMessage(chat, {
                        text: `✅ *Correct!* Advancing to *${nextName.charAt(0).toUpperCase() + nextName.slice(1)}*… 🔥`
                    }, { quoted: m });

                    await startLevel(sock, chat, nextIndex, m);
                } else {
                    clearTimeout(game.timeout);
                    const reached = LEVELS[game.levelIndex];
                    delete mathGames[chat];
                    return sock.sendMessage(chat, {
                        text: `❌ *Wrong!*\nCorrect answer: *${game.math.result}*\n\n🏁 You reached: *${reached.charAt(0).toUpperCase() + reached.slice(1)}*\nType *.math* to try again.`
                    }, { quoted: m });
                }
            });
        }
    }
};
