const configs = require('../data/configs.json');

module.exports = (req, res) => {
  const fileLines = [
    '# Airtel Uganda v2ray Config — JAM-MD bot',
    `# Updated: ${configs.updated}`,
    '#',
    '# HOW TO USE:',
    '# 1. Copy any line below (starting with vmess/vless/trojan/ss)',
    '# 2. Open JZ PRO VPN',
    '# 3. Tap Custom Setup > V2Ray Tunnel',
    '# 4. Paste the line > SAVE > START',
    '',
    ...configs.configs.map((c) => c.line)
  ];

  const fileBuffer = Buffer.from(fileLines.join('\n'), 'utf-8');

  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Disposition', 'attachment; filename="Uganda_Airtel_GCP.mludp"');
  res.status(200).send(fileBuffer);
};
