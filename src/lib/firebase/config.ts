/**
 * Firebase project configuration (public client config — not a secret;
 * access control is enforced by Firestore security rules + Auth).
 */
export const FIREBASE_CONFIG = {
  projectId: 'postweaver-20d14',
  apiKey: 'AIzaSyB3QxiqZWtnSoN5xyqrMxO5OZclndeFghQ',
  appId: '1:604907496270:web:0a5f1363bb2484a0f4341f',
  /** Web OAuth client auto-provisioned by Firebase for Google sign-in */
  googleClientId: '604907496270-dh2sgnmmr6p3mfiignaslvjm6e751us8.apps.googleusercontent.com',
} as const;

export const IDENTITY_TOOLKIT_URL = 'https://identitytoolkit.googleapis.com/v1';
export const SECURE_TOKEN_URL = 'https://securetoken.googleapis.com/v1';
export const FIRESTORE_URL = `https://firestore.googleapis.com/v1/projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents`;

/** Managed-key draft proxy (Cloud Function) */
export const DRAFT_FUNCTION_URL = `https://us-central1-${FIREBASE_CONFIG.projectId}.cloudfunctions.net/draft`;

/**
 * Stripe Payment Link for the Cloud Pro plan ($12/mo). Empty until the
 * Stripe product + payment link exist; the upgrade button hides while empty.
 * The Firebase uid is appended as client_reference_id so the webhook can
 * attribute the subscription.
 */
export const STRIPE_PAYMENT_LINK_URL = 'https://buy.stripe.com/00w28t4Ah7spaMucPm6Vq00';

/**
 * Stripe customer portal login (no-code): subscribers enter their email,
 * get a magic link, and can cancel / change card / download invoices.
 */
export const STRIPE_PORTAL_URL = 'https://billing.stripe.com/p/login/00w28t4Ah7spaMucPm6Vq00';
