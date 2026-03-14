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
        res.end('<h2>Auth cancelled. You can close this tab.</h2>')
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

        res.end(`<h2>✅ Gmail connected as ${userInfo.email}. You can close this tab.</h2>`)
        server.close()
        resolve(userInfo.email)
      } catch (err) {
        res.end('<h2>❌ Auth failed. Check your client credentials and try again.</h2>')
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
