const configs = require('../data/configs.json');
const { checkConfigsHealth } = require('../lib/health');

module.exports = async (req, res) => {
  const { provider } = req.query || {};

  // Default: GCP-only, since GCP servers are the fastest/most stable for Airtel UG.
  // Pass ?provider=all to include every config regardless of provider.
  let list = configs.configs;
  if (provider && String(provider).toLowerCase() !== 'all') {
    list = list.filter((c) => c.provider === String(provider).toLowerCase());
  } else if (!provider) {
    const gcpOnly = list.filter((c) => c.provider === 'gcp');
    list = gcpOnly.length > 0 ? gcpOnly : list;
  }

  // Live TCP health check — only serve configs confirmed reachable right now.
  const checked = await checkConfigsHealth(list, { timeoutMs: 1500 });
  const online = checked.filter((c) => c.online);
  const allOffline = online.length === 0;
  const finalList = allOffline ? checked : online;

  const fileLines = [
    '# Airtel Uganda v2ray Config (GCP-filtered, health-checked) — JAM-MD bot',
    `# Updated: ${configs.updated}`,
    allOffline ? '# NOTE: no configs passed the live health check — sending full list anyway.' : '# All lines below passed a live TCP health check.',
    '#',
    '# HOW TO USE:',
    '# 1. Copy any line below (starting with vmess/vless/trojan/ss)',
    '# 2. Open JZ PRO VPN',
    '# 3. Tap Custom Setup > V2Ray Tunnel',
    '# 4. Paste the line > SAVE > START',
    '',
    ...finalList.map((c) => c.line)
  ];

  const fileBuffer = Buffer.from(fileLines.join('\n'), 'utf-8');

  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Disposition', 'attachment; filename="Uganda_Airtel_GCP.mludp"');
  res.status(200).send(fileBuffer);
};
