import { useState, useEffect } from 'react';
import { getSettings, updateSettings, subscribeToSettings, DEFAULTS } from '../lib/storage';
import type { ExtensionSettings } from '../types/settings';

/**
 * React hook for managing extension settings
 * Provides reactive settings state with automatic updates from storage
 */
export function useSettings() {
  const [settings, setSettings] = useState<ExtensionSettings>(DEFAULTS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Load initial settings
    getSettings().then((s) => {
      setSettings(s);
      setLoading(false);
    });

    // Subscribe to changes from other contexts
    const unsubscribe = subscribeToSettings(setSettings);
    return unsubscribe;
  }, []);

  const update = async (updates: Partial<ExtensionSettings>) => {
    await updateSettings(updates);
    // Settings will update via subscription
  };

  return { settings, update, loading };
}
