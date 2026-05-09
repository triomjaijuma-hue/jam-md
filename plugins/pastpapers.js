/*****************************************************************************
 *                                                                           *
 *                     Developed By TrailerUps Dev                          *
 *                                                                           *
 *  🌐  GitHub   : https://github.com/TRAILER-UPS                          *
 *  ▶️  YouTube  : https://youtube.com/@TRAILER-UPS                        *
 *                                                                           *
 *    © 2026 TRAILER-UPS. All rights reserved.                             *
 *                                                                           *
 *    Description: Uganda UNEB Past Papers — PLE, UCE, UACE                *
 *                                                                           *
 *****************************************************************************/

const PAPERS = {
    ple: {
        label: '📚 PLE (Primary Leaving Examination)',
        subjects: {
            english:   { name: 'English Language',    code: 'ENG' },
            math:      { name: 'Mathematics',         code: 'MTH' },
            science:   { name: 'Science',             code: 'SCI' },
            sst:       { name: 'Social Studies & RE', code: 'SST' },
        },
        sources: [
            { name: 'UNEB Official',      url: 'https://www.uneb.ac.ug/past-papers/' },
            { name: 'Uganda School News', url: 'https://www.ugandaschoolnews.com/ple-past-papers/' },
            { name: 'Kasaana.com',        url: 'https://kasaana.com/ple-past-papers/' },
            { name: 'Revision Uganda',    url: 'https://revisionuganda.com/ple/' },
        ],
        info: 'PLE is sat by P.7 pupils (around age 12–14). Papers cover 4 subjects.',
    },
    uce: {
        label: '📗 UCE (Uganda Certificate of Education)',
        subjects: {
            english:   { name: 'English Language',        code: '101' },
            math:      { name: 'Mathematics',             code: '121' },
            biology:   { name: 'Biology',                 code: '111' },
            chemistry: { name: 'Chemistry',               code: '112' },
            physics:   { name: 'Physics',                 code: '113' },
            history:   { name: 'History',                 code: '013' },
            geography: { name: 'Geography',               code: '014' },
            cre:       { name: 'Christian Religious Edu', code: '015' },
            ire:       { name: 'Islamic Religious Edu',   code: '016' },
            commerce:  { name: 'Commerce',                code: '035' },
            economics: { name: 'Economics',               code: '036' },
            computer:  { name: 'Computer Studies',        code: '801' },
            kiswahili: { name: 'Kiswahili',               code: '051' },
            agriculture:{ name: 'Agriculture',            code: '040' },
            art:       { name: 'Art',                     code: '060' },
            lit:       { name: 'Literature in English',   code: '102' },
        },
        sources: [
            { name: 'UNEB Official',      url: 'https://www.uneb.ac.ug/past-papers/' },
            { name: 'Uganda School News', url: 'https://www.ugandaschoolnews.com/uce-past-papers/' },
            { name: 'Kasaana.com',        url: 'https://kasaana.com/uce-past-papers/' },
            { name: 'Revision Uganda',    url: 'https://revisionuganda.com/uce/' },
            { name: 'SchoolNet Uganda',   url: 'http://www.schoolnetuganda.sc.ug/past-papers' },
        ],
        info: 'UCE is sat by S.4 students. Compulsory: English & Math. Min 8 subjects total.',
    },
    uace: {
        label: '📘 UACE (Uganda Advanced Certificate of Education)',
        subjects: {
            gp:        { name: 'General Paper',          code: '116' },
            math:      { name: 'Mathematics',            code: '425' },
            biology:   { name: 'Biology',                code: '401' },
            chemistry: { name: 'Chemistry',              code: '402' },
            physics:   { name: 'Physics',                code: '403' },
            history:   { name: 'History',                code: '417' },
            geography: { name: 'Geography',              code: '415' },
            cre:       { name: 'Christian Religious Edu','code': '414' },
            economics: { name: 'Economics',              code: '416' },
            computer:  { name: 'Computer Studies',       code: '421' },
            kiswahili: { name: 'Kiswahili',              code: '435' },
            literature: { name: 'Literature in English', code: '412' },
            agriculture:{ name: 'Agriculture',           code: '426' },
            art:       { name: 'Art',                    code: '455' },
            accounts:  { name: 'Entrepreneurship/Accts', code: '432' },
            subsidiary: { name: 'Sub Math / Sub ICT',   code: '435' },
        },
        sources: [
            { name: 'UNEB Official',      url: 'https://www.uneb.ac.ug/past-papers/' },
            { name: 'Uganda School News', url: 'https://www.ugandaschoolnews.com/uace-past-papers/' },
            { name: 'Kasaana.com',        url: 'https://kasaana.com/uace-past-papers/' },
            { name: 'Revision Uganda',    url: 'https://revisionuganda.com/uace/' },
            { name: 'SchoolNet Uganda',   url: 'http://www.schoolnetuganda.sc.ug/past-papers' },
        ],
        info: 'UACE is sat by S.6 students. Compulsory: General Paper. Choose 3 principal subjects.',
    },
};

export default {
    command: 'pastpapers',
    aliases: ['papers', 'uneb', 'ple', 'uce', 'uace', 'exampapers'],
    category: 'education',
    description: 'Get Uganda UNEB past papers — PLE, UCE, UACE',
    usage: '.papers [ple|uce|uace] [subject]',
    async handler(sock, message, args, context) {
        const { chatId, channelInfo } = context;

        const level = (args[0] || '').toLowerCase();
        const subject = (args[1] || '').toLowerCase();

        // ── Main menu ──────────────────────────────────────────────────────
        if (!level || !PAPERS[level]) {
            const text = `📚 *TRAILER-UPS — Uganda UNEB Past Papers*\n\n` +
                `Get past papers for any Uganda national exam:\n\n` +
                `📌 *.papers ple* — Primary Leaving Exam (P.7)\n` +
                `📌 *.papers uce* — Uganda Certificate of Education (S.4)\n` +
                `📌 *.papers uace* — Uganda Advanced Certificate (S.6)\n\n` +
                `_Example: *.papers uce math* to get Maths UCE papers_\n\n` +
                `━━━━━━━━━━━━━━━━━━━\n` +
                `🌐 *Official UNEB site:*\nhttps://www.uneb.ac.ug/past-papers/\n\n` +
                `_Papers from 2000 to present available_`;
            return sock.sendMessage(chatId, { text, ...channelInfo }, { quoted: message });
        }

        const paper = PAPERS[level];

        // ── Subject menu for a level ───────────────────────────────────────
        if (!subject || !paper.subjects[subject]) {
            const subjectList = Object.entries(paper.subjects)
                .map(([k, v]) => `  • *.papers ${level} ${k}* — ${v.name}`)
                .join('\n');

            const sourceList = paper.sources
                .map(s => `  🔗 ${s.name}: ${s.url}`)
                .join('\n');

            const text = `${paper.label}\n\n` +
                `ℹ️ _${paper.info}_\n\n` +
                `*Available Subjects:*\n${subjectList}\n\n` +
                `━━━━━━━━━━━━━━━━━━━\n` +
                `*📥 Download Sites:*\n${sourceList}\n\n` +
                `_Tap a link to browse and download PDF past papers_`;
            return sock.sendMessage(chatId, { text, ...channelInfo }, { quoted: message });
        }

        // ── Specific subject ───────────────────────────────────────────────
        const subj = paper.subjects[subject];
        const levelUp = level.toUpperCase();

        const sourceList = paper.sources
            .map(s => `  🔗 ${s.name}: ${s.url}`)
            .join('\n');

        const searchQuery = encodeURIComponent(`${levelUp} ${subj.name} past papers Uganda site:uneb.ac.ug OR site:ugandaschoolnews.com OR site:kasaana.com`);
        const googleLink = `https://www.google.com/search?q=${searchQuery}`;

        const text = `${paper.label}\n` +
            `📖 *Subject: ${subj.name}*\n` +
            `🔢 *Subject Code: ${subj.code}*\n\n` +
            `━━━━━━━━━━━━━━━━━━━\n\n` +
            `*📥 Where to Download:*\n${sourceList}\n\n` +
            `*🔍 Search Directly:*\n  ${googleLink}\n\n` +
            `━━━━━━━━━━━━━━━━━━━\n` +
            `💡 *Tips:*\n` +
            `  • UNEB site has papers from 2005–present\n` +
            `  • Uganda School News has papers + marking guides\n` +
            `  • Kasaana.com has papers sorted by year\n` +
            `  • Revision Uganda has worked solutions\n\n` +
            `_Use *.papers ${level}* to see all ${levelUp} subjects_`;

        await sock.sendMessage(chatId, { text, ...channelInfo }, { quoted: message });
    }
};
