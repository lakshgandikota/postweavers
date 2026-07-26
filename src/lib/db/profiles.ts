/**
 * Profile storage operations for Postweaver data capture
 * Provides CRUD operations for captured profiles in IndexedDB
 */

import type { Profile, ProfileSnapshot } from '../../types/capture';
import { initDatabase, STORES } from './schema';

/**
 * Upsert a profile (insert or update if exists).
 */
export async function upsertProfile(profile: Profile): Promise<void> {
  const db = await initDatabase();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.PROFILES, 'readwrite');
    const store = tx.objectStore(STORES.PROFILES);

    const request = store.put(profile);

    request.onerror = () => {
      console.error('[Postweaver] Failed to upsert profile:', request.error);
      reject(request.error);
    };

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Get a profile by user ID.
 */
export async function getProfile(userId: string): Promise<Profile | undefined> {
  const db = await initDatabase();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.PROFILES, 'readonly');
    const store = tx.objectStore(STORES.PROFILES);
    const request = store.get(userId);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get a profile by handle (@username).
 */
export async function getProfileByHandle(handle: string): Promise<Profile | undefined> {
  const db = await initDatabase();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.PROFILES, 'readonly');
    const store = tx.objectStore(STORES.PROFILES);
    const index = store.index('handle');
    const request = index.get(handle);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Add a snapshot of profile metrics for history tracking.
 */
export async function addProfileSnapshot(snapshot: ProfileSnapshot): Promise<void> {
  const db = await initDatabase();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.PROFILE_HISTORY, 'readwrite');
    const store = tx.objectStore(STORES.PROFILE_HISTORY);

    const request = store.put(snapshot);

    request.onerror = () => {
      console.error('[Postweaver] Failed to add profile snapshot:', request.error);
      reject(request.error);
    };

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Get profile history (all snapshots for a profile).
 */
export async function getProfileHistory(profileId: string): Promise<ProfileSnapshot[]> {
  const db = await initDatabase();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.PROFILE_HISTORY, 'readonly');
    const store = tx.objectStore(STORES.PROFILE_HISTORY);
    const index = store.index('profileId');
    const request = index.getAll(profileId);

    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Delete profiles captured before a given timestamp.
 */
export async function deleteProfilesBefore(timestamp: number): Promise<number> {
  const db = await initDatabase();
  let deletedCount = 0;

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.PROFILES, 'readwrite');
    const store = tx.objectStore(STORES.PROFILES);
    const index = store.index('capturedAt');
    const range = IDBKeyRange.upperBound(timestamp);
    const request = index.openCursor(range);

    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
      if (cursor) {
        cursor.delete();
        deletedCount++;
        cursor.continue();
      }
    };

    tx.oncomplete = () => {
      console.log(`[Postweaver] Deleted ${deletedCount} old profiles`);
      resolve(deletedCount);
    };
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Delete profile history before a given timestamp.
 */
export async function deleteProfileHistoryBefore(timestamp: number): Promise<number> {
  const db = await initDatabase();
  let deletedCount = 0;

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.PROFILE_HISTORY, 'readwrite');
    const store = tx.objectStore(STORES.PROFILE_HISTORY);
    const index = store.index('timestamp');
    const range = IDBKeyRange.upperBound(timestamp);
    const request = index.openCursor(range);

    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
      if (cursor) {
        cursor.delete();
        deletedCount++;
        cursor.continue();
      }
    };

    tx.oncomplete = () => {
      console.log(`[Postweaver] Deleted ${deletedCount} old profile snapshots`);
      resolve(deletedCount);
    };
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Get total count of profiles.
 */
export async function getProfileCount(): Promise<number> {
  const db = await initDatabase();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.PROFILES, 'readonly');
    const store = tx.objectStore(STORES.PROFILES);
    const request = store.count();

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
