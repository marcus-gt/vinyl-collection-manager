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
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const checkAuth = useCallback(async () => {
    console.log('Checking authentication status...');
    try {
      const response = await auth.getCurrentUser();
      console.log('Auth check response:', response);
      
      if (response.success && response.session) {
        console.log('Setting user from session:', response.session.user);
        setUser(response.session.user);
        return true;
      }
      console.log('No valid session found');
      return false;
    } catch (err) {
      console.log('Auth check error:', err);
      return false;
    }
  }, []);

  useEffect(() => {
    console.log('AuthProvider mounted, checking auth...');
    checkAuth().finally(() => {
      console.log('Auth check completed, setting loading to false');
      setIsLoading(false);
    });
  }, [checkAuth]);

  const login = useCallback(async (email: string, password: string) => {
    console.log('Attempting login...');
    setIsLoading(true);
    setError(null);
    try {
      const response = await auth.login(email, password);
      console.log('Login response:', response);
      
      if (response.success && response.session) {
        console.log('Setting user after login:', response.session.user);
        setUser(response.session.user);
        // Verify session is set
        await checkAuth();
      } else {
        console.log('Login failed:', response.error);
        setError(response.error || 'Login failed');
      }
    } catch (err) {
      console.error('Login error:', err);
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setIsLoading(false);
    }
  }, [checkAuth]);

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
      }
    } catch (err) {
      console.error('Registration error:', err);
      setError(err instanceof Error ? err.message : 'Registration failed');
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
