import { createContext, useContext, useState, useCallback, ReactNode, useEffect, useRef } from 'react';
import { auth } from '../services/api';
import type { User } from '../types';
import { useSpotifySync } from '../hooks/useSpotifySync';

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

  // Spotify playlist sync (concurrency + throttling handled inside the hook).
  const syncNow = useSpotifySync();

  const initComplete = useRef(false);

  // Increment a counter each time login completes to prevent multiple syncs after login
  const loginCounter = useRef(0);

  // Function to refresh the token
  const refreshToken = useCallback(async (): Promise<boolean> => {
    try {
      const response = await auth.refreshToken();
      
      if (response.success) {
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

  // Initialize the auth state when component mounts
  useEffect(() => {
    // Don't initialize more than once
    if (initComplete.current) {
      return;
    }
    
    const initializeAuth = async () => {
      initComplete.current = true;
      setIsLoading(true);

      try {
        // First try to get session from localStorage
        const savedSession = localStorage.getItem('session');
        if (savedSession) {
          const parsedSession = JSON.parse(savedSession);
          
          // Set user from saved session temporarily
          if (parsedSession.user) {
            setUser(parsedSession.user);
          }
          
          // Try to refresh the token first
          const refreshed = await refreshToken();
          if (refreshed) {
            
            // Delay the initial sync to avoid initialization loops
            setTimeout(() => {
              syncNow(true);
            }, 2000);
            
            setIsLoading(false);
            return;
          }
        }

        // If no saved session or refresh failed, verify session with server
        const response = await auth.getCurrentUser();

        if (response.success && response.session?.user) {
          // Update session in localStorage and state
          localStorage.setItem('session', JSON.stringify(response.session));
          setUser(response.session.user);
          
          // Delay the initial sync to avoid initialization loops
          setTimeout(() => {
            syncNow(true);
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
      if (user) {
        refreshToken().catch(e => 
          console.error('Scheduled token refresh failed:', e)
        );
      }
    }, 30 * 60 * 1000); // 30 minutes
    
    // Set up periodic playlist sync (every 6 hours)
    const playlistSyncInterval = setInterval(() => {
      if (user) {
        syncNow(false).catch(e => 
          console.error('Scheduled playlist sync failed:', e)
        );
      }
    }, 6 * 60 * 60 * 1000); // 6 hours
    
    return () => {
      clearInterval(tokenRefreshInterval);
      clearInterval(playlistSyncInterval);
    };
  }, [refreshToken, syncNow, user]);

  const login = useCallback(async (email: string, password: string) => {
    setIsLoading(true);
    setError(null);
    
    // Increment login counter to track this login operation
    const currentLoginCount = ++loginCounter.current;
    
    try {
      const response = await auth.login(email, password);
      
      if (response.success && response.session) {
        
        // Save session to localStorage
        localStorage.setItem('session', JSON.stringify(response.session));
        setUser(response.session.user);
        
        // Only perform the sync if this is still the most recent login operation
        // This prevents multiple sync calls from different login attempts
        if (currentLoginCount === loginCounter.current) {
          
          // Schedule the sync with a longer delay for login
          setTimeout(() => {
            syncNow(true);
          }, 3000);
        } else {
        }
      } else {
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
  }, [syncNow]);

  const register = useCallback(async (email: string, password: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await auth.register(email, password);
      
      if (response.success && response.user) {
        setUser(response.user);
        // Verify session is set
        await login(email, password);
      } else {
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
