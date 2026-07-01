const configs = require('../data/configs.json');

module.exports = (req, res) => {
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

  const sample = list.map((c) => c.line);
  const protocols = list.map((c) => c.protocol);
  const tags = list.map((c) => c.tag);

  res.setHeader('Content-Type', 'application/json');
  res.status(200).json({
    count: sample.length,
    sample,
    protocols,
    tags,
    updated: configs.updated
  });
};
