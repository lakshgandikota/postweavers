import { useState, useEffect } from 'react';
import type { Topic } from '../types/topics';
import { getTopics, subscribeToTopics } from '../lib/topics';

/**
 * Live list of the user's topics (non-deleted, most recently updated first),
 * kept current across every extension context via storage subscriptions.
 */
export function useTopics(): { topics: Topic[]; loading: boolean } {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getTopics().then((loaded) => {
      setTopics(loaded);
      setLoading(false);
    });
    return subscribeToTopics(setTopics);
  }, []);

  return { topics, loading };
}
