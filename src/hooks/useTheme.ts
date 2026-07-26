import { useState, useEffect } from 'react';
import { sendMessageToTab } from '../lib/messaging';

/**
 * X.com domain patterns for checking if current tab is on X
 */
const X_DOMAIN_PATTERNS = [
  'twitter.com',
  'x.com',
  'pro.twitter.com',
  'pro.x.com',
];

/**
 * Check if a URL is an X.com domain
 */
function isXDomain(url: string): boolean {
  try {
    const hostname = new URL(url).hostname;
    return X_DOMAIN_PATTERNS.some(
      (pattern) => hostname === pattern || hostname.endsWith('.' + pattern)
    );
  } catch {
    return false;
  }
}

/**
 * Get system color scheme preference
 */
function getSystemTheme(): 'light' | 'dark' {
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  }
  return 'light';
}

/**
 * React hook for detecting theme and X.com domain status
 * Queries the current tab to check domain and get theme from content script
 */
export function useTheme() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [isOnXDomain, setIsOnXDomain] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function detectTheme() {
      try {
        // Get the current active tab
        const [tab] = await chrome.tabs.query({
          active: true,
          currentWindow: true,
        });

        if (!mounted) return;

        const url = tab?.url || '';
        const onX = isXDomain(url);
        setIsOnXDomain(onX);

        if (onX && tab?.id !== undefined) {
          // Query the content script for X.com's theme
          try {
            const response = await sendMessageToTab(tab.id, { type: 'GET_THEME' });
            if (mounted && response?.theme) {
              setTheme(response.theme);
            }
          } catch {
            // Content script might not be ready, fall back to system preference
            if (mounted) {
              setTheme(getSystemTheme());
            }
          }
        } else {
          // Not on X.com, use system preference
          if (mounted) {
            setTheme(getSystemTheme());
          }
        }
      } catch {
        // Error getting tab info, use system preference
        if (mounted) {
          setTheme(getSystemTheme());
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    detectTheme();

    // Listen for tab changes
    function handleTabActivated() {
      detectTheme();
    }

    function handleTabUpdated(
      _tabId: number,
      changeInfo: chrome.tabs.TabChangeInfo
    ) {
      // Re-detect when URL changes
      if (changeInfo.url) {
        detectTheme();
      }
    }

    chrome.tabs.onActivated.addListener(handleTabActivated);
    chrome.tabs.onUpdated.addListener(handleTabUpdated);

    return () => {
      mounted = false;
      chrome.tabs.onActivated.removeListener(handleTabActivated);
      chrome.tabs.onUpdated.removeListener(handleTabUpdated);
    };
  }, []);

  return { theme, isOnXDomain, loading };
}
