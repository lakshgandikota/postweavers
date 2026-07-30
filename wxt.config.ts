import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'PostWeavers: AI Replies in Your Voice',
    // Item identity public key from the published store package. Pinning it
    // makes unpacked dev builds load under the store extension ID, so the
    // chromiumapp.org OAuth redirect URI is the same in dev and production.
    key: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAukAKnsRNmh72+hKIqGHaK/vhCXcfErg1rPQdmFcq1oE4bTUijoPydH2WTunKPXfmgaI8tlekRoaBs63BjHoLFEzs7xInoMpEkr9VKkYgW7OVNJFnx1cxAiAXpPHqD/uHV65s4cr62YtJLM/pgT0/mDffvhE9ejnvgjuak5zR1WyFk1wTrTuEGmJ6qBhLTpYUqJOMR5+zHU60P6VNi+glNyybH1nxC6bRy45xcUDnVsVjSgHPzJdbQ9FPSzexNIYGURg6OumXODuZGLXSpYSH3gSx2zt9bbGRzU0bvPjh5ybRV2DxoezPmCQOprLwJZnIJGxx0GpIuoy6o00DoKi37wIDAQAB',
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
