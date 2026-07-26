/**
 * Billing status via Firestore REST: reads subscriptions/{uid}, which only
 * the Stripe webhook writes (rules allow owner read, no client writes).
 */

import { getAuth } from './auth';
import { FIRESTORE_URL } from './config';

/** Statuses that grant Pro limits — mirrors PRO_STATUSES in the backend */
const PRO_STATUSES = ['active', 'trialing', 'past_due'];

export interface BillingStatus {
  uid: string | null;
  plan: 'pro' | 'free';
  /** Raw Stripe subscription status, null when never subscribed */
  status: string | null;
}

export async function getBillingStatus(): Promise<BillingStatus> {
  const auth = await getAuth();
  if (!auth) return { uid: null, plan: 'free', status: null };
  try {
    const response = await fetch(`${FIRESTORE_URL}/subscriptions/${auth.uid}`, {
      headers: { authorization: `Bearer ${auth.idToken}` },
    });
    if (!response.ok) return { uid: auth.uid, plan: 'free', status: null };
    const doc = await response.json();
    const status: string | null = doc.fields?.status?.stringValue ?? null;
    const pro = status !== null && PRO_STATUSES.includes(status);
    return { uid: auth.uid, plan: pro ? 'pro' : 'free', status };
  } catch {
    return { uid: auth.uid, plan: 'free', status: null };
  }
}
