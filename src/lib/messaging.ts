import type { ExtensionMessage, MessageResponse } from '../types/messages';

/**
 * Send a message to the background service worker
 * Returns a typed response based on the message type
 */
export function sendMessage<T extends ExtensionMessage>(
  message: T
): Promise<MessageResponse<T['type']>> {
  return chrome.runtime.sendMessage(message);
}

/**
 * Send a message to a specific tab's content script
 * Returns a typed response based on the message type
 */
export function sendMessageToTab<T extends ExtensionMessage>(
  tabId: number,
  message: T
): Promise<MessageResponse<T['type']>> {
  return chrome.tabs.sendMessage(tabId, message);
}

/**
 * Register a message handler for incoming messages
 * Handler can return a value (sync) or Promise (async)
 *
 * Note: Returns true from the listener to keep the message channel open
 * for async responses. This is required for chrome.runtime.sendMessage
 * to work with async handlers.
 */
export function onMessage(
  handler: (
    message: ExtensionMessage,
    sender: chrome.runtime.MessageSender
  ) => Promise<unknown> | unknown
): void {
  chrome.runtime.onMessage.addListener(
    (
      message: ExtensionMessage,
      sender: chrome.runtime.MessageSender,
      sendResponse: (response?: unknown) => void
    ) => {
      // Handle both sync and async responses
      const result = handler(message, sender);

      if (result instanceof Promise) {
        result
          .then((response) => sendResponse(response))
          .catch((error) => {
            console.error('[Postweaver] Message handler error:', error);
            sendResponse({ success: false, error: String(error) });
          });
        // Return true to indicate we will send a response asynchronously
        return true;
      }

      // Sync response
      sendResponse(result);
      return false;
    }
  );
}
