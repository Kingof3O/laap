// Disposable loopback service for native acceptance. Never uses production data.
const fs = require('node:fs');
const path = require('node:path');
const { randomBytes, randomUUID } = require('node:crypto');
const net = require('node:net');

async function main() {
  const probe = net.createServer();
  await new Promise((resolve, reject) => { probe.once('error', reject); probe.listen(4171, '127.0.0.1', resolve); });
  await new Promise(resolve => probe.close(resolve));
  let root = process.cwd();
  for (const part of ['.artifacts', 'native-acceptance', 'community']) {
    root = path.join(root, part);
    if (!fs.existsSync(root)) fs.mkdirSync(root);
    if (fs.lstatSync(root).isSymbolicLink()) throw Error('Fixture directories must not be links or junctions');
  }
  const adminKey = randomBytes(32).toString('hex');
  const reportKey = randomBytes(32).toString('hex');
  fs.writeFileSync(path.join(root, 'operator-fixture.json'), JSON.stringify({ adminKey, reportKey }));
  process.env.COMMUNITY_ADMIN_KEY = adminKey;
  process.env.LAAP_MODERATION_TOKEN = reportKey;
  process.env.LAAP_COMMUNITY_DATABASE = path.join(root, randomUUID() + '.sqlite');
  process.env.LAAP_COMMUNITY_HOST = '127.0.0.1';
  process.env.LAAP_COMMUNITY_PORT = '4171';
  process.env.LAAP_COMMUNITY_ORIGINS = 'http://localhost:1420,http://127.0.0.1:1420,http://tauri.localhost,tauri://localhost';
  await import('../apps/community-api/src/server.ts');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
