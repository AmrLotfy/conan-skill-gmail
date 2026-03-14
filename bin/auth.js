#!/usr/bin/env node

/**
 * conan-gmail-auth
 * Connect your Gmail account to Conan.
 *
 * Run this once after installing conan-skill-gmail:
 *   conan-gmail-auth
 */

const path   = require('path')
const os     = require('os')
const fs     = require('fs')
const { runAuthFlow } = require('../auth')

const CONFIG_PATH = path.join(os.homedir(), '.conan', 'config.json')

function loadConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) } catch { return {} }
}

async function main() {
  console.log('\n  🔍 Conan Gmail Auth\n')

  const cfg = loadConfig()

  const clientId     = cfg.googleClientId
  const clientSecret = cfg.googleClientSecret

  if (!clientId || !clientSecret) {
    console.log('  ❌ Google credentials not configured.\n')
    console.log('  Steps:')
    console.log('    1. Go to https://console.cloud.google.com')
    console.log('    2. Create a project → Enable Gmail API')
    console.log('    3. Create OAuth 2.0 credentials (Desktop app type)')
    console.log('    4. Add redirect URI: http://localhost:9854/callback')
    console.log('    5. Run:')
    console.log('       conan config set googleClientId YOUR_CLIENT_ID')
    console.log('       conan config set googleClientSecret YOUR_CLIENT_SECRET')
    console.log('    6. Run conan-gmail-auth again\n')
    process.exit(1)
  }

  console.log('  Opening browser for Google sign-in...')
  console.log('  Waiting for authorization (timeout: 3 minutes)...\n')

  try {
    const email = await runAuthFlow(clientId, clientSecret)
    console.log(`\n  ✅ Gmail connected as: ${email}`)
    console.log('  You can now use Gmail in Conan chat.\n')
    console.log('  Try: "read my latest emails" or "search for emails from boss@company.com"\n')
  } catch (err) {
    console.log(`\n  ❌ Auth failed: ${err.message}\n`)
    process.exit(1)
  }
}

main()
