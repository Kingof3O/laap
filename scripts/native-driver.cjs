const fs = require('node:fs/promises');
const path = require('node:path');

/** W3C WebDriver against tauri-driver. No mocked IPC or browser replacement. */
class NativeDriver {
  constructor(sessionId, endpoint = 'http://127.0.0.1:4444') {
    this.base = `${endpoint}/session/${sessionId}`;
    this.ready = this.call('/timeouts', { implicit: 5000 });
  }
  async call(route, body) {
    const response = await fetch(this.base + route, body === undefined ? {} : {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const json = await response.json();
    if (!response.ok || json.value?.error) throw Error(JSON.stringify(json.value));
    return json.value;
  }
  execute(script, args = []) { return this.call('/execute/sync', { script, args }); }
  executeAsync(script, args = []) { return this.call('/execute/async', { script, args }); }
  text() { return this.execute('return document.body.innerText'); }
  async element(xpath) { await this.ready; return (await this.call('/element', { using: 'xpath', value: xpath }))['element-6066-11e4-a52e-4f735466cecf']; }
  async click(text) { return this.clickXpath(`//button[normalize-space(.)=${JSON.stringify(text)}]`); }
  async clickXpath(xpath) {
    const id = await this.element(xpath);
    for (let attempt = 0; attempt < 100; attempt++) {
      if (await this.call(`/element/${id}/enabled`)) return this.call(`/element/${id}/click`, {});
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw Error(`Native control remained disabled: ${xpath}`);
  }
  async type(label, text) {
    const id = await this.element(`//label[contains(normalize-space(.),${JSON.stringify(label)})]//*[self::input or self::textarea]`);
    await this.call(`/element/${id}/clear`, {}); await this.call(`/element/${id}/value`, { text });
  }
  async upload(xpath, file) { return this.call(`/element/${await this.element(xpath)}/value`, { text: path.resolve(file) }); }
  async wait(text, milliseconds = 20000) {
    const end = Date.now() + milliseconds;
    while (Date.now() < end) { if ((await this.text()).includes(text)) return; await new Promise(resolve => setTimeout(resolve, 100)); }
    throw Error(`Timed out waiting for ${text}`);
  }
  async screenshot(file) {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, Buffer.from(await this.call('/screenshot'), 'base64'));
  }
  async invoke(command, args = {}) {
    const value = await this.executeAsync(`const done = arguments[arguments.length-1]; window.__TAURI_INTERNALS__.invoke(arguments[0], arguments[1]).then(value=>done({value}), error=>done({error:String(error)}));`, [command, args]);
    if (value.error) throw Error(value.error);
    return value.value;
  }
}
module.exports = { NativeDriver };
