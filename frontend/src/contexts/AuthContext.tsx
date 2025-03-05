import { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react';
import { auth } from '../services/api';
import type { User } from '../types';
import { debounce } from 'lodash';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const checkAuth = useCallback(async () => {
    console.log('Checking authentication status...');
    try {
      const response = await auth.getCurrentUser();
      console.log('Auth check response:', response);
      
      if (response.success && response.session && response.session.user) {
        console.log('Setting user from session:', response.session.user);
        setUser(response.session.user);
        return true;
      } else if (response.success && response.user) {
        console.log('Setting user from direct response:', response.user);
        setUser(response.user);
        return true;
      }
      // Handle the case where there's no valid session
      console.log('No active session found');
      setUser(null);
      return false;
    } catch (err) {
      // This will now only be for unexpected errors
      console.error('Unexpected auth check error:', err);
      setUser(null);
      return false;
    }
  }, []);

  useEffect(() => {
    console.log('AuthProvider mounted, checking auth...');
    checkAuth().finally(() => {
      console.log('Auth check completed, setting loading to false');
      setLoading(false);
    });
  }, [checkAuth]);

  const login = useCallback(async (email: string, password: string) => {
    console.log('Attempting login...');
    setLoading(true);
    setError(null);
    try {
      const response = await auth.login(email, password);
      console.log('Login response:', response);
      
      if (response.success && response.session && response.session.user) {
        console.log('Setting user after login:', response.session.user);
        setUser(response.session.user);
        // Verify session is set
        await checkAuth();
      } else {
        console.log('Login failed:', response.error);
        setError(response.error || 'Login failed');
        setUser(null);
      }
    } catch (err) {
      console.error('Login error:', err);
      setError(err instanceof Error ? err.message : 'Login failed');
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, [checkAuth]);

  const register = useCallback(async (email: string, password: string) => {
    console.log('Attempting registration...');
    setLoading(true);
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
      setLoading(false);
    }
  }, [checkAuth]);

  const logout = useCallback(async () => {
    console.log('Attempting logout...');
    setLoading(true);
    setError(null);
    try {
      await auth.logout();
      console.log('Logout successful, clearing user');
      setUser(null);
    } catch (err) {
      console.error('Logout error:', err);
      setError(err instanceof Error ? err.message : 'Logout failed');
    } finally {
      setLoading(false);
    }
  }, []);

  // Add session refresh function
  const refreshSession = useCallback(async () => {
    try {
      const response = await auth.post('/api/auth/refresh');
      return response.data.success;
    } catch (err) {
      console.error('Failed to refresh session:', err);
      return false;
    }
  }, []);

  // Add periodic session refresh
  useEffect(() => {
    if (user) {
      // Refresh session every 24 hours
      const interval = setInterval(refreshSession, 24 * 60 * 60 * 1000);
      return () => clearInterval(interval);
    }
  }, [user, refreshSession]);

  // Also refresh session on user activity
  useEffect(() => {
    if (user) {
      const handleActivity = debounce(() => {
        refreshSession();
      }, 5000); // Debounce to prevent too many requests

      window.addEventListener('mousemove', handleActivity);
      window.addEventListener('keydown', handleActivity);

      return () => {
        window.removeEventListener('mousemove', handleActivity);
        window.removeEventListener('keydown', handleActivity);
      };
    }
  }, [user, refreshSession]);

  console.log('Current auth state:', { user, loading, error });

  return (
    <AuthContext.Provider value={{ user, loading, error, login, register, logout }}>
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
