export function browserPage(title: string, contents: string, script: string, checkout = false) {
  const nonce = crypto.randomUUID()
  return new Response(
    '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width">' +
    '<title>' + title + '</title><style>' +
    'body{color-scheme:dark;font:16px system-ui;background:#15101e;color:#f7f1ff;margin:3rem auto;padding:0 1.5rem;max-width:44rem}' +
    'main{background:#21182d;border:1px solid #40334f;padding:1.5rem;border-radius:1rem}section{margin-top:1rem}' +
    'label{display:block;margin:.6rem 0}input,select,button{font:inherit;padding:.45rem .6rem;margin:.25rem;border-radius:.35rem}' +
    'button{cursor:pointer}button[disabled]{opacity:.55}code{overflow-wrap:anywhere}li{margin:.75rem 0}p[role=alert]{color:#ffada8}' +
    '</style><main><h1>' + title + '</h1>' + contents + '</main>' +
    (checkout ? '<script src="https://cdn.paddle.com/paddle/v2/paddle.js"></script>' : '') +
    '<script nonce="' + nonce + '">' + script + '</script></html>',
    { headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; base-uri 'none'; frame-ancestors 'none'; style-src 'unsafe-inline'; script-src 'nonce-" + nonce +
        (checkout ? "' https://cdn.paddle.com; frame-src https://*.paddle.com; connect-src https://*.paddle.com; img-src https://*.paddle.com data:" : "'; connect-src 'self'"),
    } },
  )
}

export function checkoutPage(sandbox: boolean, token: string) {
  return browserPage('LAAP Pro checkout',
    '<p id="checkout-status" role="status">Complete payment in the checkout. Then return to LAAP and select Activate Pro.</p>',
    (sandbox ? 'Paddle.Environment.set("sandbox");' : '') +
    'Paddle.Initialize({token:' + JSON.stringify(token) +
    ',eventCallback(e){if(e.name==="checkout.completed")document.getElementById("checkout-status").textContent="Return to LAAP and select Activate Pro. Payment verification may take a moment.";}});',
    true,
  )
}

export function giftPage() {
  return browserPage('LAAP gift codes',
    '<section id="login"><label>Owner email <input id="email" type="email" autocomplete="email"></label>' +
    '<button id="send">Send sign-in code</button><label>Sign-in code <input id="otp" inputmode="numeric" autocomplete="one-time-code"></label>' +
    '<button id="verify">Sign in</button></section><p id="message" role="alert"></p>' +
    '<section id="admin" hidden><label>Gift duration <select id="duration"><option value="month">30 days</option>' +
    '<option value="year">One year</option><option value="lifetime">Lifetime</option></select></label>' +
    '<label>Recipient email (optional) <input id="recipient" type="email"></label><button id="create">Generate code</button>' +
    '<p id="code" role="status"></p><h2>Recent codes</h2><ul id="gifts"></ul>' +
    '<h2>Device transfer override</h2><label>Purchaser email <input id="buyer" type="email"></label>' +
    '<label>Support reason <input id="reason" maxlength="200"></label><button id="override">Allow the next verified transfer</button></section>',
    giftScript,
  )
}

const giftScript = String.raw`(() => {
    const get = (id) => document.getElementById(id)
    const input = (id) => get(id).value.trim()
    let token = ''
    async function call(path, body = {}) {
      const headers = { 'Content-Type': 'application/json' }
      if (token) headers.Authorization = 'Bearer ' + token
      const response = await fetch('/v1/' + path, { method: 'POST', headers, body: JSON.stringify(body) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? 'Request failed.')
      return data
    }
    function handle(id, action) {
      const button = get(id)
      button.onclick = async () => {
        button.disabled = true
        get('message').textContent = ''
        try { await action() } catch (error) { get('message').textContent = String(error) }
        finally { button.disabled = false }
      }
    }
    async function list() {
      const gifts = await call('owner/gifts')
      const rows = gifts.map((gift) => {
        const row = document.createElement('li')
        const status = gift.revoked_at ? 'Revoked' : gift.redeemed_at ? 'Redeemed' : Date.parse(gift.redeem_by) <= Date.now() ? 'Expired' : 'Ready'
        row.textContent = [gift.duration, gift.recipient ?? 'Any recipient', status, gift.id].join(' · ')
        if (status === 'Ready' || status === 'Redeemed') {
          const button = document.createElement('button')
          button.textContent = status === 'Ready' ? 'Cancel code' : 'Revoke gift'
          button.onclick = async () => {
            if (!window.confirm(button.textContent + '?')) return
            button.disabled = true
            try { await call('owner/revoke', { id: gift.id }); await list() }
            catch (error) { get('message').textContent = String(error); button.disabled = false }
          }
          row.append(button)
        }
        return row
      })
      get('gifts').replaceChildren(...rows)
    }
    handle('send', async () => {
      await call('auth/code', { email: input('email') })
      get('message').textContent = 'Check your email for a sign-in code.'
    })
    handle('verify', async () => {
      token = (await call('auth/verify', { email: input('email'), code: input('otp') })).accessToken
      await list()
      get('login').hidden = true
      get('admin').hidden = false
      get('otp').value = ''
    })
    handle('create', async () => {
      get('code').textContent = ''
      const gift = await call('owner/create', { duration: input('duration'), recipient: input('recipient') })
      get('code').textContent = 'Copy this code now. It is shown once. ' + gift.code
      await list()
    })
    handle('override', async () => {
      await call('owner/transfer-override', { buyer: input('buyer'), reason: input('reason') })
      get('message').textContent = 'Override recorded. The purchaser can now transfer using a fresh email code.'
    })
})();`
