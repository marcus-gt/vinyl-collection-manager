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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // We're still using the state for tracking in the current session,
  // but primarily relying on localStorage for persistence
  const storedLastSyncTime = localStorage.getItem('lastSpotifySyncTime');
  const initialLastSyncTime = storedLastSyncTime ? parseInt(storedLastSyncTime, 10) : null;
  const [lastSyncTime, setLastSyncTime] = useState<number | null>(initialLastSyncTime);
  
  // Add a sync lock to prevent multiple syncs from happening simultaneously
  const isSyncing = useRef(false);

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

  // Function to sync playlists automatically
  const syncSpotifyPlaylists = useCallback(async (forceSync = false) => {
    // If already syncing, don't start another sync
    if (isSyncing.current) {
      console.log('Sync already in progress, skipping');
      return;
    }
    
    // Get last sync time from localStorage
    const storedLastSyncTime = localStorage.getItem('lastSpotifySyncTime');
    const lastSyncTimeMs = storedLastSyncTime ? parseInt(storedLastSyncTime, 10) : null;
    const currentTime = Date.now();
    
    // If not forcing and we synced in the last 5 minutes, skip as a safeguard against rapid sync calls
    const fiveMinutesMs = 5 * 60 * 1000;
    if (!forceSync && lastSyncTimeMs && (currentTime - lastSyncTimeMs < fiveMinutesMs)) {
      console.log(`Safeguard: Skipping sync - last sync was only ${Math.round((currentTime - lastSyncTimeMs) / 1000)} seconds ago`);
      return;
    }
    
    try {
      // Set the syncing lock
      isSyncing.current = true;
      console.log('=== Auto-syncing Spotify Playlists ===');
      console.log(`Force sync: ${forceSync}`);
      
      // Check if we should sync based on last sync time (sync once every 6 hours)
      const sixHoursMs = 6 * 60 * 60 * 1000;
      
      // Log the current lastSyncTime from state for debugging
      console.log(`Current lastSyncTime state: ${lastSyncTime}, from localStorage: ${lastSyncTimeMs}`);
      
      // Skip if we've synced in the last 6 hours AND not forcing a sync
      if (!forceSync && lastSyncTimeMs && (currentTime - lastSyncTimeMs < sixHoursMs)) {
        console.log(`Skipping playlist sync - last sync was ${Math.round((currentTime - lastSyncTimeMs) / (60 * 1000))} minutes ago`);
        return;
      }
      
      // Use the auth.autoSyncPlaylists endpoint to trigger sync on the server
      const syncResponse = await auth.autoSyncPlaylists();
      
      if (syncResponse.success) {
        const newAlbumsAdded = syncResponse.data?.total_added && syncResponse.data.total_added > 0;
        
        console.log(`Playlist sync result: ${newAlbumsAdded ? `Added ${syncResponse.data.total_added} albums` : 'No new albums'}`);
        
        // Store the current time in localStorage
        localStorage.setItem('lastSpotifySyncTime', currentTime.toString());
        // Also update state for the current session
        setLastSyncTime(currentTime);
        
        // If any albums were added, dispatch an event to refresh the collection
        if (newAlbumsAdded) {
          console.log('Dispatching table refresh event');
          const refreshEvent = new CustomEvent('vinyl-collection-table-refresh');
          window.dispatchEvent(refreshEvent);
        }
      } else {
        console.log('Playlist sync failed or no subscribed playlist found');
      }
    } catch (err) {
      console.error('Error during auto-sync:', err);
    } finally {
      // Always release the sync lock
      isSyncing.current = false;
    }
  }, [lastSyncTime]);

  // Try to restore session on mount
  useEffect(() => {
    const initializeAuth = async () => {
      console.log('=== Initializing Auth ===');
      setIsLoading(true);
      let didSync = false;

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
            // Only sync if we haven't synced yet in this initialization
            if (!didSync) {
              syncSpotifyPlaylists(true);
              didSync = true;
            }
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
          
          // Only sync if we haven't synced yet in this initialization
          if (!didSync) {
            syncSpotifyPlaylists(true);
            didSync = true;
          }
        } else {
          // Clear invalid session
          localStorage.removeItem('session');
          setUser(null);
        }
      } catch (err) {
        // On error, keep the user logged in if we have a saved session
        const savedSession = localStorage.getItem('session');
        if (savedSession) {
          try {
            const parsedSession = JSON.parse(savedSession);
            if (parsedSession.user) {
              setUser(parsedSession.user);
              // Try to refresh the token
              refreshToken().catch(e => 
                console.error('Background token refresh failed:', e)
              );
              // Try to sync playlists only if we haven't already
              if (!didSync) {
                syncSpotifyPlaylists(true);
                didSync = true;
              }
              return; // Keep existing session
            }
          } catch (e) {
            console.error('Failed to parse saved session:', e);
          }
        }
        
        // Otherwise clear everything
        console.error('Auth initialization error:', err);
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
  }, [refreshToken, syncSpotifyPlaylists]);

  const login = useCallback(async (email: string, password: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await auth.login(email, password);
      
      if (response.success && response.session) {
        // Save session to localStorage
        localStorage.setItem('session', JSON.stringify(response.session));
        setUser(response.session.user);
        
        // Schedule the sync with a small delay to avoid initialization loops
        setTimeout(() => {
          syncSpotifyPlaylists(true);
        }, 1000);
      } else {
        setError(response.error || 'Login failed');
        setUser(null);
      }
    } catch (err) {
      console.error('Login error:', err);
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
