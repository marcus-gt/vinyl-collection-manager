import axios from 'axios';
import type { AuthResponse, VinylRecord, ApiResponse, CustomColumn, CustomColumnValue, SyncPlaylistsResponse } from '../types';
import { notifications } from '@mantine/notifications';

const API_URL = import.meta.env.PROD 
  ? 'https://vinyl-collection-manager.onrender.com'
  : 'http://localhost:3000';

const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
  xsrfCookieName: 'XSRF-TOKEN',
  xsrfHeaderName: 'X-XSRF-TOKEN',
});

// Add request interceptor for debugging
api.interceptors.request.use((config) => {
  console.log(`Making ${config.method?.toUpperCase()} request to ${config.url}`, {
    headers: config.headers,
    data: config.data,
    withCredentials: config.withCredentials
  });
  config.withCredentials = true;
  return config;
});

// Add response interceptor for debugging
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    
    // If the error is 401 or 500 and we haven't tried to refresh yet
    if ((error.response?.status === 401 || error.response?.status === 500) && 
        !originalRequest._retry) {
      // Only try to refresh if we're not already on /api/auth/me or /api/auth/refresh
      if (originalRequest.url !== '/api/auth/me' && originalRequest.url !== '/api/auth/refresh') {
        console.log(`Received ${error.response?.status} error, attempting token refresh...`);
        originalRequest._retry = true;
        
        try {
          // Try to refresh the token first
          const refreshResult = await auth.refreshToken();
          
          if (refreshResult.success) {
            console.log('Token refreshed successfully, retrying request');
            // Retry the original request after successful token refresh
            return api(originalRequest);
          } else {
            // If explicit refresh fails, try getting the current user
            const response = await auth.getCurrentUser();
            
            if (response.success && response.session) {
              console.log('Session still valid via getCurrentUser, retrying request');
              // Update the token in localStorage
              localStorage.setItem('session', JSON.stringify(response.session));
              
              // Retry the original request
              return api(originalRequest);
            }
          }
        } catch (refreshError) {
          console.error('Auth refresh failed:', refreshError);
          // If refresh fails, redirect to login
          localStorage.removeItem('session');
          window.location.href = '/login';
          return Promise.reject(refreshError);
        }
      }
    }
    
    // For /api/auth/me 401s, just return the error
    if (error.config?.url === '/api/auth/me' && error.response?.status === 401) {
      console.log('Auth check: No active session');
      return Promise.reject(error);
    }
    
    return Promise.reject(error);
  }
);

// Helper to handle session timeouts
const handleSessionTimeout = () => {
  notifications.show({
    title: 'Session Expired',
    message: 'Your session has expired. Please log in again.',
    color: 'yellow'
  });
  // Clear any auth state if you're using it
  localStorage.removeItem('session');
  // Redirect to login page
  window.location.href = '/login';
};

// Helper to handle API responses
const handleApiResponse = async (response: Response) => {
  if (response.status === 400 || response.status === 401) {
    handleSessionTimeout();
    return { success: false, error: 'Session expired' };
  }
  
  const data = await response.json();
  return data;
};

export const auth = {
  register: async (email: string, password: string): Promise<AuthResponse> => {
    try {
      const response = await api.post<AuthResponse>('/api/auth/register', { email, password });
      return response.data;
    } catch (error) {
      console.error('Registration error:', error instanceof Error ? error.message : 'Unknown error');
      throw error;
    }
  },

  login: async (email: string, password: string): Promise<AuthResponse> => {
    try {
      const response = await api.post<AuthResponse>('/api/auth/login', { email, password });
      return response.data;
    } catch (error) {
      console.error('Login error:', error instanceof Error ? error.message : 'Unknown error');
      throw error;
    }
  },

  logout: async (): Promise<void> => {
    try {
      await api.post('/api/auth/logout');
    } catch (error) {
      console.error('Logout error:', error instanceof Error ? error.message : 'Unknown error');
      throw error;
    }
  },

  getCurrentUser: async (): Promise<AuthResponse> => {
    try {
      const response = await api.get<AuthResponse>('/api/auth/me');
      return response.data;
    } catch (error: any) {
      // If it's a 401, return a standardized response instead of throwing
      if (error.response?.status === 401) {
        console.log('No active session found');
        return {
          success: false,
          error: 'Not authenticated'
        };
      }
      // For other errors, log and throw
      console.error('Get current user error:', error instanceof Error ? error.message : 'Unknown error');
      throw error;
    }
  },

  refreshToken: async (): Promise<AuthResponse> => {
    try {
      console.log('Explicitly refreshing token...');
      const response = await api.post<AuthResponse>('/api/auth/refresh');
      console.log('Token refresh response:', response.data);
      return response.data;
    } catch (error: any) {
      console.error('Token refresh error:', error instanceof Error ? error.message : 'Unknown error');
      // Return standardized error response
      return {
        success: false,
        error: 'Failed to refresh token'
      };
    }
  },
  
  autoSyncPlaylists: async (): Promise<ApiResponse<any>> => {
    try {
      console.log('Triggering auto-sync of playlists...');
      const response = await api.post<ApiResponse<any>>('/api/auth/auto-sync');
      return response.data;
    } catch (error) {
      console.error('Auto-sync error:', error instanceof Error ? error.message : 'Unknown error');
      return {
        success: false,
        error: 'Failed to auto-sync playlists'
      };
    }
  }
};

export interface RecordsService {
  getAll: () => Promise<ApiResponse<VinylRecord[]>>;
  add: (record: VinylRecord) => Promise<ApiResponse<VinylRecord>>;
  delete: (id: string) => Promise<ApiResponse<void>>;
  updateNotes: (id: string, notes: string) => Promise<ApiResponse<VinylRecord>>;
}

export const records: RecordsService = {
  getAll: async (): Promise<ApiResponse<VinylRecord[]>> => {
    try {
      const response = await api.get<ApiResponse<VinylRecord[]>>('/api/records');
      
      if (response.data.success) {
        // Ensure all records have custom_values_cache
        const processedRecords = response.data.data?.map(record => ({
          ...record,
          custom_values_cache: record.custom_values_cache || {}
        }));
        return {
          success: true,
          data: processedRecords
        };
      }
      
      return { success: false, error: 'Failed to get records' };
    } catch (err) {
      console.error('Failed to get records:', err);
      return { success: false, error: 'Failed to get records' };
    }
  },

  add: async (record: VinylRecord): Promise<ApiResponse<VinylRecord>> => {
    const response = await api.post<ApiResponse<VinylRecord>>('/api/records', record);
    return response.data;
  },

  delete: async (id: string): Promise<ApiResponse<void>> => {
    try {
      console.log('API: Initiating delete request for record:', id);
      const response = await fetch(`/api/records/${id}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      console.log('API: Delete response status:', response.status);
      const responseText = await response.text();
      console.log('API: Raw response text:', responseText);
      const data = responseText ? JSON.parse(responseText) : { success: true };
      console.log('API: Parsed delete response data:', data);
      return data;
    } catch (err) {
      console.error('API: Failed to delete record:', err);
      return { success: false, error: 'Failed to delete record' };
    }
  },

  updateNotes: async (id: string, notes: string): Promise<ApiResponse<VinylRecord>> => {
    try {
      const response = await fetch(`/api/records/${id}/notes`, {
        method: 'PUT',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ notes })
      });
      return handleApiResponse(response);
    } catch (err) {
      console.error('Failed to update notes:', err);
      return { success: false, error: 'Failed to update notes' };
    }
  }
};

export const lookup = {
  byBarcode: async (barcode: string, signal?: AbortSignal): Promise<ApiResponse<VinylRecord>> => {
    const response = await api.get<{success: boolean, data: VinylRecord}>(
      `/api/lookup/barcode/${barcode}`,
      { signal }
    );
    return {
      success: response.data.success,
      data: response.data.data
    };
  },

  byDiscogsId: async (id: string, signal?: AbortSignal): Promise<ApiResponse<VinylRecord>> => {
    const response = await api.get<{success: boolean, data: VinylRecord, error?: string}>(
      `/api/lookup/discogs/${id}`,
      { signal }
    );
    return {
      success: response.data.success,
      data: response.data.data,
      error: response.data.error
    };
  },

  byDiscogsUrl: async (url: string, signal?: AbortSignal): Promise<ApiResponse<VinylRecord>> => {
    // URL encode the Discogs URL
    const encodedUrl = encodeURIComponent(url);
    const response = await api.get<{success: boolean, data: VinylRecord, error?: string}>(
      `/api/lookup/discogs-url?url=${encodedUrl}`,
      { signal }
    );
    return {
      success: response.data.success,
      data: response.data.data,
      error: response.data.error
    };
  },

  byArtistAlbum: async (artist: string, album: string, signal?: AbortSignal): Promise<ApiResponse<VinylRecord>> => {
    // URL encode the parameters
    const encodedArtist = encodeURIComponent(artist);
    const encodedAlbum = encodeURIComponent(album);
    const response = await api.get<{success: boolean, data: VinylRecord, error?: string}>(
      `/api/lookup/artist-album?artist=${encodedArtist}&album=${encodedAlbum}`,
      { signal }
    );
    return {
      success: response.data.success,
      data: response.data.data,
      error: response.data.error
    };
  }
};

export const customColumns = {
  getAll: async (): Promise<ApiResponse<CustomColumn[]>> => {
    try {
      console.log('=== Fetching Custom Columns ===');
      const response = await fetch('/api/custom-columns', {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      const responseText = await response.text();
      
      if (!response.ok) {
        console.error('Failed to fetch custom columns:', {
          status: response.status,
          error: responseText
        });
        return { 
          success: false, 
          error: `Failed to fetch custom columns: ${response.status} ${responseText}` 
        };
      }
      
      const data = JSON.parse(responseText);
      console.log('Custom columns fetched successfully:', {
        count: data.data?.length || 0,
        columns: data.data?.map((col: { id: string; name: string; type: string }) => ({ id: col.id, name: col.name, type: col.type }))
      });
      return data;
    } catch (err) {
      console.error('Error in getAll custom columns:', err);
      return { success: false, error: 'Failed to get custom columns' };
    }
  },

  getAllValues: async (columnId: string): Promise<ApiResponse<Array<{ record_id: string; value: string }>>> => {
    try {
      const response = await fetch(`/api/custom-columns/${columnId}/all-values`, {
        method: 'GET',
        credentials: 'include'
      });
      const data = await response.json();
      return data;
    } catch (err) {
      console.error('Failed to get custom column values:', err);
      return { success: false, error: 'Failed to get custom column values' };
    }
  },

  updateValue: async (recordId: string, columnId: string, value: string): Promise<ApiResponse<void>> => {
    try {
      const response = await fetch(`/api/records/${recordId}/custom-values`, {
        method: 'PUT',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          [columnId]: value
        })
      });
      return handleApiResponse(response);
    } catch (err) {
      console.error('Failed to update custom column value:', err);
      return { success: false, error: 'Failed to update custom column value' };
    }
  },

  create: async (data: Partial<CustomColumn>): Promise<ApiResponse<CustomColumn>> => {
    try {
      const response = await fetch('/api/custom-columns', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
      });
      return handleApiResponse(response);
    } catch (err) {
      console.error('Failed to create custom column:', err);
      return { success: false, error: 'Failed to create custom column' };
    }
  },

  update: async (id: string, data: Partial<CustomColumn>): Promise<ApiResponse<CustomColumn>> => {
    try {
      console.log('API: Starting column update:', { id, data });
      console.log('API: Request payload:', JSON.stringify(data, null, 2));
      
      const response = await fetch(`/api/custom-columns/${id}`, {
        method: 'PUT',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
      });
      
      console.log('API: Raw response:', response);
      const responseText = await response.text();
      console.log('API: Raw response body:', responseText);
      
      const responseData = JSON.parse(responseText);
      console.log('API: Parsed response data:', responseData);
      return responseData;
    } catch (err) {
      console.error('API: Failed to update custom column:', err);
      return { success: false, error: 'Failed to update custom column' };
    }
  },

  delete: async (id: string): Promise<ApiResponse<void>> => {
    try {
      const response = await fetch(`/api/custom-columns/${id}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      return handleApiResponse(response);
    } catch (err) {
      console.error('Failed to delete custom column:', err);
      return { success: false, error: 'Failed to delete custom column' };
    }
  }
};

export const customValues = {
  getForRecord: async (recordId: string): Promise<ApiResponse<CustomColumnValue[]>> => {
    console.log(`=== Fetching Custom Values for Record ${recordId} ===`);
    try {
      const response = await api.get<ApiResponse<CustomColumnValue[]>>(`/api/records/${recordId}/custom-values`);
      console.log('Custom values response:', {
        success: response.data.success,
        count: response.data.data?.length || 0,
        values: response.data.data?.map(val => ({ 
          column_id: val.column_id,
          value: val.value 
        }))
      });
      return response.data;
    } catch (err) {
      console.error('Error fetching custom values:', {
        recordId,
        error: err instanceof Error ? err.message : 'Unknown error'
      });
      return { success: false, error: 'Failed to get custom values' };
    }
  },

  update: async (recordId: string, values: Record<string, string>): Promise<ApiResponse<void>> => {
    console.log(`=== Updating Custom Values for Record ${recordId} ===`, {
      values
    });
    try {
      const response = await api.put<ApiResponse<void>>(`/api/records/${recordId}/custom-values`, values);
      console.log('Update custom values response:', {
        success: response.data.success,
        error: response.data.error
      });
      return response.data;
    } catch (err) {
      console.error('Error updating custom values:', {
        recordId,
        values,
        error: err instanceof Error ? err.message : 'Unknown error'
      });
      return { success: false, error: 'Failed to update custom values' };
    }
  }
};

export const spotify = {
  getAuthUrl: async (): Promise<ApiResponse<{ auth_url: string }>> => {
    try {
      const response = await api.get<ApiResponse<{ auth_url: string }>>('/api/spotify/auth');
      return response.data;
    } catch (err) {
      console.error('Failed to get Spotify auth URL:', err);
      return { success: false, error: 'Failed to get Spotify auth URL' };
    }
  },

  getPlaylists: async (): Promise<ApiResponse<Array<{
    id: string;
    name: string;
    tracks: number;
  }>>> => {
    try {
      const response = await api.get<ApiResponse<Array<{
        id: string;
        name: string;
        tracks: number;
      }>>>('/api/spotify/playlists');
      return response.data;
    } catch (err) {
      console.error('Failed to get Spotify playlists:', err);
      return { success: false, error: 'Failed to get Spotify playlists' };
    }
  },

  getPlaylistTracks: async (playlistId: string): Promise<ApiResponse<Array<{
    id: string;
    name: string;
    artist: string;
    release_date: string;
    total_tracks: number;
    image_url: string | null;
  }>>> => {
    try {
      const response = await api.get<ApiResponse<Array<{
        id: string;
        name: string;
        artist: string;
        release_date: string;
        total_tracks: number;
        image_url: string | null;
      }>>>(`/api/spotify/playlists/${playlistId}/tracks`);
      return response.data;
    } catch (err) {
      console.error('Failed to get playlist tracks:', err);
      return { success: false, error: 'Failed to get playlist tracks' };
    }
  },

  getAlbumFromUrl: async (url: string): Promise<{
    success: boolean;
    needs_auth?: boolean;
    error?: string;
    data?: {
      name: string;
      artist: string;
      release_date: string;
    };
  }> => {
    try {
      const response = await fetch(`/api/spotify/album-from-url?url=${encodeURIComponent(url)}`);
      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error getting album from URL:', error);
      return {
        success: false,
        error: 'Failed to get album information'
      };
    }
  },

  subscribeToPlaylist: async (playlistId: string, playlistName: string): Promise<ApiResponse<void>> => {
    try {
      const response = await api.post('/api/spotify/playlist/subscribe', {
        playlist_id: playlistId,
        playlist_name: playlistName
      });
      return response.data;
    } catch (err) {
      console.error('Failed to subscribe to playlist:', err);
      return {
        success: false,
        error: 'Failed to subscribe to playlist'
      };
    }
  },

  unsubscribeFromPlaylist: async (): Promise<ApiResponse<void>> => {
    try {
      const response = await api.post('/api/spotify/playlist/unsubscribe');
      return response.data;
    } catch (err) {
      console.error('Failed to unsubscribe from playlist:', err);
      return {
        success: false,
        error: 'Failed to unsubscribe from playlist'
      };
    }
  },

  getSubscribedPlaylist: async (): Promise<ApiResponse<{
    playlist_id: string;
    playlist_name: string;
    last_checked_at: string;
  }>> => {
    try {
      const response = await api.get('/api/spotify/playlist/subscription');
      return response.data;
    } catch (err) {
      console.error('Failed to get subscribed playlist:', err);
      return {
        success: false,
        error: 'Failed to get subscribed playlist'
      };
    }
  },

  disconnectSpotify: async (): Promise<ApiResponse<void>> => {
    try {
      const response = await api.post('/api/spotify/disconnect');
      return response.data;
    } catch (err) {
      console.error('Failed to disconnect Spotify:', err);
      return {
        success: false,
        error: 'Failed to disconnect Spotify'
      };
    }
  },

  syncPlaylists: async (): Promise<ApiResponse<SyncPlaylistsResponse>> => {
    try {
      const response = await api.post('/api/spotify/playlist/sync');
      return response.data;
    } catch (err) {
      console.error('Failed to sync playlists:', err);
      return {
        success: false,
        error: 'Failed to sync playlists'
      };
    }
  }
};

export const columnFilters = {
  getAll: async (): Promise<ApiResponse<Record<string, any>>> => {
    try {
      const response = await api.get<ApiResponse<Record<string, any>>>('/api/column-filters');
      return response.data;
    } catch (err) {
      console.error('Failed to get column filters:', err);
      return { success: false, error: 'Failed to get column filters' };
    }
  },

  update: async (filters: Record<string, any>): Promise<ApiResponse<void>> => {
    try {
      const response = await api.put<ApiResponse<void>>('/api/column-filters', filters);
      return response.data;
    } catch (err) {
      console.error('Failed to update column filters:', err);
      return { success: false, error: 'Failed to update column filters' };
    }
  }
}; 
