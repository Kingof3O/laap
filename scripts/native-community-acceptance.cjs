const fs = require('node:fs/promises');
const assert = require('node:assert/strict');
const { NativeDriver } = require('./native-driver.cjs');

async function main() {
  const session = JSON.parse(await fs.readFile(process.argv[2] ?? '.artifacts/native-acceptance/studio-session.json', 'utf8')).value;
  const driver = new NativeDriver(session.sessionId, process.env.LAAP_NATIVE_DRIVER_URL);
  const out = '.artifacts/native-acceptance';
  const origin = 'http://127.0.0.1:4171';
  const operator = JSON.parse(await fs.readFile(out + '/community/operator-fixture.json', 'utf8'));
  const checks = [];
  const passed = name => { checks.push(name); console.log(`PASS native: ${name}`); };
  async function credential() {
    for (let i = 0; i < 50; i++) { const value = await driver.invoke('community_credential_load', { origin }); if (value) return value; await new Promise(resolve => setTimeout(resolve, 100)); }
    throw Error('Credential persistence did not settle');
  }
  if ((await driver.text()).includes('Return to Studio')) await driver.click('Return to Studio');
  await driver.click('Overview');
  const previous = await driver.invoke('community_credential_load', { origin });
  if (previous) {
    const response = await fetch(origin + '/v1/marketplace/creator', { headers: { Authorization: 'Bearer ' + previous.authToken } });
    const profile = await response.json();
    assert(typeof profile.displayName === 'string' && /^(Native artist|Independent native reviewer)/.test(profile.displayName), 'Refusing to clear an unexpected creator identity');
    await driver.invoke('community_credential_clear', { origin });
  }
  const title = 'Native marketplace original ' + Date.now();
  const image = await fs.readFile(out + '/original-acceptance.png', 'base64');
  const pkg = await driver.invoke('creator_build_package', { request: {
    modId: 'acceptance.community.' + Date.now(), version: '1', displayName: title, author: 'Acceptance artist', license: 'CC0-1.0', rightToDistribute: true, rightsConfirmed: true,
    files: [{ name: 'community-original-' + Date.now() + '.png', data: image }],
  } });
  await driver.invoke('mod_import', { archive: pkg.archive, manifest: pkg.manifest, rightsConfirmed: true });
  await driver.click('Community');
  if ((await driver.text()).includes('Disconnect and clear saved credential')) await driver.click('Disconnect and clear saved credential');
  await driver.wait('Creator account / recovery');
  const openIdentity = await driver.execute('return [...document.querySelectorAll("details")].some(d=>d.open && d.querySelector("summary")?.textContent.includes("Creator account"))');
  if (!openIdentity) await driver.clickXpath('//summary[contains(.,"Creator account / recovery")]');
  await driver.type('Display name', 'Native artist ' + Date.now());
  await driver.click('Create community identity');
  const creator = await credential();
  await driver.click('Disconnect and clear saved credential');
  await driver.wait('Recover identity'); await driver.type('Recovery token', creator.authToken); await driver.click('Recover identity');
  assert.equal((await credential()).id, creator.id);
  passed('Real HTTP creator registration → native OS credential persistence → disconnect → token recovery');

  await driver.click('Submit local package'); await driver.wait('Submit for moderation');
  await driver.clickXpath(`//select[option[@value=${JSON.stringify(pkg.manifest.sha256)}]]/option[@value=${JSON.stringify(pkg.manifest.sha256)}]`);
  await driver.type('Mod title', title); await driver.type('Champion', 'Ahri'); await driver.type('Description', 'Original self-authored QA image fixture; no League assets.');
  await driver.clickXpath('//label[contains(.,"I have permission to distribute these assets")]//input');
  await driver.click('Submit package'); await driver.wait('Package uploaded and queued for human review.');
  await driver.click('Refresh my submissions'); await driver.wait('pending_review');
  await driver.upload(`//label[contains(.,${JSON.stringify('Upload preview for ' + title)})]//input`, out + '/original-acceptance.png');
  await driver.wait('Preview uploaded.');
  passed('Native local package selection → real upload → tracked pending submission → original preview upload');

  await driver.clickXpath('//summary[normalize-space(.)="Service operator tools"]');
  await driver.type('Marketplace operator key', operator.adminKey); await driver.click('Load review queue');
  const reviewRow = `//li[strong[contains(.,${JSON.stringify(title)})]]`;
  await driver.clickXpath(reviewRow + '//button[normalize-space(.)="Inspect submitted package"]');
  await driver.wait('contents inspected by native LAAP.');
  await driver.type('Decision reason', 'Original QA image fixture checked against supplied bytes and CC0 declaration.');
  await driver.clickXpath(reviewRow + '//button[normalize-space(.)="approve"]'); await driver.wait('Recorded approve decision');
  await driver.click('Clear operator session');
  await driver.clickXpath('//summary[normalize-space(.)="Service operator tools"]');
  passed('Authenticated operator queue → server hash validation → native archive inspection → approval');

  await driver.invoke('mod_remove', { hash: pkg.manifest.sha256 });
  await driver.click('Refresh'); await driver.wait(title);
  const publicRow = `//li[.//strong[contains(.,${JSON.stringify(title)})]]`;
  await driver.clickXpath(publicRow + '//button[normalize-space(.)="Get package"]');
  await driver.clickXpath(publicRow + '//button[normalize-space(.)="Download & verify"]');
  await driver.wait('Package verified and added to your mod library.');
  const imported = await driver.invoke('mod_get_package_data', { sha256: pkg.manifest.sha256 });
  assert.equal(imported.archiveBase64, pkg.archive);
  assert.equal(imported.manifest.sha256, pkg.manifest.sha256);
  passed('Real HTTP manifest + byte download → native validation → new local library import; exact source bytes preserved');

  await driver.click('Disconnect and clear saved credential'); await driver.wait('Create community identity');
  await driver.type('Display name', 'Independent native reviewer ' + Date.now()); await driver.click('Create community identity');
  const reviewer = await credential(); assert.notEqual(reviewer.id, creator.id);
  await driver.clickXpath(publicRow + '//button[starts-with(normalize-space(.),"Reviews")]');
  await driver.type('Review comment', 'Original fixture was downloaded and verified through native LAAP.');
  await driver.click('Save my review'); await driver.wait('Review submitted successfully.');
  await driver.clickXpath(publicRow + '//button[contains(.,"☆ Save")]');
  await driver.wait('★ Saved');
  await driver.click('Refresh'); await driver.wait(title);
  const preview = await driver.executeAsync(`const done=arguments[arguments.length-1], title=arguments[0], end=Date.now()+10000;
    function check(){const img=[...document.images].find(i=>i.alt==='Preview: '+title);if(img?.naturalWidth>0)done(true);else if(Date.now()<end)setTimeout(check,100);else done(false)}check();`, [title]);
  assert.equal(preview, true, 'Preview must render under actual WebView2 CSP');
  passed('Independent reviewer → persisted review and favorite → actual CSP-safe preview rendering');
  await driver.clickXpath(publicRow + '//button[normalize-space(.)="Report"]');
  const reportNote = 'Original QA fixture report ' + Date.now();
  await driver.type('Details', reportNote); await driver.click('Submit report'); await driver.wait('Report submitted to moderation queue.');
  await driver.clickXpath('//summary[normalize-space(.)="Service operator tools"]');
  await driver.type('Marketplace operator key', operator.adminKey);
  await driver.type('Safety reports operator token', operator.reportKey); await driver.click('Load safety reports'); await driver.wait(reportNote);
  await driver.clickXpath('//label[normalize-space(text())="Queue"]/select/option[normalize-space(.)="approved"]');
  await driver.click('Load review queue');
  await driver.type('Decision reason', 'Temporary QA takedown of the original fixture.');
  await driver.clickXpath(reviewRow + '//button[normalize-space(.)="takedown"]'); await driver.wait('Recorded takedown decision');
  await driver.click('Refresh');
  const publicResponse = await fetch(origin + '/v1/marketplace/mods');
  assert(!(await publicResponse.json()).some(row => row.packageHash === pkg.manifest.sha256));
  await driver.clickXpath('//label[normalize-space(text())="Queue"]/select/option[normalize-space(.)="takedown"]');
  await driver.click('Load review queue');
  await driver.clickXpath(reviewRow + '//button[normalize-space(.)="restore"]'); await driver.wait('Recorded restore decision');
  await driver.clickXpath('//label[normalize-space(text())="Queue"]/select/option[normalize-space(.)="pending_review"]');
  await driver.click('Load review queue');
  await driver.clickXpath(reviewRow + '//button[normalize-space(.)="Inspect submitted package"]'); await driver.wait('contents inspected by native LAAP.');
  await driver.clickXpath(reviewRow + '//button[normalize-space(.)="approve"]'); await driver.wait('Recorded approve decision');
  await driver.click('Clear operator session'); await driver.clickXpath('//summary[normalize-space(.)="Service operator tools"]');
  passed('Real report → authenticated reports queue → takedown → restore to review → reinspection and approval');
  await driver.click('Disconnect and clear saved credential');
  await driver.clickXpath('//summary[contains(.,"Creator account / recovery")]');
  await driver.screenshot(out + '/community-native.png');
  await driver.click('Mod library'); await driver.wait(title);
  await fs.writeFile(out + '/native-community-result.json', JSON.stringify({ type: 'native WebView2 UI + disposable real HTTP/SQLite service', platform: 'Windows', mocked: false,
    fixtureRights: 'Self-authored PNG fixture explicitly declared CC0 for testing', checks, passed: checks.length, failed: 0,
    limitations: ['Automated operator acceptance is not a professional IP or malware review.', 'Production hosting and provider approval were not exercised.'] }, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
