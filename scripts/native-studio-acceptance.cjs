const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const { NativeDriver } = require('./native-driver.cjs');

async function main() {
  const session = JSON.parse(await fs.readFile(process.argv[2] ?? '.artifacts/native-acceptance/studio-session.json', 'utf8')).value;
  const driver = new NativeDriver(session.sessionId, process.env.LAAP_NATIVE_DRIVER_URL);
  const out = '.artifacts/native-acceptance';
  const checks = [];
  const passed = name => { checks.push(name); console.log(`PASS native: ${name}`); };
  await driver.call('/timeouts', { script: 180000 });
  assert.equal(session.capabilities.browserName, 'webview2');
  assert.equal((await driver.invoke('get_product_capabilities')).flavor, 'studio');
  await assert.rejects(driver.invoke('list_local_accounts'), /not found|unknown|not allowed/i);
  passed('Studio exposes customization IPC and rejects account-vault IPC');

  if ((await driver.text()).includes('Return to Studio')) await driver.click('Return to Studio');
  await driver.wait('Overview');
  await driver.click('Creator'); await driver.wait('+ New Project'); await driver.click('+ New Project');
  const name = `Acceptance original ${Date.now()}`;
  await driver.type('Project name', name); await driver.type('Target champion', 'Ahri'); await driver.type('Author (optional)', 'Acceptance artist');
  await driver.click('Create project'); await driver.wait('Saved to this device');
  const project = (await driver.invoke('creator_list_projects')).find(p => p.name === name);
  assert(project);
  await driver.type('Skin / project name', name + ' saved'); await driver.wait('Saved to this device');
  assert.equal((await driver.invoke('creator_get_project', { id: project.id })).name, name + ' saved');
  await driver.click('← Back to projects'); await driver.wait(name + ' saved');
  await driver.clickXpath(`//div[h4[normalize-space(.)=${JSON.stringify(name + ' saved')}]]//button[normalize-space(.)='Open']`);
  await driver.wait('Project metadata');
  passed('Create → edit → autosave → close → reopen uses native project files');

  const fixture = path.resolve(out, 'original-acceptance.png');
  await fs.writeFile(fixture, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAJUlEQVR4nGOcFnXpPwMFgIkSzaMGQAATA4WAadQAhtEwYKA8DABuCQLhlxvIWQAAAABJRU5ErkJggg==', 'base64'));
  await driver.upload('//input[@type="file" and @multiple]', fixture); await driver.wait('Added 1 asset(s).');
  const withAsset = await driver.invoke('creator_get_project', { id: project.id });
  assert.equal(withAsset.files.length, 1);
  await driver.screenshot(out + '/creator-native.png');
  passed('Native asset import persists original image bytes and displays preview');

  await driver.type('Skin / project name', name + ' interrupted');
  // Ensure the journal committed before interrupting the WebView; no timer save is assumed.
  assert.equal(await driver.executeAsync(`const done=arguments[arguments.length-1], id=arguments[0];
    const request=indexedDB.open('laap-creator-recovery',1);request.onsuccess=()=>{const db=request.result;const tx=db.transaction('drafts');const r=tx.objectStore('drafts').get(id);r.onsuccess=()=>done(r.result?.project.name.endsWith('interrupted')===true);r.onerror=()=>done(false)};request.onerror=()=>done(false);`, [project.id]), true);
  await driver.call('/refresh', {}); await driver.wait('Overview'); await driver.click('Creator'); await driver.wait(name);
  await driver.clickXpath(`//div[h4[contains(.,${JSON.stringify(name)})]]//button[normalize-space(.)='Open']`);
  await driver.wait('Restore Snapshot'); await driver.click('Restore Snapshot'); await driver.wait('Saved to this device');
  assert.equal((await driver.invoke('creator_get_project', { id: project.id })).name, name + ' interrupted');
  passed('WebView interruption → versioned recovery → native persistence');

  await driver.click('Import into local Mod Library'); await driver.wait('Original credited author');
  assert.equal(await driver.execute('return document.querySelector("dialog input[name=redistribute]").checked'), false);
  await driver.type('License or permission', 'Private / local-only'); await driver.clickXpath('//dialog//input[@name="use"]');
  await driver.click('Review permissions and contents'); await driver.wait('Not granted — local use only');
  await driver.screenshot(out + '/creator-rights-native.png'); await driver.click('Confirm local import'); await driver.wait('Game-side application is unavailable.');
  await driver.click('Mod library'); await driver.wait(name + ' interrupted');
  const installed = await driver.invoke('mod_list');
  assert(installed.some(p => p.manifest.displayName === name + ' interrupted' && p.manifest.rightToDistribute === false));
  await driver.screenshot(out + '/library-native.png');
  passed('Explicit permissions → native library import → refreshed library');

  const fonts = await driver.execute('return {manrope:document.fonts.check("16px Manrope"),sora:document.fonts.check("16px Sora"),overflow:document.documentElement.scrollWidth>innerWidth}');
  assert.equal(fonts.manrope, true); assert.equal(fonts.sora, true); assert.equal(fonts.overflow, false);
  passed('Bundled fonts load and native viewport has no horizontal overflow');
  await fs.writeFile(out + '/native-studio-result.json', JSON.stringify({ type: 'native application via tauri-driver/W3C WebDriver', platform: 'Windows', browser: session.capabilities.browserVersion, mocked: false, checks, passed: checks.length, failed: 0 }, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
