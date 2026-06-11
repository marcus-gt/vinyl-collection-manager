import { useCallback, useRef } from 'react';
import { auth } from '../services/api';
import { appEvents } from '../lib/appEvents';

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
const LAST_SYNC_KEY = 'lastSpotifySyncTime';

/**
 * Triggers the server-side Spotify playlist sync. Concurrency is guarded by a
 * ref lock, and a localStorage timestamp throttles automatic (non-forced) syncs
 * to at most once every 6 hours. When new albums are imported, a `tableRefresh`
 * event is emitted so the collection view reloads.
 *
 * Returns a `syncNow(force?)` callback. Pass `force = true` for explicit syncs
 * (e.g. right after login); omit it for periodic/background syncs.
 */
export function useSpotifySync() {
  const isSyncing = useRef(false);

  const syncNow = useCallback(async (force = false): Promise<void> => {
    if (isSyncing.current) return;

    const stored = localStorage.getItem(LAST_SYNC_KEY);
    const lastSyncMs = stored ? parseInt(stored, 10) : null;
    if (!force && lastSyncMs && Date.now() - lastSyncMs < SIX_HOURS_MS) {
      return;
    }

    isSyncing.current = true;
    try {
      const response = await auth.autoSyncPlaylists();
      if (response.success) {
        localStorage.setItem(LAST_SYNC_KEY, Date.now().toString());
        const added = response.data?.total_added ?? 0;
        if (added > 0) {
          appEvents.emit('tableRefresh');
        }
      }
    } catch (err) {
      console.error('Spotify playlist sync failed:', err);
    } finally {
      isSyncing.current = false;
    }
  }, []);

  return syncNow;
}
