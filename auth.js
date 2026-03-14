/**
 * Gmail OAuth 2.0 flow for Conan.
 *
 * Starts a local HTTP server on port 9854 to receive the OAuth callback.
 * Opens the browser to Google consent screen.
 * Exchanges the code for tokens and saves them to ~/.conan/config.json.
 *
 * Redirect URI to register in Google Cloud Console:
 *   http://localhost:9854/callback
 *
 * Required scopes:
 *   gmail.modify, gmail.send, userinfo.email, userinfo.profile
 */

const http       = require('http')
const axios      = require('axios')
const { saveTokens } = require('./tokens')

const PORT         = 9854
const REDIRECT_URI = `http://localhost:${PORT}/callback`

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
].join(' ')

function buildAuthUrl(clientId) {
  const params = new URLSearchParams({
    client_id:     clientId,
    redirect_uri:  REDIRECT_URI,
    response_type: 'code',
    scope:         SCOPES,
    access_type:   'offline',
    prompt:        'consent',
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`
}

async function exchangeCode(code, clientId, clientSecret) {
  const res = await axios.post('https://oauth2.googleapis.com/token', new URLSearchParams({
    code,
    client_id:     clientId,
    client_secret: clientSecret,
    redirect_uri:  REDIRECT_URI,
    grant_type:    'authorization_code',
  }), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } })

  return res.data
}

async function getUserInfo(accessToken) {
  const res = await axios.get('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` }
  })
  return res.data
}

/**
 * Run the OAuth flow.
 * clientId + clientSecret come from config (set via conan config set).
 * Returns the connected email on success.
 */
function runAuthFlow(clientId, clientSecret) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      if (!req.url.startsWith('/callback')) return

      const url    = new URL(req.url, `http://localhost:${PORT}`)
      const code   = url.searchParams.get('code')
      const error  = url.searchParams.get('error')

      if (error || !code) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <title>Conan — Cancelled</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0a0a0a; color: #f0f0f0; min-height: 100vh; display: flex; align-items: center; justify-content: center; }
    .card { background: #111; border: 1px solid #222; border-radius: 16px; padding: 48px 56px; text-align: center; max-width: 420px; width: 90%; }
    .icon { font-size: 52px; margin-bottom: 20px; }
    .brand { font-size: 13px; font-weight: 600; letter-spacing: 0.15em; text-transform: uppercase; color: #f59e0b; margin-bottom: 16px; }
    h1 { font-size: 22px; font-weight: 700; color: #fff; margin-bottom: 10px; }
    p { font-size: 14px; color: #666; line-height: 1.6; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">⚠️</div>
    <div class="brand">Conan AI</div>
    <h1>Cancelled</h1>
    <p>Auth was cancelled. You can close this tab<br/>and run <em>conan-gmail-auth</em> again.</p>
  </div>
</body>
</html>`)
        server.close()
        return reject(new Error(error || 'No code received'))
      }

      try {
        const tokens   = await exchangeCode(code, clientId, clientSecret)
        const userInfo = await getUserInfo(tokens.access_token)

        saveTokens({
          access_token:     tokens.access_token,
          refresh_token:    tokens.refresh_token,
          token_expires_at: Date.now() + (tokens.expires_in || 3600) * 1000,
          email:            userInfo.email,
          name:             userInfo.name,
        })

        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Conan — Gmail Connected</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #0a0a0a;
      color: #f0f0f0;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .card {
      background: #111;
      border: 1px solid #222;
      border-radius: 16px;
      padding: 48px 56px;
      text-align: center;
      max-width: 420px;
      width: 90%;
      box-shadow: 0 0 40px rgba(99,102,241,0.08);
    }
    .icon {
      font-size: 52px;
      margin-bottom: 20px;
    }
    .brand {
      font-size: 13px;
      font-weight: 600;
      letter-spacing: 0.15em;
      text-transform: uppercase;
      color: #6366f1;
      margin-bottom: 16px;
    }
    h1 {
      font-size: 22px;
      font-weight: 700;
      color: #fff;
      margin-bottom: 10px;
    }
    .email {
      font-size: 14px;
      color: #6366f1;
      background: rgba(99,102,241,0.1);
      border: 1px solid rgba(99,102,241,0.2);
      border-radius: 8px;
      padding: 8px 16px;
      display: inline-block;
      margin: 12px 0 20px;
      font-weight: 500;
    }
    p {
      font-size: 14px;
      color: #666;
      line-height: 1.6;
    }
    .close-hint {
      margin-top: 28px;
      font-size: 12px;
      color: #444;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">✅</div>
    <div class="brand">Conan AI</div>
    <h1>Gmail Connected</h1>
    <div class="email">${userInfo.email}</div>
    <p>You can now use Gmail in Conan chat.<br/>Try <em>"read my latest emails"</em></p>
    <p class="close-hint">You can close this tab.</p>
  </div>
</body>
</html>`)
        server.close()
        resolve(userInfo.email)
      } catch (err) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <title>Conan — Auth Failed</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #0a0a0a;
      color: #f0f0f0;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .card {
      background: #111;
      border: 1px solid #222;
      border-radius: 16px;
      padding: 48px 56px;
      text-align: center;
      max-width: 420px;
      width: 90%;
    }
    .icon { font-size: 52px; margin-bottom: 20px; }
    .brand { font-size: 13px; font-weight: 600; letter-spacing: 0.15em; text-transform: uppercase; color: #ef4444; margin-bottom: 16px; }
    h1 { font-size: 22px; font-weight: 700; color: #fff; margin-bottom: 10px; }
    p { font-size: 14px; color: #666; line-height: 1.6; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">❌</div>
    <div class="brand">Conan AI</div>
    <h1>Auth Failed</h1>
    <p>Check your client credentials and try again.<br/>Run <em>conan-gmail-auth</em> in your terminal.</p>
  </div>
</body>
</html>`)
        server.close()
        reject(err)
      }
    })

    server.listen(PORT, () => {
      const authUrl = buildAuthUrl(clientId)

      console.log('\n  Opening browser for Google sign-in...')
      console.log(`\n  If browser doesn't open, visit:\n  ${authUrl}\n`)

      // Open browser
      try {
        const open = require('open')
        open(authUrl)
      } catch {
        // open package not available — user will use the URL above
      }
    })

    // Timeout after 3 minutes
    setTimeout(() => {
      server.close()
      reject(new Error('Auth timeout — no response received in 3 minutes.'))
    }, 3 * 60 * 1000)
  })
}

module.exports = { runAuthFlow, REDIRECT_URI }
