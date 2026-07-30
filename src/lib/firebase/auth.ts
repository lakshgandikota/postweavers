/**
 * Firebase Auth via REST (no SDK — keeps the MV3 bundle lean).
 *
 * Today: anonymous sign-in, one account per install, persisted in
 * chrome.storage.local. Later: swap signInAnonymously for a real provider
 * and link the anonymous account (Firebase supports linking, so synced data
 * survives the upgrade).
 */

import { FIREBASE_CONFIG, IDENTITY_TOOLKIT_URL, SECURE_TOKEN_URL } from './config';

const AUTH_STORAGE_KEY = 'postweaver_firebase_auth';

interface StoredAuth {
  uid: string;
  idToken: string;
  refreshToken: string;
  /** Epoch ms when idToken expires */
  expiresAt: number;
  /** Google account email once linked/signed in ('' while anonymous) */
  email?: string;
}

/**
 * Get a valid ID token + uid, signing in anonymously on first use and
 * refreshing when expired. Returns null when Firebase Auth is unreachable
 * or not yet enabled — callers treat sync as best-effort.
 */
export async function getAuth(): Promise<{ uid: string; idToken: string } | null> {
  const stored = await readStoredAuth();

  if (stored && Date.now() < stored.expiresAt - 60_000) {
    return { uid: stored.uid, idToken: stored.idToken };
  }

  if (stored?.refreshToken) {
    const refreshed = await refreshIdToken(stored.refreshToken);
    if (refreshed) return { uid: refreshed.uid, idToken: refreshed.idToken };
  }

  return signInAnonymously();
}

async function signInAnonymously(): Promise<{ uid: string; idToken: string } | null> {
  try {
    const response = await fetch(
      `${IDENTITY_TOOLKIT_URL}/accounts:signUp?key=${FIREBASE_CONFIG.apiKey}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ returnSecureToken: true }),
      }
    );
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      console.warn(
        '[Postweaver] Anonymous sign-in failed:',
        body?.error?.message ?? response.status,
        body?.error?.message === 'ADMIN_ONLY_OPERATION'
          ? '(enable Anonymous sign-in in Firebase console → Authentication)'
          : ''
      );
      return null;
    }
    const data = await response.json();
    const auth: StoredAuth = {
      uid: data.localId,
      idToken: data.idToken,
      refreshToken: data.refreshToken,
      expiresAt: Date.now() + Number(data.expiresIn ?? 3600) * 1000,
    };
    await chrome.storage.local.set({ [AUTH_STORAGE_KEY]: auth });
    console.log('[Postweaver] Signed in to Firebase (anonymous):', auth.uid);
    return { uid: auth.uid, idToken: auth.idToken };
  } catch (error) {
    console.warn('[Postweaver] Firebase sign-in unreachable:', error);
    return null;
  }
}

async function refreshIdToken(
  refreshToken: string
): Promise<{ uid: string; idToken: string } | null> {
  try {
    const response = await fetch(`${SECURE_TOKEN_URL}/token?key=${FIREBASE_CONFIG.apiKey}`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }),
    });
    if (!response.ok) return null;
    const data = await response.json();
    const previous = await readStoredAuth();
    const auth: StoredAuth = {
      uid: data.user_id,
      idToken: data.id_token,
      refreshToken: data.refresh_token,
      expiresAt: Date.now() + Number(data.expires_in ?? 3600) * 1000,
      email: previous?.email ?? '',
    };
    await chrome.storage.local.set({ [AUTH_STORAGE_KEY]: auth });
    return { uid: auth.uid, idToken: auth.idToken };
  } catch {
    return null;
  }
}

async function readStoredAuth(): Promise<StoredAuth | null> {
  const result = await chrome.storage.local.get(AUTH_STORAGE_KEY);
  return (result[AUTH_STORAGE_KEY] as StoredAuth | undefined) ?? null;
}

/** The Google email this install syncs as, or null while anonymous */
export async function getSyncAccountEmail(): Promise<string | null> {
  const stored = await readStoredAuth();
  return stored?.email || null;
}

/**
 * The OAuth redirect URI for this install. Must be added once to the web
 * OAuth client's "Authorized redirect URIs" in Google Cloud console.
 */
export function getRedirectUri(): string {
  return chrome.identity.getRedirectURL();
}

/**
 * Sign in with Google, LINKING the current anonymous account when possible
 * so the synced data keeps its uid. If the Google account already exists as
 * a separate Firebase user, falls back to plain sign-in (new uid) — the
 * caller should push local settings afterward so the new subtree is
 * populated.
 */
export async function linkWithGoogle(): Promise<
  { ok: true; email: string; linked: boolean } | { ok: false; error: string }
> {
  const current = await getAuth();

  // 1. Google implicit flow via the browser's identity API
  const nonce = crypto.randomUUID();
  const authUrl =
    'https://accounts.google.com/o/oauth2/v2/auth' +
    `?client_id=${FIREBASE_CONFIG.googleClientId}` +
    `&response_type=id_token` +
    `&redirect_uri=${encodeURIComponent(getRedirectUri())}` +
    `&scope=${encodeURIComponent('openid email profile')}` +
    `&nonce=${nonce}` +
    '&prompt=select_account';

  let redirectUrl: string | undefined;
  try {
    redirectUrl = await chrome.identity.launchWebAuthFlow({
      url: authUrl,
      interactive: true,
    });
  } catch (error) {
    // Developer detail stays in the console; users get something actionable.
    console.warn(
      `[PostWeavers] Google sign-in failed: ${String(error)}. ` +
        `If this is a fresh setup, add ${getRedirectUri()} to the web OAuth ` +
        "client's Authorized redirect URIs in Google Cloud console → Credentials."
    );
    return {
      ok: false,
      error:
        'Google sign-in did not complete. Signing in is optional: you can keep ' +
        'drafting with your own API key. If this keeps happening, email ' +
        'hello@postweavers.com.',
    };
  }

  const fragment = new URLSearchParams(redirectUrl?.split('#')[1] ?? '');
  const googleIdToken = fragment.get('id_token');
  if (!googleIdToken) {
    return { ok: false, error: 'Google returned no ID token.' };
  }

  // 2. Exchange with Firebase — link to the anonymous account when we have one
  const attempt = async (linkTo: string | null) => {
    const response = await fetch(
      `${IDENTITY_TOOLKIT_URL}/accounts:signInWithIdp?key=${FIREBASE_CONFIG.apiKey}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          postBody: `id_token=${googleIdToken}&providerId=google.com`,
          requestUri: 'http://localhost',
          returnSecureToken: true,
          returnIdpCredential: true,
          ...(linkTo ? { idToken: linkTo } : {}),
        }),
      }
    );
    return { ok: response.ok, data: await response.json() };
  };

  let linked = !!current;
  let result = await attempt(current?.idToken ?? null);

  // Google account already exists as its own Firebase user → plain sign-in
  if (!result.ok) {
    const message = result.data?.error?.message ?? '';
    if (/EMAIL_EXISTS|FEDERATED_USER_ID_ALREADY_LINKED|CREDENTIAL_TOO_OLD/.test(message)) {
      linked = false;
      result = await attempt(null);
    }
  }
  if (!result.ok) {
    return { ok: false, error: `Firebase rejected the sign-in: ${result.data?.error?.message ?? '?'}` };
  }

  const data = result.data;
  const auth: StoredAuth = {
    uid: data.localId,
    idToken: data.idToken,
    refreshToken: data.refreshToken,
    expiresAt: Date.now() + Number(data.expiresIn ?? 3600) * 1000,
    email: data.email ?? '',
  };
  await chrome.storage.local.set({ [AUTH_STORAGE_KEY]: auth });
  console.log(`[Postweaver] Google sign-in complete (${linked ? 'linked' : 'switched account'}):`, auth.email);
  return { ok: true, email: auth.email ?? '', linked };
}
