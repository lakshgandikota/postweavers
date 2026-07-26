// entrypoints/interceptor.ts
// WXT unlisted script entrypoint for MAIN world injection
// This script runs in page context (MAIN world) - NO access to chrome.* APIs
// Must use postMessage to communicate with extension content script

import { defineUnlistedScript } from 'wxt/sandbox';

/**
 * Message type sent to extension content script
 */
interface GraphQLMessage {
  type: 'POSTWEAVER_GRAPHQL_RESPONSE';
  payload: {
    url: string;
    operationName: string;
    data: unknown;
    timestamp: number;
  };
}

export default defineUnlistedScript(() => {
  // Track if already initialized (prevent double-injection)
  if ((window as unknown as { __postweaverInterceptorActive?: boolean }).__postweaverInterceptorActive) {
    return;
  }
  (window as unknown as { __postweaverInterceptorActive?: boolean }).__postweaverInterceptorActive = true;

  /**
   * Send GraphQL data to content script
   */
  function sendGraphQLData(url: string, data: unknown): void {
    try {
      // Extract operation name from URL path
      // X.com uses /i/api/graphql/{queryId}/{operationName}
      const urlParts = url.split('/');
      const operationName = urlParts[urlParts.length - 1]?.split('?')[0] || 'unknown';

      const message: GraphQLMessage = {
        type: 'POSTWEAVER_GRAPHQL_RESPONSE',
        payload: {
          url,
          operationName,
          data,
          timestamp: Date.now(),
        },
      };

      window.postMessage(message, '*');
    } catch (error) {
      console.error('[Postweaver Interceptor] Error sending data:', error);
    }
  }

  /**
   * Override XMLHttpRequest to intercept GraphQL responses
   * X.com uses XHR, not fetch, for their API calls
   */
  const originalXHROpen = XMLHttpRequest.prototype.open;
  const originalXHRSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function(
    method: string,
    url: string | URL,
    async?: boolean,
    username?: string | null,
    password?: string | null
  ): void {
    // Store URL for later use in send()
    (this as XMLHttpRequest & { _postweaverUrl?: string })._postweaverUrl = String(url);
    return originalXHROpen.apply(this, [method, url, async ?? true, username, password]);
  };

  XMLHttpRequest.prototype.send = function(body?: Document | XMLHttpRequestBodyInit | null): void {
    const xhr = this as XMLHttpRequest & { _postweaverUrl?: string };
    const url = xhr._postweaverUrl || '';

    // Only intercept GraphQL API calls
    if (url.includes('/i/api/graphql/')) {
      xhr.addEventListener('load', function() {
        try {
          if (xhr.status >= 200 && xhr.status < 300 && xhr.responseText) {
            const data = JSON.parse(xhr.responseText);
            sendGraphQLData(url, data);
          }
        } catch {
          // Silent fail - don't break page functionality
        }
      });
    }

    return originalXHRSend.apply(this, [body]);
  };

  // Also override fetch as a fallback (some requests might use fetch)
  const originalFetch = window.fetch;
  window.fetch = async function(...args: Parameters<typeof fetch>): Promise<Response> {
    const response = await originalFetch.apply(this, args);

    try {
      const url = args[0] instanceof Request ? args[0].url : String(args[0]);

      if (url.includes('/i/api/graphql/')) {
        const clonedResponse = response.clone();
        const data = await clonedResponse.json();
        sendGraphQLData(url, data);
      }
    } catch {
      // Silent fail
    }

    return response;
  };

  console.log('[Postweaver] API interceptor active (XHR + fetch)');
});
