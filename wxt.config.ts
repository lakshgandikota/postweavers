import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'PostWeavers: AI Replies in Your Voice',
    description: 'Drafts X replies in your voice. You read, edit, and press Post yourself. Never automated.',
    permissions: ['activeTab', 'storage', 'sidePanel', 'tabs', 'unlimitedStorage', 'alarms', 'identity'],
    host_permissions: [
      '*://twitter.com/*',
      '*://x.com/*',
      '*://pro.twitter.com/*',
      '*://pro.x.com/*',
      'https://api.anthropic.com/*',
      'https://api.openai.com/*',
      'https://identitytoolkit.googleapis.com/*',
      'https://securetoken.googleapis.com/*',
      'https://firestore.googleapis.com/*',
      'https://us-central1-postweaver-20d14.cloudfunctions.net/*'
    ],
    action: {
      default_title: 'Open PostWeavers'
    },
    commands: {
      'toggle-sidebar': {
        suggested_key: { default: 'Ctrl+Shift+S', mac: 'Command+Shift+S' },
        description: 'Toggle Postweaver sidebar'
      },
      'toggle-enabled': {
        suggested_key: { default: 'Ctrl+Shift+E', mac: 'Command+Shift+E' },
        description: 'Enable/disable Postweaver'
      }
    },
    icons: {
      16: 'icons/icon16.png',
      48: 'icons/icon48.png',
      128: 'icons/icon128.png'
    },
    web_accessible_resources: [
      {
        resources: ['interceptor.js'],
        matches: [
          '*://twitter.com/*',
          '*://x.com/*',
          '*://pro.twitter.com/*',
          '*://pro.x.com/*'
        ]
      }
    ]
  }
});
