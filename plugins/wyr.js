const QUESTIONS = [
    // Fun & social
    ['Always be 10 minutes late to everything', 'Always be 10 minutes early to everything'],
    ['Live in a world with no internet', 'Live in a world with no music'],
    ['Have the ability to fly', 'Have the ability to be invisible'],
    ['Always speak your mind', 'Never speak again'],
    ['Be the funniest person in the room', 'Be the smartest person in the room'],
    ['Have free food for life', 'Have free Wi-Fi for life'],
    ['Only be able to whisper', 'Only be able to shout'],
    ['Never use social media again', 'Never watch movies or TV again'],
    ['Have unlimited money but no friends', 'Have great friends but always be broke'],
    ['Live without your phone for a year', 'Live without showering for a month'],
    ['Always know when someone is lying', 'Always get away with lying'],
    ['Be famous but unhappy', 'Be unknown but always happy'],
    ['Have the power to read minds', 'Have the power to see the future'],
    ['Eat only your favourite food forever', 'Never eat your favourite food again'],
    ['Be 3 meters tall', 'Be 1 meter tall'],
    ['Never sleep again', 'Never wake up late again'],
    ['Speak every language fluently', 'Play every instrument perfectly'],
    ['Be always too hot', 'Be always too cold'],
    ['Have a rewind button for your life', 'Have a pause button for your life'],
    ['Know how you die', 'Know when you die'],
    ['Give up bathing for a month', 'Give up your phone for a month'],
    ['Fight 100 duck-sized horses', 'Fight 1 horse-sized duck'],
    ['Only eat spicy food for life', 'Only eat plain rice for life'],
    ['Be stranded on a desert island alone', 'Be stranded with someone you dislike'],
    ['Have a photographic memory', 'Have an IQ of 200'],
    ['Be able to control fire', 'Be able to control water'],
    ['Never lie but be rude', 'Always lie but be polite'],
    ['Win UGX 10 million tomorrow', 'Earn UGX 1 million every month for life'],
    ['Live in Kampala your whole life', 'Travel the world but never settle'],
    ['Have Elon Musk\'s money', 'Have Einstein\'s intelligence'],
    // Uganda flavour
    ['Eat matoke every day for life', 'Never eat matoke again'],
    ['Travel from Kampala to Gulu by taxi', 'Walk from Kampala to Entebbe'],
    ['Live in Nakasero with no electricity', 'Live in Kireka with reliable power'],
    ['Drink rolex for every meal', 'Drink posho and beans for every meal'],
    ['Own a boda boda business in Kampala', 'Own a maize farm in eastern Uganda'],
    ['Never use Airtel again', 'Never use MTN again'],
    ['Always speak Luganda, even abroad', 'Forget Luganda completely'],
    ['Study at Makerere with no money', 'Study at a private uni on full scholarship'],
    ['Win Big Eye in Uganda', 'Win a seat on Parliament'],
    ['Live near Owino market', 'Live next to Nakasero market'],
];

function pick() {
    return QUESTIONS[Math.floor(Math.random() * QUESTIONS.length)];
}

export default {
    command: 'wyr',
    aliases: ['wouldyourather', 'wurather'],
    category: 'games',
    description: 'Would You Rather — pick one!',
    usage: '.wyr',

    async handler(sock, message, args, context) {
        const { chatId } = context;
        const [opt1, opt2] = pick();
        const text = [
            `🤔 *Would You Rather…?*`,
            ``,
            `🅰️ ${opt1}`,
            ``,
            `        *— OR —*`,
            ``,
            `🅱️ ${opt2}`,
            ``,
            `_Reply A or B — what's your pick?_ 😅`
        ].join('\n');
        await sock.sendMessage(chatId, { text }, { quoted: message });
    }
};
