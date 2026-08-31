/**
 * Billing status. Primary source is the `me` Cloud Function, which decides
 * the plan the same way the draft proxy does (Stripe subscription or comped
 * account) and records comps as it goes. Falls back to reading
 * subscriptions/{uid} directly (rules allow owner read, no client writes)
 * when the function is unreachable.
 */

import { getAuth } from './auth';
import { FIRESTORE_URL, ME_FUNCTION_URL } from './config';

/** Statuses that grant Pro limits; mirrors PRO_STATUSES in the backend */
const PRO_STATUSES = ['active', 'trialing', 'past_due'];

export interface BillingStatus {
  uid: string | null;
  plan: 'pro' | 'free';
  /** Raw Stripe subscription status, null when never subscribed */
  status: string | null;
  /** Pro granted without payment (owner / support accounts) */
  comped: boolean;
  /** Daily managed-draft allowance for this plan, when the backend reported it */
  dailyLimit: number | null;
}

const FREE: Omit<BillingStatus, 'uid'> = { plan: 'free', status: null, comped: false, dailyLimit: null };

export async function getBillingStatus(): Promise<BillingStatus> {
  const auth = await getAuth();
  if (!auth) return { uid: null, ...FREE };

  // 1. Authoritative: the backend
  try {
    const response = await fetch(ME_FUNCTION_URL, {
      headers: { authorization: `Bearer ${auth.idToken}` },
    });
    if (response.ok) {
      const body = await response.json();
      return {
        uid: auth.uid,
        plan: body.plan === 'pro' ? 'pro' : 'free',
        status: typeof body.status === 'string' ? body.status : null,
        comped: !!body.comped,
        dailyLimit: typeof body.dailyLimit === 'number' ? body.dailyLimit : null,
      };
    }
  } catch {
    // Fall through to the direct read
  }

  // 2. Fallback: the subscription doc
  try {
    const response = await fetch(`${FIRESTORE_URL}/subscriptions/${auth.uid}`, {
      headers: { authorization: `Bearer ${auth.idToken}` },
    });
    if (!response.ok) return { uid: auth.uid, ...FREE };
    const doc = await response.json();
    const status: string | null = doc.fields?.status?.stringValue ?? null;
    const plan: string | null = doc.fields?.plan?.stringValue ?? null;
    const pro = status !== null && PRO_STATUSES.includes(status);
    return {
      uid: auth.uid,
      plan: pro ? 'pro' : 'free',
      status,
      comped: pro && plan === 'comped',
      dailyLimit: null,
    };
  } catch {
    return { uid: auth.uid, ...FREE };
  }
}
