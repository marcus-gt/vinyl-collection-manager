import { useState, useEffect, useCallback, useRef } from 'react';
import { userSettings } from '../services/api';
import { useDebouncedCallback } from 'use-debounce';

/**
 * Custom hook to sync settings with the backend
 * Falls back to localStorage if backend is unavailable
 * Debounces saves to avoid too many API calls
 */
export function useBackendSettings<T>(
  key: string,
  defaultValue: T
): [T, (value: T | ((prev: T) => T)) => void, boolean] {
  const [value, setValue] = useState<T>(defaultValue);
  const [loading, setLoading] = useState(true);
  const initialLoadDone = useRef(false);
  const localStorageKey = `settings-${key}`;

  // Load initial value from backend (or localStorage as fallback)
  useEffect(() => {
    if (initialLoadDone.current) return;
    
    const loadSetting = async () => {
      try {
        // Try to load from backend
        const response = await userSettings.get(key);
        
        if (response.success && response.data) {
          const loadedValue = response.data.setting_value as T;
          setValue(loadedValue);
          // Also update localStorage as cache
          localStorage.setItem(localStorageKey, JSON.stringify(loadedValue));
        } else {
          // Backend doesn't have this setting, try localStorage
          const localValue = localStorage.getItem(localStorageKey);
          if (localValue) {
            try {
              const parsed = JSON.parse(localValue) as T;
              setValue(parsed);
              // Save to backend for future
              await userSettings.set(key, parsed);
            } catch {
              setValue(defaultValue);
            }
          } else {
            setValue(defaultValue);
          }
        }
      } catch (error) {
        console.error(`Failed to load setting ${key}, using localStorage fallback:`, error);
        // Fallback to localStorage
        const localValue = localStorage.getItem(localStorageKey);
        if (localValue) {
          try {
            setValue(JSON.parse(localValue) as T);
          } catch {
            setValue(defaultValue);
          }
        } else {
          setValue(defaultValue);
        }
      } finally {
        setLoading(false);
        initialLoadDone.current = true;
      }
    };

    loadSetting();
  }, [key, defaultValue, localStorageKey]);

  // Debounced save to backend
  const debouncedSave = useDebouncedCallback(async (newValue: T) => {
    try {
      await userSettings.set(key, newValue);
      console.log(`Setting ${key} saved to backend`);
    } catch (error) {
      console.error(`Failed to save setting ${key} to backend:`, error);
    }
  }, 500);

  // Update function that saves to both state, localStorage, and backend
  const updateValue = useCallback((newValue: T | ((prev: T) => T)) => {
    setValue(prev => {
      const resolvedValue = typeof newValue === 'function' 
        ? (newValue as (prev: T) => T)(prev) 
        : newValue;
      
      // Update localStorage immediately for fast local access
      localStorage.setItem(localStorageKey, JSON.stringify(resolvedValue));
      
      // Debounce backend save to avoid too many API calls
      debouncedSave(resolvedValue);
      
      return resolvedValue;
    });
  }, [localStorageKey, debouncedSave]);

  return [value, updateValue, loading];
}

