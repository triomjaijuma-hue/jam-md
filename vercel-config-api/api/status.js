const configs = require('../data/configs.json');
const { checkConfigsHealth } = require('../lib/health');

// In-memory cache — persists only for the lifetime of a warm serverless
// instance, not shared across cold starts/regions. Good enough to avoid
// re-checking on every rapid poll without needing an external database.
let cache = null; // { timestamp, payload }
const CACHE_TTL_MS = 60 * 1000;

module.exports = async (req, res) => {
  const forceRefresh = req.query && req.query.refresh === '1';
  const now = Date.now();

  if (!forceRefresh && cache && now - cache.timestamp < CACHE_TTL_MS) {
    res.setHeader('Content-Type', 'application/json');
    res.status(200).json({ ...cache.payload, cached: true });
    return;
  }

  const results = await checkConfigsHealth(configs.configs, { timeoutMs: 2000 });
  const onlineCount = results.filter((r) => r.online).length;

  const payload = {
    checkedAt: new Date().toISOString(),
    configUpdated: configs.updated,
    total: results.length,
    online: onlineCount,
    offline: results.length - onlineCount,
    configs: results.map((r) => ({
      tag: r.tag,
      protocol: r.protocol,
      provider: r.provider,
      host: r.host,
      port: r.port,
      online: r.online,
      latencyMs: r.latencyMs,
      error: r.error
    }))
  };

  cache = { timestamp: now, payload };

  res.setHeader('Content-Type', 'application/json');
  res.status(200).json({ ...payload, cached: false });
};
