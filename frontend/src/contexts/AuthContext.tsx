import { createContext, useContext, useState, useCallback, ReactNode, useEffect, useRef } from 'react';
import { auth } from '../services/api';
import type { User } from '../types';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshToken: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | null>(null);

// Create a global sync lock outside the component to prevent any sync loops
let GLOBAL_SYNC_LOCK = false;
let LAST_SYNC_TIMESTAMP = 0;
let SYNC_ATTEMPT_COUNT = 0;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // We're still using the state for tracking in the current session,
  // but primarily relying on localStorage for persistence
  const storedLastSyncTime = localStorage.getItem('lastSpotifySyncTime');
  const initialLastSyncTime = storedLastSyncTime ? parseInt(storedLastSyncTime, 10) : null;
  const [lastSyncTime, setLastSyncTime] = useState<number | null>(initialLastSyncTime);
  
  // Add a sync lock ref to track syncing state
  const isSyncing = useRef(false);
  const initComplete = useRef(false);
  
  // Increment a counter each time login completes to prevent multiple syncs after login
  const loginCounter = useRef(0);

  // Function to refresh the token
  const refreshToken = useCallback(async (): Promise<boolean> => {
    console.log('=== Refreshing Auth Token ===');
    try {
      const response = await auth.refreshToken();
      
      if (response.success) {
        console.log('Token refreshed successfully');
        // If we got a new session with user data, update it
        if (response.session?.user) {
          localStorage.setItem('session', JSON.stringify(response.session));
          setUser(response.session.user);
        }
        return true;
      } else {
        console.warn('Token refresh failed:', response.error);
        return false;
      }
    } catch (err) {
      console.error('Token refresh error:', err);
      return false;
    }
  }, []);

  // Function to sync playlists automatically with strict safeguards
  const syncSpotifyPlaylists = useCallback(async (forceSync = false) => {
    SYNC_ATTEMPT_COUNT++;
    
    // Debug log every sync attempt with call stack info
    console.log(`[SYNC ATTEMPT #${SYNC_ATTEMPT_COUNT}] ${new Date().toISOString()}`);
    console.log(`Force sync: ${forceSync}, Global lock: ${GLOBAL_SYNC_LOCK}, Component lock: ${isSyncing.current}`);
    console.trace('Sync call stack');
    
    // Strong global lock check
    if (GLOBAL_SYNC_LOCK) {
      console.log('GLOBAL SYNC LOCK ACTIVE - Skipping sync');
      return;
    }
    
    // Local component lock check
    if (isSyncing.current) {
      console.log('LOCAL SYNC LOCK ACTIVE - Skipping sync');
      return;
    }
    
    // Check time since last sync (30 seconds minimum between syncs)
    const currentTime = Date.now();
    const timeSinceLastSync = currentTime - LAST_SYNC_TIMESTAMP;
    const minSyncInterval = 30 * 1000; // 30 seconds
    
    if (!forceSync && timeSinceLastSync < minSyncInterval) {
      console.log(`TOO FREQUENT - Last sync was only ${timeSinceLastSync/1000} seconds ago`);
      return;
    }
    
    // Create a unique sync ID for this sync operation
    const syncId = `sync-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    console.log(`Starting sync operation ${syncId}`);
    
    // Apply both locks
    GLOBAL_SYNC_LOCK = true;
    isSyncing.current = true;
    
    try {
      console.log(`=== Auto-syncing Spotify Playlists (${syncId}) ===`);
      
      // Check if we should sync based on last sync time (sync once every 6 hours)
      const sixHoursMs = 6 * 60 * 60 * 1000;
      
      // Get last sync time from localStorage
      const storedLastSyncTime = localStorage.getItem('lastSpotifySyncTime');
      const lastSyncTimeMs = storedLastSyncTime ? parseInt(storedLastSyncTime, 10) : null;
      
      // Log the current lastSyncTime from state for debugging
      console.log(`Current lastSyncTime: ${lastSyncTime}, from localStorage: ${lastSyncTimeMs}`);
      
      // Skip if we've synced in the last 6 hours AND not forcing a sync
      if (!forceSync && lastSyncTimeMs && (currentTime - lastSyncTimeMs < sixHoursMs)) {
        console.log(`Skipping playlist sync - last sync was ${Math.round((currentTime - lastSyncTimeMs) / (60 * 1000))} minutes ago`);
        return;
      }
      
      // Update the global timestamp before making the API call
      LAST_SYNC_TIMESTAMP = currentTime;
      
      // Use the auth.autoSyncPlaylists endpoint to trigger sync on the server
      console.log(`Making API call for sync ${syncId}`);
      const syncResponse = await auth.autoSyncPlaylists();
      console.log(`API call completed for sync ${syncId}`);
      
      if (syncResponse.success) {
        const newAlbumsAdded = syncResponse.data?.total_added && syncResponse.data.total_added > 0;
        
        console.log(`Playlist sync result: ${newAlbumsAdded ? `Added ${syncResponse.data.total_added} albums` : 'No new albums'}`);
        
        // Store the current time in localStorage
        localStorage.setItem('lastSpotifySyncTime', currentTime.toString());
        
        // Also update state for the current session
        // Use a functional update to avoid closure issues
        setLastSyncTime(currentTime);
        
        // If any albums were added, dispatch an event to refresh the collection
        if (newAlbumsAdded) {
          console.log('Dispatching table refresh event');
          const refreshEvent = new CustomEvent('vinyl-collection-table-refresh');
          window.dispatchEvent(refreshEvent);
        }
        
        console.log(`Sync operation ${syncId} completed successfully`);
      } else {
        console.log(`Sync operation ${syncId} failed or no subscribed playlist found`);
      }
    } catch (err) {
      console.error(`Error during sync ${syncId}:`, err);
    } finally {
      // Release both locks
      console.log(`Releasing locks for sync ${syncId}`);
      isSyncing.current = false;
      
      // Set a timeout to release the global lock after a delay to prevent rapid re-syncs
      setTimeout(() => {
        GLOBAL_SYNC_LOCK = false;
        console.log(`Released global lock for sync ${syncId}`);
      }, 5000);
    }
  }, [lastSyncTime]);

  // Initialize the auth state when component mounts
  useEffect(() => {
    // Don't initialize more than once
    if (initComplete.current) {
      return;
    }
    
    const initializeAuth = async () => {
      console.log('=== Initializing Auth ===');
      initComplete.current = true;
      setIsLoading(true);

      try {
        // First try to get session from localStorage
        const savedSession = localStorage.getItem('session');
        if (savedSession) {
          const parsedSession = JSON.parse(savedSession);
          console.log('Found saved session:', parsedSession);
          
          // Set user from saved session temporarily
          if (parsedSession.user) {
            setUser(parsedSession.user);
          }
          
          // Try to refresh the token first
          const refreshed = await refreshToken();
          if (refreshed) {
            console.log('Session refreshed during initialization');
            
            // Delay the initial sync to avoid initialization loops
            setTimeout(() => {
              syncSpotifyPlaylists(true);
            }, 2000);
            
            setIsLoading(false);
            return;
          }
        }

        // If no saved session or refresh failed, verify session with server
        const response = await auth.getCurrentUser();
        console.log('Server auth check response:', response);

        if (response.success && response.session?.user) {
          // Update session in localStorage and state
          localStorage.setItem('session', JSON.stringify(response.session));
          setUser(response.session.user);
          
          // Delay the initial sync to avoid initialization loops
          setTimeout(() => {
            syncSpotifyPlaylists(true);
          }, 2000);
        } else {
          // Clear invalid session
          localStorage.removeItem('session');
          setUser(null);
        }
      } catch (err) {
        console.error('Auth initialization error:', err);
        
        // On error, keep the user logged in if we have a saved session
        const savedSession = localStorage.getItem('session');
        if (savedSession) {
          try {
            const parsedSession = JSON.parse(savedSession);
            if (parsedSession.user) {
              setUser(parsedSession.user);
              return; // Keep existing session
            }
          } catch (e) {
            console.error('Failed to parse saved session:', e);
          }
        }
        
        // Otherwise clear everything
        localStorage.removeItem('session');
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    };

    initializeAuth();
    
    // Set up periodic token refresh (every 30 minutes)
    const tokenRefreshInterval = setInterval(() => {
      console.log('Running scheduled token refresh');
      if (user) {
        refreshToken().catch(e => 
          console.error('Scheduled token refresh failed:', e)
        );
      }
    }, 30 * 60 * 1000); // 30 minutes
    
    // Set up periodic playlist sync (every 6 hours)
    const playlistSyncInterval = setInterval(() => {
      console.log('Running scheduled playlist sync');
      if (user) {
        syncSpotifyPlaylists(false).catch(e => 
          console.error('Scheduled playlist sync failed:', e)
        );
      }
    }, 6 * 60 * 60 * 1000); // 6 hours
    
    return () => {
      clearInterval(tokenRefreshInterval);
      clearInterval(playlistSyncInterval);
    };
  }, [refreshToken, syncSpotifyPlaylists, user]);

  const login = useCallback(async (email: string, password: string) => {
    setIsLoading(true);
    setError(null);
    
    // Increment login counter to track this login operation
    const currentLoginCount = ++loginCounter.current;
    console.log(`Starting login operation #${currentLoginCount}`);
    
    try {
      const response = await auth.login(email, password);
      
      if (response.success && response.session) {
        console.log(`Login #${currentLoginCount} successful`);
        
        // Save session to localStorage
        localStorage.setItem('session', JSON.stringify(response.session));
        setUser(response.session.user);
        
        // Only perform the sync if this is still the most recent login operation
        // This prevents multiple sync calls from different login attempts
        if (currentLoginCount === loginCounter.current) {
          console.log(`Scheduling sync for login #${currentLoginCount}`);
          
          // Schedule the sync with a longer delay for login
          setTimeout(() => {
            console.log(`Executing delayed sync for login #${currentLoginCount}`);
            syncSpotifyPlaylists(true);
          }, 3000);
        } else {
          console.log(`Skipping sync for superseded login #${currentLoginCount}`);
        }
      } else {
        console.log(`Login #${currentLoginCount} failed: ${response.error}`);
        setError(response.error || 'Login failed');
        setUser(null);
      }
    } catch (err) {
      console.error(`Login #${currentLoginCount} error:`, err);
      setError(err instanceof Error ? err.message : 'Login failed');
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, [syncSpotifyPlaylists]);

  const register = useCallback(async (email: string, password: string) => {
    console.log('Attempting registration...');
    setIsLoading(true);
    setError(null);
    try {
      const response = await auth.register(email, password);
      console.log('Registration response:', response);
      
      if (response.success && response.user) {
        console.log('Setting user after registration:', response.user);
        setUser(response.user);
        // Verify session is set
        await login(email, password);
      } else {
        console.log('Registration failed:', response.error);
        setError(response.error || 'Registration failed');
        setUser(null);
      }
    } catch (err) {
      console.error('Registration error:', err);
      setError(err instanceof Error ? err.message : 'Registration failed');
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, [login]);

  const logout = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      await auth.logout();
      // Clear session from localStorage
      localStorage.removeItem('session');
      setUser(null);
    } catch (err) {
      console.error('Logout error:', err);
      setError(err instanceof Error ? err.message : 'Logout failed');
    } finally {
      setIsLoading(false);
    }
  }, []);

  console.log('Current auth state:', { user, isLoading, error });

  return (
    <AuthContext.Provider value={{ user, isLoading, error, login, register, logout, refreshToken }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
} 
