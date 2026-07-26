// entrypoints/interceptor-loader.content.ts
// Early content script that injects the fetch interceptor at document_start
// This ensures we override fetch BEFORE X.com's JavaScript caches it

import { injectScript } from 'wxt/client';

export default defineContentScript({
  matches: [
    '*://twitter.com/*',
    '*://x.com/*',
    '*://pro.twitter.com/*',
    '*://pro.x.com/*',
  ],
  runAt: 'document_start', // Critical: run before any page scripts
  async main() {
    try {
      // Inject interceptor immediately at document_start
      await injectScript('/interceptor.js', { keepInDom: true });
      console.log('[Postweaver] Interceptor injected at document_start');
    } catch (error) {
      console.error('[Postweaver] Failed to inject interceptor:', error);
    }
  },
});
