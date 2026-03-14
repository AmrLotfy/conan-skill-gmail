# conan-skill-gmail

> Gmail skill for [Conan AI](https://github.com/AmrLotfy/Conan-ai) — read, send, reply, forward, delete, and search emails.

[![npm](https://img.shields.io/npm/v/conan-skill-gmail?color=crimson)](https://www.npmjs.com/package/conan-skill-gmail)
[![License: MIT](https://img.shields.io/badge/license-MIT-gold.svg)](LICENSE)

```
You: read my latest emails
Conan: Latest 5 INBOX emails:

• [id:18e4a1c3f2b] From: boss@company.com
  Subject: Q1 Report Review
  Date: Sat, 14 Mar 2026 09:00:00 +0200
  Preview: Please review the attached Q1 report before Monday's meeting...

You: reply to that email — tell him I'll review it by Sunday
Conan: ✅ Reply sent successfully to boss@company.com.

You: search for emails from OpenAI
Conan: Search results for "from:openai.com" (newest first): ...
```

---

## Install

```bash
conan skill install conan-skill-gmail
```

## Setup

### 1. Create Google OAuth credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a project → **Enable Gmail API**
3. Go to **APIs & Services → Credentials → Create Credentials → OAuth 2.0 Client ID**
4. Application type: **Desktop app**
5. Add redirect URI: `http://localhost:9854/callback`
6. Copy the **Client ID** and **Client Secret**

### 2. Configure Conan

```bash
conan config set googleClientId YOUR_CLIENT_ID
conan config set googleClientSecret YOUR_CLIENT_SECRET
```

### 3. Connect your Gmail account

```bash
conan-gmail-auth
```

This opens your browser for Google sign-in. After approving, your Gmail is connected and tokens are saved locally in `~/.conan/config.json`.

---

## Actions

| Action | What it does |
|---|---|
| `read` | Fetch recent emails from inbox/sent/spam |
| `send` | Compose and send a new email |
| `reply` | Reply to an email — stays in the same thread |
| `forward` | Forward an email to a new recipient |
| `delete` | Move email to Trash (recoverable for 30 days) |
| `search` | Search with Gmail query syntax |

## Usage

Just ask naturally — Conan picks the right action:

```
"read my latest 10 emails"
"any emails from john@example.com?"
"send an email to team@company.com about the meeting tomorrow"
"reply to the last email from my boss"
"forward the invoice email to accounting@company.com"
"delete that spam email"
"search for emails with subject invoice from last month"
```

## Search syntax

Conan supports Gmail's full query syntax:

```
from:someone@example.com
subject:invoice
after:2026/01/01
before:2026/03/01
has:attachment
label:important
```

---

## Privacy

- Tokens stored locally in `~/.conan/config.json`
- Email content sent only to your configured LLM (OpenAI / Anthropic / OpenRouter)
- Nothing stored on any external server

---

## License

MIT · [Amr Lotfy](https://github.com/AmrLotfy)
