import axios from 'axios';

// Decode HTML entities from OpenTDB API responses
function decode(str) {
    return String(str)
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#039;/g, "'")
        .replace(/&ldquo;/g, '"')
        .replace(/&rdquo;/g, '"')
        .replace(/&lsquo;/g, "'")
        .replace(/&rsquo;/g, "'")
        .replace(/&ndash;/g, '–')
        .replace(/&mdash;/g, '—')
        .replace(/&hellip;/g, '...')
        .replace(/&eacute;/g, 'é')
        .replace(/&agrave;/g, 'à')
        .replace(/&ouml;/g, 'ö')
        .replace(/&uuml;/g, 'ü')
        .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

// Shuffles array in-place
function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

// Fallback questions used when OpenTDB is unavailable
const FALLBACK = [
    { q: 'What is the capital of Uganda?', correct: 'Kampala', wrong: ['Entebbe', 'Gulu', 'Jinja'] },
    { q: 'How many sides does a hexagon have?', correct: '6', wrong: ['5', '7', '8'] },
    { q: 'Which planet is closest to the Sun?', correct: 'Mercury', wrong: ['Venus', 'Earth', 'Mars'] },
    { q: 'What is 12 × 12?', correct: '144', wrong: ['124', '132', '148'] },
    { q: 'Who wrote Romeo and Juliet?', correct: 'William Shakespeare', wrong: ['Charles Dickens', 'Jane Austen', 'Mark Twain'] },
    { q: 'What is the largest continent?', correct: 'Asia', wrong: ['Africa', 'Europe', 'North America'] },
    { q: 'Which gas do plants absorb from the air?', correct: 'Carbon Dioxide', wrong: ['Oxygen', 'Nitrogen', 'Hydrogen'] },
    { q: 'How many months have 31 days?', correct: '7', wrong: ['5', '6', '8'] },
    { q: 'What is the national animal of Uganda?', correct: 'Grey Crowned Crane', wrong: ['Lion', 'Elephant', 'Gorilla'] },
    { q: 'In what year did World War II end?', correct: '1945', wrong: ['1939', '1943', '1950'] },
    { q: 'What is the largest organ in the human body?', correct: 'Skin', wrong: ['Liver', 'Heart', 'Lungs'] },
    { q: 'Which ocean is the largest?', correct: 'Pacific Ocean', wrong: ['Atlantic Ocean', 'Indian Ocean', 'Arctic Ocean'] },
    { q: 'What is H₂O commonly known as?', correct: 'Water', wrong: ['Salt', 'Hydrogen', 'Oxygen'] },
    { q: 'How many teeth does an adult human have?', correct: '32', wrong: ['28', '30', '34'] },
    { q: 'What is the fastest land animal?', correct: 'Cheetah', wrong: ['Lion', 'Horse', 'Leopard'] },
    { q: 'Which country has the most natural lakes?', correct: 'Canada', wrong: ['Brazil', 'Russia', 'USA'] },
    { q: 'What is 15% of 200?', correct: '30', wrong: ['25', '35', '40'] },
    { q: 'What language do people speak in Brazil?', correct: 'Portuguese', wrong: ['Spanish', 'English', 'French'] },
    { q: 'Which is the smallest country in the world?', correct: 'Vatican City', wrong: ['Monaco', 'San Marino', 'Liechtenstein'] },
    { q: 'How many strings does a standard guitar have?', correct: '6', wrong: ['4', '5', '7'] }
];

const triviaGames = {};
const TIMEOUT_MS = 60000; // 60 seconds

async function fetchQuestion() {
    try {
        const res = await axios.get('https://opentdb.com/api.php?amount=1&type=multiple', { timeout: 8000 });
        if (res.data?.response_code === 0 && res.data.results?.length) {
            const q = res.data.results[0];
            const options = shuffle([...q.incorrect_answers, q.correct_answer]);
            return {
                question: decode(q.question),
                correctAnswer: decode(q.correct_answer),
                options: options.map(decode),
                category: decode(q.category),
                difficulty: q.difficulty
            };
        }
    } catch {}

    // Fallback to local questions
    const fb = FALLBACK[Math.floor(Math.random() * FALLBACK.length)];
    const options = shuffle([...fb.wrong, fb.correct]);
    return {
        question: fb.q,
        correctAnswer: fb.correct,
        options,
        category: 'games',
        difficulty: 'medium',
        isLocal: true
    };
}

const LABELS = ['A', 'B', 'C', 'D'];

function buildQuestionText(game) {
    const diffEmoji = { easy: '🟢', medium: '🟡', hard: '🔴' }[game.difficulty] || '🔵';
    const optionsText = game.options.map((opt, i) => `*${LABELS[i]}.* ${opt}`).join('\n');
    return (
        `🎯 *TRIVIA TIME!*\n` +
        `━━━━━━━━━━━━━━━━━━━\n\n` +
        `📂 *Category:* ${game.category}\n` +
        `${diffEmoji} *Difficulty:* ${game.difficulty}\n\n` +
        `❓ *Question:*\n${game.question}\n\n` +
        `*Options:*\n${optionsText}\n\n` +
        `━━━━━━━━━━━━━━━━━━━\n` +
        `_Reply with *A*, *B*, *C*, or *D*  •  ⏱ 60 seconds_\n` +
        `_Use .stoptrivia to cancel_`
    );
}

// ── Exported: called by messageHandler for plain A/B/C/D replies ────────────
export async function handleTriviaReply(sock, chatId, senderId, letter, message, channelInfo) {
    if (!LABELS.includes(letter)) return false;
    const game = triviaGames[chatId];
    if (!game) return false;
    const chosen = game.options[LABELS.indexOf(letter)];
    const isCorrect = chosen?.toLowerCase() === game.correctAnswer.toLowerCase();
    clearTimeout(game.timer);
    delete triviaGames[chatId];
    const senderJid = senderId || message.key.participant || message.key.remoteJid;
    if (isCorrect) {
        await sock.sendMessage(chatId, {
            text: `🎉 *@${senderJid.split('@')[0]} got it!*\n\n✅ *${letter}. ${chosen}* is correct!\n\n_Play again with .trivia_ 🎯`,
            mentions: [senderJid],
            ...channelInfo
        }, { quoted: message });
    } else {
        await sock.sendMessage(chatId, {
            text: `❌ *@${senderJid.split('@')[0]} is wrong!*\n\n_Picked:_ ${letter}. ${chosen}\n✅ *Correct answer:* ${game.correctAnswer}\n\n_Play again with .trivia_ 🎯`,
            mentions: [senderJid],
            ...channelInfo
        }, { quoted: message });
    }
    return true;
}

export default {
    command: 'trivia',
    aliases: ['quiz', 'stoptrivia', 'triviastop'],
    category: 'games',
    description: 'Start a trivia quiz — answer A/B/C/D to win!',
    usage: '.trivia to start | reply A/B/C/D to answer | .stoptrivia to stop',

    async handler(sock, message, args, context) {
        const { chatId, channelInfo } = context;
        const raw = (
            message.message?.conversation ||
            message.message?.extendedTextMessage?.text || ''
        ).trim();
        const cmdUsed = raw.slice(1).split(/\s+/)[0].toLowerCase();

        // ── Stop command ──────────────────────────────────────────────
        if (['stoptrivia', 'triviastop'].includes(cmdUsed)) {
            if (!triviaGames[chatId]) {
                return sock.sendMessage(chatId, {
                    text: '❌ No trivia game is running right now.',
                    ...channelInfo
                }, { quoted: message });
            }
            const game = triviaGames[chatId];
            clearTimeout(game.timer);
            delete triviaGames[chatId];
            return sock.sendMessage(chatId, {
                text: `🛑 *Trivia stopped!*\n\nThe correct answer was: *${game.correctAnswer}*`,
                ...channelInfo
            }, { quoted: message });
        }

        // ── Answer A/B/C/D ────────────────────────────────────────────
        const singleArg = args[0]?.toUpperCase();
        if (singleArg && LABELS.includes(singleArg) && triviaGames[chatId]) {
            const game = triviaGames[chatId];
            const chosen = game.options[LABELS.indexOf(singleArg)];
            const isCorrect = chosen?.toLowerCase() === game.correctAnswer.toLowerCase();
            clearTimeout(game.timer);
            delete triviaGames[chatId];

            const senderJid = message.key.participant || message.key.remoteJid;
            if (isCorrect) {
                return sock.sendMessage(chatId, {
                    text: `🎉 *@${senderJid.split('@')[0]} got it!*\n\n✅ *${singleArg}. ${chosen}* is correct!\n\n_Play again with .trivia_ 🎯`,
                    mentions: [senderJid],
                    ...channelInfo
                }, { quoted: message });
            } else {
                return sock.sendMessage(chatId, {
                    text: `❌ *@${senderJid.split('@')[0]} is wrong!*\n\n_You picked:_ ${singleArg}. ${chosen}\n✅ *Correct answer:* ${game.correctAnswer}\n\n_Play again with .trivia_ 🎯`,
                    mentions: [senderJid],
                    ...channelInfo
                }, { quoted: message });
            }
        }

        // ── Already running ─────────────────────────────────────────
        if (triviaGames[chatId]) {
            const game = triviaGames[chatId];
            const elapsed = Math.floor((Date.now() - game.startTime) / 1000);
            const remaining = Math.max(0, 60 - elapsed);
            return sock.sendMessage(chatId, {
                text: `⚠️ A trivia question is already active!\n\n${buildQuestionText(game)}\n\n⏱️ *${remaining}s remaining*`,
                ...channelInfo
            }, { quoted: message });
        }

        // ── Start new trivia ─────────────────────────────────────────
        await sock.sendMessage(chatId, {
            react: { text: '⏳', key: message.key }
        });

        const game = await fetchQuestion();
        game.startTime = Date.now();

        game.timer = setTimeout(async () => {
            try {
                if (triviaGames[chatId]) {
                    const g = triviaGames[chatId];
                    delete triviaGames[chatId];
                    await sock.sendMessage(chatId, {
                        text: `⏰ *Time's up! Nobody answered.*\n\n✅ The correct answer was: *${g.correctAnswer}*\n\n_Start a new one with .trivia_ 🎯`
                    });
                }
            } catch (_e) {
                delete triviaGames[chatId];
            }
        }, TIMEOUT_MS);

        triviaGames[chatId] = game;
        await sock.sendMessage(chatId, {
            text: buildQuestionText(game),
            ...channelInfo
        }, { quoted: message });
    }
};
