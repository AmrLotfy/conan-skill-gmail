/**
 * conan-skill-gmail
 * Gmail skill for Conan AI — read, send, reply, forward, delete, search.
 *
 * Setup:
 *   1. Create a Google Cloud project → enable Gmail API
 *   2. Create OAuth 2.0 credentials (Desktop app)
 *   3. Add redirect URI: http://localhost:9854/callback
 *   4. conan config set googleClientId YOUR_CLIENT_ID
 *   5. conan config set googleClientSecret YOUR_CLIENT_SECRET
 *   6. conan-gmail-auth    (connects your Gmail account)
 *   7. conan skill install conan-skill-gmail
 */

const { readEmails, searchEmails, sendEmail, replyEmail, forwardEmail, deleteEmail } = require('./gmail')

module.exports = {
  name: 'gmail',
  description:
    'All Gmail operations in one tool. ' +
    'action=read: fetch recent emails (returns message IDs for reply/forward/delete). ' +
    'action=send: compose and send a new email. ' +
    'action=reply: reply to an email by message ID (stays in thread). ' +
    'action=forward: forward an email to a new recipient. ' +
    'action=delete: move an email to Trash. ' +
    'action=search: search emails using Gmail query syntax (from:, subject:, after:, etc.).',

  parameters: {
    type: 'object',
    properties: {

      action: {
        type: 'string',
        enum: ['read', 'send', 'reply', 'forward', 'delete', 'search'],
        description: 'The Gmail operation to perform.',
      },

      // read
      count: {
        type: 'integer',
        description: '(read / search) Number of emails to fetch. Default: 5. Max: 10.',
      },
      label: {
        type: 'string',
        description: '(read) Gmail label: INBOX, SENT, SPAM. Default: INBOX.',
      },

      // search
      query: {
        type: 'string',
        description: '(search) Gmail search query e.g. "from:boss@company.com" or "subject:invoice after:2024/01/01".',
      },

      // send / reply / forward
      to: {
        type: 'string',
        description: '(send / forward) Recipient email address.',
      },
      subject: {
        type: 'string',
        description: '(send) Email subject line.',
      },
      body: {
        type: 'string',
        description: '(send / reply / forward) Email body in plain text.',
      },

      // reply / forward / delete
      message_id: {
        type: 'string',
        description: '(reply / forward / delete) The message ID from a previous read or search result [id:...].',
      },

    },
    required: ['action'],
  },

  async execute(args, context) {
    const action = args.action || ''

    switch (action) {

      case 'read':
        return readEmails(context, args.count || 5, args.label || 'INBOX')

      case 'search': {
        if (!args.query) return '❌ Cannot search — missing query. Please ask the user what to search for.'
        return searchEmails(context, args.query.trim(), args.count || 5)
      }

      case 'send': {
        const missing = []
        if (!args.to)      missing.push('recipient (to)')
        if (!args.subject) missing.push('subject')
        if (!args.body)    missing.push('body')
        if (missing.length) return `❌ Cannot send — missing: ${missing.join(', ')}. Please ask the user to provide the missing fields.`
        return sendEmail(context, args.to.trim(), args.subject.trim(), args.body.trim())
      }

      case 'reply': {
        if (!args.message_id) return '❌ Cannot reply — missing message_id. Call gmail with action=read first to get the message ID.'
        if (!args.body)       return '❌ Cannot reply — missing body. Please ask the user what they want to say.'
        return replyEmail(context, args.message_id.trim(), args.body.trim())
      }

      case 'forward': {
        if (!args.message_id) return '❌ Cannot forward — missing message_id. Call gmail with action=read first to get the message ID.'
        if (!args.to)         return '❌ Cannot forward — missing recipient (to). Please ask the user who to forward to.'
        return forwardEmail(context, args.message_id.trim(), args.to.trim(), (args.body || '').trim())
      }

      case 'delete': {
        if (!args.message_id) return '❌ Cannot delete — missing message_id. Call gmail with action=read first to get the message ID.'
        return deleteEmail(context, args.message_id.trim())
      }

      default:
        return `❌ Unknown action "${action}". Valid actions: read, send, reply, forward, delete, search.`
    }
  },
}
