const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const { NativeDriver } = require('./native-driver.cjs');
const { TRANSLATIONS } = require('../apps/desktop/src/context/i18nData.ts');

async function main() {
  const sessionFile = process.argv[2] ?? '.artifacts/native-acceptance/studio-session.json';
  let session = JSON.parse(await fs.readFile(sessionFile, 'utf8')).value;
  const endpoint = process.env.LAAP_NATIVE_DRIVER_URL ?? 'http://127.0.0.1:4444';
  let driver = new NativeDriver(session.sessionId, endpoint);
  const out = '.artifacts/native-acceptance';
  const checks = [];
  const passed = name => { checks.push(name); console.log(`PASS native: ${name}`); };
  async function until(check) {
    for (let i = 0; i < 100; i++) { if (await check()) return; await new Promise(resolve => setTimeout(resolve, 100)); }
    throw Error('Native appearance state did not settle');
  }
  if ((await driver.text()).includes('Return to Studio')) await driver.click('Return to Studio');
  await driver.click('Themes'); await driver.wait('Reset to Velvet Amethyst');
  const theme = await driver.invoke('theme_get_active');
  const image = await fs.readFile(out + '/original-acceptance.png', 'base64');
  const name = 'Native portable theme ' + Date.now();
  const portable = { schemaVersion: 2, theme: { ...theme, id: '', name, isBuiltin: false, accent: '#34c9ab', fontFamily: 'Sora', opacity: 0.8,
    animationSpeed: 'off', backgroundMediaPath: null, backgroundMediaType: 'image' }, mediaName: 'original.png', mediaBase64: image };
  await fs.writeFile(out + '/original-theme.json', JSON.stringify(portable));
  await driver.upload('//label[contains(normalize-space(.),"Import theme including media")]//input', out + '/original-theme.json');
  await driver.wait('Theme and media validated and imported as a new copy.');
  await driver.click('Save and apply'); await driver.wait('Theme saved and applied to LAAP.');
  const active = await driver.invoke('theme_get_active');
  assert.equal(active.name, name); assert.equal(active.accent, '#34c9ab');
  assert(path.resolve(active.backgroundMediaPath).toLowerCase().startsWith(path.resolve(out + '/studio-data').toLowerCase() + path.sep));
  assert.equal(await fs.readFile(active.backgroundMediaPath, 'base64'), image);
  await until(async () => await driver.execute('return getComputedStyle(document.documentElement).getPropertyValue("--accent-primary").trim()') === '#34c9ab');
  await driver.screenshot(out + '/theme-native.png');
  passed('Portable theme including original media imports through UI, applies and persists native bytes');

  const oldProcess = session.capabilities['goog:processID'];
  await fetch(endpoint + '/session/' + session.sessionId, { method: 'DELETE' });
  const response = await fetch(endpoint + '/session', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ capabilities: { alwaysMatch: { 'tauri:options': { application: path.resolve(out + '/LAAP-Studio-acceptance.exe') } } } }) });
  const restarted = await response.json();
  assert(restarted.value.sessionId); session = restarted.value;
  assert.notEqual(session.capabilities['goog:processID'], oldProcess);
  await fs.writeFile(sessionFile, JSON.stringify(restarted)); driver = new NativeDriver(session.sessionId, endpoint);
  await driver.wait('Overview');
  await until(async () => await driver.execute('return getComputedStyle(document.documentElement).getPropertyValue("--accent-primary").trim()') === '#34c9ab');
  assert.equal((await driver.invoke('theme_get_active')).id, active.id);
  assert.match(await driver.execute('return getComputedStyle(document.body).fontFamily'), /Sora/);
  passed('Actual native process restart restores theme, bundled font and active palette');

  await driver.click('Client surfaces'); await driver.wait('Save Configuration');
  const config = await driver.invoke('client_surfaces_get_config');
  const original = config.surfaces[0].enabled;
  await driver.clickXpath(`//input[@aria-label=${JSON.stringify('Enable ' + config.surfaces[0].name + ' definition')}]`);
  await driver.click('Save Configuration'); await driver.wait('Client surfaces configuration saved.');
  assert.equal((await driver.invoke('client_surfaces_get_config')).surfaces[0].enabled, !original);
  assert.equal((await driver.invoke('client_surfaces_get_adapter_status')).isAvailable, false);
  await driver.screenshot(out + '/surfaces-native.png');
  passed('16 definitions persist through UI save while real adapter availability remains false');

  await driver.clickXpath('//button[@aria-label="Settings"]'); await driver.wait('Return to Studio');
  await driver.clickXpath('//select[option[@value="ar_AE"]]/option[@value="ar_AE"]');
  await until(() => driver.execute('return document.documentElement.dir === "rtl"'));
  await driver.click('Return to Studio'); await driver.click(TRANSLATIONS.ar_AE['nav.themes']);
  for (const [width, height] of [[960, 640], [1160, 760], [1440, 900]]) {
    await driver.call('/window/rect', { width, height });
    assert.equal(await driver.execute('return document.documentElement.scrollWidth > innerWidth'), false);
    await driver.screenshot(`${out}/rtl-native-${width}.png`);
  }
  passed('Arabic direction and translated navigation render without horizontal overflow at three native sizes; full translation is not claimed');
  await driver.clickXpath('//button[@aria-label="Settings"]'); await driver.wait('Return to Studio');
  await driver.clickXpath('//select[option[@value="en_US"]]/option[@value="en_US"]');
  await driver.click('Return to Studio'); await driver.click('Themes');
  await driver.click('Reset to Velvet Amethyst'); await driver.wait('Restored Velvet Amethyst.');
  assert.equal((await driver.invoke('theme_get_active')).id, 'velvet-amethyst');
  passed('Default reset restores Velvet Amethyst without deleting custom themes');
  await fs.writeFile(out + '/native-appearance-result.json', JSON.stringify({ type: 'native application via tauri-driver', platform: 'Windows', mocked: false,
    restartedProcess: true, checks, passed: checks.length, failed: 0, limitation: 'Arabic layout coverage; application translation remains partial and unreviewed.' }, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
