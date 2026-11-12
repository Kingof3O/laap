const fs = require('node:fs/promises');
const assert = require('node:assert/strict');
const { NativeDriver } = require('./native-driver.cjs');

async function main() {
  const session = JSON.parse(await fs.readFile(process.argv[2] ?? '.artifacts/native-acceptance/studio-session.json', 'utf8')).value;
  const driver = new NativeDriver(session.sessionId, process.env.LAAP_NATIVE_DRIVER_URL);
  const out = '.artifacts/native-acceptance';
  // Refuse seeding unless the running IPC sees exactly the isolated on-disk library.
  const disk = JSON.parse(await fs.readFile(out + '/studio-data/library/index.json', 'utf8'));
  const actual = await driver.invoke('mod_list');
  assert.deepEqual(actual.map(p => p.manifest.sha256).sort(), disk.map(p => p.manifest.sha256).sort());
  await driver.call('/timeouts', { script: 180000 });
  let fixtures;
  try { fixtures = JSON.parse(await fs.readFile(out + '/stress-packages.json', 'utf8')); }
  catch {
    const image = await fs.readFile(out + '/original-acceptance.png', 'base64');
    const result = await driver.executeAsync(`const done=arguments[arguments.length-1], image=arguments[0];
      (async()=>{const packages=[];for(let i=0;i<100;i++){
        const result=await window.__TAURI_INTERNALS__.invoke('creator_build_package',{request:{
          modId:'acceptance.stress.'+i,version:'1',displayName:'Native stress package '+i,author:'Acceptance artist',license:'CC0-1.0',rightToDistribute:true,rightsConfirmed:true,
          files:[{name:'original_'+i+'.png',data:image}]}});
        await window.__TAURI_INTERNALS__.invoke('mod_import',{archive:result.archive,manifest:result.manifest,rightsConfirmed:true});packages.push(result);
      }return packages})().then(value=>done({value}),error=>done({error:String(error)}));`, [image]);
    if (result.error) throw Error(result.error);
    fixtures = result.value;
    await fs.writeFile(out + '/stress-packages.json', JSON.stringify(fixtures));
  }
  assert.equal(fixtures.length, 100);
  await driver.click('Overview'); await driver.click('Mod library'); await driver.wait('Select visible packages');
  const search = await driver.element('//input[@aria-label="Search mods"]');
  await driver.call(`/element/${search}/clear`, {});
  await driver.call(`/element/${search}/value`, { text: 'Native stress package' });
  await driver.wait('100 of');
  await driver.clickXpath('//label[span[normalize-space(.)="Select visible packages"]]/input');
  await driver.wait('100 Selected');
  const missing = fixtures[12];
  await driver.invoke('mod_remove', { hash: missing.manifest.sha256 });
  await driver.click('Disable Selected');
  await driver.wait('99 succeeded; 1 failed; 0 not started.');
  await driver.wait('Mod not found in library.');
  await driver.wait('1 Selected');
  assert.equal((await driver.invoke('mod_list')).filter(p => p.manifest.displayName.startsWith('Native stress package') && !p.enabled).length, 99);
  await driver.screenshot(out + '/batch-partial-native.png');
  console.log('PASS native: 100-package UI batch reports 99 successes and the concurrent-removal failure; only failed package stays selected');

  await driver.invoke('mod_import', { archive: missing.archive, manifest: missing.manifest, rightsConfirmed: true });
  await driver.execute("window.dispatchEvent(new Event('laap:library-changed')); return true");
  await driver.wait('100 of');
  await driver.click('Disable Selected'); await driver.wait('1 succeeded; 0 failed; 0 not started.');
  const rows = await driver.invoke('mod_list');
  assert.equal(rows.filter(p => p.manifest.displayName.startsWith('Native stress package') && !p.enabled).length, 100);
  console.log('PASS native: retry changes only the retained failed selection and restores persisted native state');
  await driver.clickXpath('//label[span[normalize-space(.)="Select visible packages"]]/input');
  await driver.click('Enable Selected');
  const stopped = await driver.executeAsync(`const done=arguments[arguments.length-1], end=Date.now()+3000;
    function stop(){const button=[...document.querySelectorAll('button')].find(b=>b.textContent==='Stop after current package');
      if(button){button.click();done(true)}else if(Date.now()<end)requestAnimationFrame(stop);else done(false)}stop();`);
  assert.equal(stopped, true, 'The cancellation action must be exercised, not assumed');
  await driver.wait('not started.');
  const summary = (await driver.text()).match(/(\d+) succeeded; (\d+) failed; (\d+) not started\./);
  assert(summary); assert.equal(Number(summary[2]), 0); assert(Number(summary[3]) > 0);
  assert.equal(Number(summary[1]) + Number(summary[3]), 100);
  assert.equal((await driver.invoke('mod_list')).filter(p => p.manifest.displayName.startsWith('Native stress package') && p.enabled).length, Number(summary[1]));
  console.log('PASS native: cancellation stops unstarted packages while honestly retaining completed native writes');
  await fs.writeFile(out + '/native-library-result.json', JSON.stringify({ type: 'native WebView2 UI with real Rust fixture setup', platform: 'Windows', mocked: false, packageCount: 100, injectedFault: 'concurrent removal of one isolated fixture record via real IPC', checks: ['partial results', 'specific error', 'failed selection retained', 'retry', 'native persistence', 'cancellation'], cancellation: { succeeded: Number(summary[1]), notStarted: Number(summary[3]) }, passed: 3, failed: 0 }, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
