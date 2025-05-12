import { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react';
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

  // Try to restore session on mount
  useEffect(() => {
    const initializeAuth = async () => {
      console.log('=== Initializing Auth ===');
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
    
    return () => clearInterval(tokenRefreshInterval);
  }, [refreshToken]);

  const login = useCallback(async (email: string, password: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await auth.login(email, password);
      
      if (response.success && response.session) {
        // Save session to localStorage
        localStorage.setItem('session', JSON.stringify(response.session));
        setUser(response.session.user);
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
  }, []);

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
