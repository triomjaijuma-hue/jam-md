const configs = require('../data/configs.json');

module.exports = (req, res) => {
  const sample = configs.configs.map((c) => c.line);
  const protocols = configs.configs.map((c) => c.protocol);
  const tags = configs.configs.map((c) => c.tag);

  res.setHeader('Content-Type', 'application/json');
  res.status(200).json({
    count: sample.length,
    sample,
    protocols,
    tags,
    updated: configs.updated
  });
};
