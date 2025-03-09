import { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react';
import { auth } from '../services/api';
import type { User } from '../types';
import { api } from '../services/api';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<boolean>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const checkAuth = useCallback(async () => {
    if (isRefreshing) return false;
    
    setIsRefreshing(true);
    try {
      const response = await auth.getCurrentUser();
      if (response.success && response.session) {
        setUser(response.session.user);
        localStorage.setItem('session', JSON.stringify(response.session));
        return true;
      }
      return false;
    } catch (err) {
      console.error('Auth check error:', err);
      return false;
    } finally {
      setIsRefreshing(false);
    }
  }, [isRefreshing]);

  useEffect(() => {
    // Try to restore session from localStorage on mount
    const savedSession = localStorage.getItem('session');
    if (savedSession) {
      try {
        const parsedSession = JSON.parse(savedSession);
        setUser(parsedSession.user);
      } catch (err) {
        console.error('Failed to parse saved session:', err);
      }
    }
    
    checkAuth().finally(() => {
      setIsLoading(false);
    });
  }, [checkAuth]);

  // Update the refresh interval
  useEffect(() => {
    const refreshInterval = setInterval(async () => {
      if (user && !isRefreshing) {
        setIsRefreshing(true);
        try {
          const response = await auth.getCurrentUser();
          if (response.success && response.session) {
            localStorage.setItem('session', JSON.stringify(response.session));
          } else {
            // Session invalid, clear it
            setUser(null);
            localStorage.removeItem('session');
            window.location.href = '/login';
          }
        } catch (err) {
          console.error('Session refresh failed:', err);
        } finally {
          setIsRefreshing(false);
        }
      }
    }, 5 * 60 * 1000); // Refresh every 5 minutes

    return () => clearInterval(refreshInterval);
  }, [user]);

  const login = useCallback(async (email: string, password: string): Promise<boolean> => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await auth.login(email, password);
      
      if (response.success && response.session) {
        localStorage.setItem('session', JSON.stringify(response.session));
        setUser(response.session.user);
        
        api.defaults.headers.common['Authorization'] = 
          `Bearer ${response.session.access_token}`;
          
        return true;
      } else {
        setError(response.error || 'Login failed');
        setUser(null);
        return false;
      }
    } catch (err) {
      console.error('Login error:', err);
      setError(err instanceof Error ? err.message : 'Login failed');
      setUser(null);
      return false;
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
        await checkAuth();
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
  }, [checkAuth]);

  const logout = useCallback(async () => {
    console.log('Attempting logout...');
    setIsLoading(true);
    setError(null);
    try {
      await auth.logout();
      // Clear session from localStorage
      localStorage.removeItem('session');
      console.log('Logout successful, clearing user');
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
    <AuthContext.Provider value={{ user, isLoading, error, login, register, logout }}>
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
