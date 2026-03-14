/**
 * Gmail API operations — ported from GmailSkill.php (ai-assistant project).
 *
 * All functions use the Gmail REST API directly via axios (no Google client library).
 * Token refresh is handled automatically before each call.
 */

const axios = require('axios')
const { getTokens, saveTokens } = require('./tokens')

const BASE = 'https://gmail.googleapis.com/gmail/v1/users/me'

// ─── Token management ─────────────────────────────────────────────────────────

async function getValidToken(context) {
  let tokens = getTokens()

  if (!tokens) {
    return null
  }

  // Refresh if expiring within 5 minutes
  if (tokens.token_expires_at && Date.now() > tokens.token_expires_at - 5 * 60 * 1000) {
    if (!tokens.refresh_token) return null

    const clientId     = context?.config?.googleClientId
    const clientSecret = context?.config?.googleClientSecret

    if (!clientId || !clientSecret) return null

    try {
      const res = await axios.post('https://oauth2.googleapis.com/token', new URLSearchParams({
        client_id:     clientId,
        client_secret: clientSecret,
        refresh_token: tokens.refresh_token,
        grant_type:    'refresh_token',
      }), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } })

      tokens.access_token     = res.data.access_token
      tokens.token_expires_at = Date.now() + (res.data.expires_in || 3600) * 1000
      saveTokens(tokens)
    } catch {
      return null
    }
  }

  return tokens.access_token
}

function headers(token) {
  return { Authorization: `Bearer ${token}` }
}

function notConnected() {
  return '❌ Gmail is not connected. Run: conan-gmail-auth'
}

// ─── Build RFC 2822 raw message (base64url encoded) ───────────────────────────

function buildRawMessage(to, subject, body, extraHeaders = []) {
  const lines = [
    `To: ${to}`,
    `Subject: ${subject}`,
    'Content-Type: text/plain; charset=UTF-8',
    'MIME-Version: 1.0',
    ...extraHeaders,
    '',
    body,
  ]
  const raw = Buffer.from(lines.join('\r\n')).toString('base64')
  return raw.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

// ─── Read emails ──────────────────────────────────────────────────────────────

async function readEmails(context, count = 5, label = 'INBOX') {
  const token = await getValidToken(context)
  if (!token) return notConnected()

  count = Math.max(1, Math.min(10, count))

  const listRes = await axios.get(`${BASE}/messages`, {
    headers: headers(token),
    params: { maxResults: count, labelIds: label },
  }).catch(() => null)

  if (!listRes) return '❌ Failed to read emails. Please try again.'

  const messages = listRes.data.messages || []
  if (!messages.length) return `No emails found in ${label}.`

  const lines = []
  for (const msg of messages) {
    const detail = await axios.get(`${BASE}/messages/${msg.id}`, {
      headers: headers(token),
      params: { format: 'metadata', metadataHeaders: ['From', 'Subject', 'Date'] },
    }).then(r => r.data).catch(() => null)

    if (!detail) continue

    const hdrs    = Object.fromEntries((detail.payload?.headers || []).map(h => [h.name, h.value]))
    const preview = (detail.snippet || '').slice(0, 150)

    lines.push(
      `• [id:${msg.id}] From: ${hdrs.From || 'Unknown'}\n` +
      `  Subject: ${hdrs.Subject || '(no subject)'}\n` +
      `  Date: ${hdrs.Date || ''}\n` +
      `  Preview: ${preview}`
    )
  }

  return `Latest ${count} ${label} emails:\n\n${lines.join('\n\n')}`
}

// ─── Search emails ────────────────────────────────────────────────────────────

async function searchEmails(context, query, count = 5) {
  const token = await getValidToken(context)
  if (!token) return notConnected()

  count = Math.max(1, Math.min(10, count))

  const fetchCandidates = async (q) => {
    const res = await axios.get(`${BASE}/messages`, {
      headers: headers(token),
      params: { maxResults: Math.min(count * 3, 30), q },
    }).catch(() => null)
    return res?.data?.messages || []
  }

  let messages = await fetchCandidates(query)

  // Smart domain fallback — same as GmailSkill.php
  let fallbackQuery = null
  const fromMatch = query.match(/from:[\w.+-]+@([\w.-]+)/i)
  if (fromMatch) {
    const parts      = fromMatch[1].split('.')
    const rootDomain = parts.length > 2 ? parts.slice(-2).join('.') : fromMatch[1]
    fallbackQuery    = `from:${rootDomain}`
  }

  if (!messages.length && fallbackQuery && fallbackQuery !== query) {
    messages = await fetchCandidates(fallbackQuery)
    if (messages.length) query = fallbackQuery
  }

  if (!messages.length) return `No emails found matching "${query}".`

  // Fetch metadata + internalDate for each candidate
  const detailed = []
  for (const msg of messages) {
    const detail = await axios.get(`${BASE}/messages/${msg.id}`, {
      headers: headers(token),
      params: { format: 'metadata', metadataHeaders: ['From', 'Subject', 'Date'] },
    }).then(r => ({ ...r.data, _msgId: msg.id })).catch(() => null)
    if (detail) detailed.push(detail)
  }

  // Sort newest first
  detailed.sort((a, b) => parseInt(b.internalDate || 0) - parseInt(a.internalDate || 0))

  // If best result is older than 7 days and we have a fallback, retry with domain
  const bestDate = parseInt(detailed[0]?.internalDate || 0)
  if (fallbackQuery && fallbackQuery !== query && bestDate < (Date.now() - 7 * 86400 * 1000)) {
    const fbMessages  = await fetchCandidates(fallbackQuery)
    const fbDetailed  = []
    for (const msg of fbMessages) {
      const d = await axios.get(`${BASE}/messages/${msg.id}`, {
        headers: headers(token),
        params: { format: 'metadata', metadataHeaders: ['From', 'Subject', 'Date'] },
      }).then(r => ({ ...r.data, _msgId: msg.id })).catch(() => null)
      if (d) fbDetailed.push(d)
    }
    fbDetailed.sort((a, b) => parseInt(b.internalDate || 0) - parseInt(a.internalDate || 0))
    if (fbDetailed.length && parseInt(fbDetailed[0].internalDate || 0) > bestDate) {
      detailed.splice(0, detailed.length, ...fbDetailed)
      query = fallbackQuery
    }
  }

  const top   = detailed.slice(0, count)
  const lines = top.map(detail => {
    const hdrs    = Object.fromEntries((detail.payload?.headers || []).map(h => [h.name, h.value]))
    const preview = (detail.snippet || '').slice(0, 150)
    return (
      `• [id:${detail._msgId}] From: ${hdrs.From || 'Unknown'}\n` +
      `  Subject: ${hdrs.Subject || '(no subject)'}\n` +
      `  Date: ${hdrs.Date || ''}\n` +
      `  Preview: ${preview}`
    )
  })

  return `Search results for "${query}" (newest first):\n\n${lines.join('\n\n')}`
}

// ─── Send email ───────────────────────────────────────────────────────────────

async function sendEmail(context, to, subject, body) {
  const token = await getValidToken(context)
  if (!token) return notConnected()

  const raw = buildRawMessage(to, subject, body)

  const res = await axios.post(`${BASE}/messages/send`, { raw }, {
    headers: headers(token),
  }).catch(e => e.response || null)

  if (!res || res.status >= 400) return `❌ Failed to send email to ${to}. Please check the address and try again.`

  return `✅ Email sent successfully to ${to}.`
}

// ─── Reply to email ───────────────────────────────────────────────────────────

async function replyEmail(context, messageId, body) {
  const token = await getValidToken(context)
  if (!token) return notConnected()

  if (!/^[a-f0-9]{6,}$/i.test(messageId)) {
    return `❌ Invalid message ID "${messageId}". Call gmail with action=read first to get a real message ID from the [id:...] field.`
  }

  const original = await axios.get(`${BASE}/messages/${messageId}`, {
    headers: headers(token),
    params: { format: 'metadata', metadataHeaders: ['From', 'Subject', 'Message-ID', 'References', 'In-Reply-To'] },
  }).then(r => r.data).catch(() => null)

  if (!original) return `❌ Could not find email with ID ${messageId}. Call gmail with action=read to get fresh IDs.`

  const hdrs     = Object.fromEntries((original.payload?.headers || []).map(h => [h.name, h.value]))
  const threadId = original.threadId
  const rawFrom  = hdrs['From'] || ''
  let subject    = hdrs['Subject'] || ''
  const rfcMsgId = hdrs['Message-ID'] || ''
  const refs     = [hdrs['References'], rfcMsgId].filter(Boolean).join(' ').trim()

  // Extract bare email from "Name <email>"
  const emailMatch = rawFrom.match(/<([^>@\s]+@[^>]+)>/)
  const to = emailMatch ? emailMatch[1].trim() : rawFrom.trim()

  if (!to) return '❌ Cannot reply — could not determine the sender\'s address.'

  if (!subject.toLowerCase().startsWith('re:')) subject = `Re: ${subject}`

  const extraHeaders = [
    rfcMsgId ? `In-Reply-To: ${rfcMsgId}` : null,
    refs     ? `References: ${refs}`       : null,
  ].filter(Boolean)

  const raw = buildRawMessage(to, subject, body, extraHeaders)

  const payload = { raw }
  if (threadId) payload.threadId = threadId

  const res = await axios.post(`${BASE}/messages/send`, payload, {
    headers: headers(token),
  }).catch(e => e.response || null)

  if (!res || res.status >= 400) return '❌ Failed to send reply. Please try again.'

  return `✅ Reply sent successfully to ${to}.`
}

// ─── Forward email ────────────────────────────────────────────────────────────

async function forwardEmail(context, messageId, to, body = '') {
  const token = await getValidToken(context)
  if (!token) return notConnected()

  if (!/^[a-f0-9]{6,}$/i.test(messageId)) {
    return `❌ Invalid message ID "${messageId}". Call gmail with action=read first to get a real message ID.`
  }

  const original = await axios.get(`${BASE}/messages/${messageId}`, {
    headers: headers(token),
    params: { format: 'metadata', metadataHeaders: ['From', 'Subject', 'Date'] },
  }).then(r => r.data).catch(() => null)

  if (!original) return `❌ Could not find email with ID ${messageId}. Call gmail with action=read to get fresh IDs.`

  const hdrs       = Object.fromEntries((original.payload?.headers || []).map(h => [h.name, h.value]))
  const origFrom   = hdrs['From'] || 'Unknown'
  const origSubject = hdrs['Subject'] || '(no subject)'
  const origDate   = hdrs['Date'] || ''
  const origPreview = (original.snippet || '').slice(0, 500)

  const fwdSubject = origSubject.toLowerCase().startsWith('fwd:') ? origSubject : `Fwd: ${origSubject}`
  const fwdBody    = (body ? body + '\n\n' : '') +
    '---------- Forwarded message ----------\n' +
    `From: ${origFrom}\nDate: ${origDate}\nSubject: ${origSubject}\n\n` +
    origPreview

  const raw = buildRawMessage(to, fwdSubject, fwdBody)

  const res = await axios.post(`${BASE}/messages/send`, { raw }, {
    headers: headers(token),
  }).catch(e => e.response || null)

  if (!res || res.status >= 400) return `❌ Failed to forward email to ${to}. Please try again.`

  return `✅ Email forwarded successfully to ${to}.`
}

// ─── Delete (trash) email ─────────────────────────────────────────────────────

async function deleteEmail(context, messageId) {
  const token = await getValidToken(context)
  if (!token) return notConnected()

  if (!/^[a-f0-9]{6,}$/i.test(messageId)) {
    return `❌ Invalid message ID "${messageId}". Call gmail with action=read or action=search first to get a real message ID.`
  }

  const res = await axios.post(`${BASE}/messages/${messageId}/trash`, {}, {
    headers: headers(token),
  }).catch(e => e.response || null)

  if (res?.status === 404) return `❌ Email not found (ID: ${messageId}). The ID may be stale — call gmail with action=read to get fresh IDs.`
  if (!res || res.status >= 400) return '❌ Failed to delete email. Please try again.'

  return '✅ Email moved to Trash successfully.'
}

module.exports = { readEmails, searchEmails, sendEmail, replyEmail, forwardEmail, deleteEmail }
