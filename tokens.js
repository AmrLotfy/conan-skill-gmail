/**
 * Token storage — reads/writes Gmail tokens inside ~/.conan/config.json
 * so everything stays in one place alongside other Conan config.
 */

const fs   = require('fs')
const path = require('path')
const os   = require('os')

const CONFIG_PATH = path.join(os.homedir(), '.conan', 'config.json')

function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'))
  } catch {
    return {}
  }
}

function saveConfig(cfg) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2))
}

function getTokens() {
  return loadConfig().gmail || null
}

function saveTokens(tokens) {
  const cfg = loadConfig()
  cfg.gmail = tokens
  saveConfig(cfg)
}

function clearTokens() {
  const cfg = loadConfig()
  delete cfg.gmail
  saveConfig(cfg)
}

module.exports = { getTokens, saveTokens, clearTokens }
