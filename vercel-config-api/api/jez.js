const configs = require('../data/configs.json');
const { checkConfigsHealth } = require('../lib/health');

module.exports = async (req, res) => {
  const { provider } = req.query || {};

  let list = configs.configs;
  if (provider) {
    list = list.filter((c) => c.provider === String(provider).toLowerCase());
  } else {
    // Default: GCP servers first (fastest/most stable), then everything else.
    list = [...list].sort((a, b) => {
      const aGcp = a.provider === 'gcp' ? 0 : 1;
      const bGcp = b.provider === 'gcp' ? 0 : 1;
      return aGcp - bGcp;
    });
  }

  // Live TCP health check — only serve configs confirmed reachable right now.
  const checked = await checkConfigsHealth(list, { timeoutMs: 1500 });
  const online = checked.filter((c) => c.online);
  // Safety fallback: if every config fails the check (e.g. this network can't
  // reach any of them), still return the full list rather than sending nothing.
  const allOffline = online.length === 0;
  const finalList = allOffline ? checked : online;

  const sample = finalList.map((c) => c.line);
  const protocols = finalList.map((c) => c.protocol);
  const tags = finalList.map((c) => c.tag);

  res.setHeader('Content-Type', 'application/json');
  res.status(200).json({
    count: sample.length,
    sample,
    protocols,
    tags,
    updated: configs.updated,
    healthChecked: true,
    allOffline
  });
};
