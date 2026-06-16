import axios from 'axios';
import type { AuthResponse, VinylRecord, ApiResponse, CustomColumn, CustomColumnValue, SyncPlaylistsResponse } from '../types';

const API_URL = import.meta.env.PROD 
  ? 'https://vinyl-collection-manager.onrender.com'
  : ''; // Empty string = use relative URLs, Vite proxy will handle it

export const api = axios.create({
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
  config.withCredentials = true;
  return config;
});

// Add response interceptor for debugging
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    
    // If the error is a 401 and we haven't tried to refresh yet. (We intentionally
    // do NOT retry on 500 - that masks server errors and can cause retry storms.)
    if (error.response?.status === 401 && !originalRequest._retry) {
      // Only try to refresh if we're not already on /api/auth/me or /api/auth/refresh
      if (originalRequest.url !== '/api/auth/me' && originalRequest.url !== '/api/auth/refresh') {
        originalRequest._retry = true;
        
        try {
          // Try to refresh the token first
          const refreshResult = await auth.refreshToken();
          
          if (refreshResult.success) {
            // Retry the original request after successful token refresh
            return api(originalRequest);
          } else {
            // If explicit refresh fails, try getting the current user
            const response = await auth.getCurrentUser();
            
            if (response.success && response.session) {
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
      return Promise.reject(error);
    }
    
    return Promise.reject(error);
  }
);

export const auth = {
  register: async (email: string, password: string, captchaToken?: string): Promise<AuthResponse> => {
    try {
      const response = await api.post<AuthResponse>('/api/auth/register', {
        email,
        password,
        captcha_token: captchaToken,
      });
      return response.data;
    } catch (error) {
      console.error('Registration error:', error instanceof Error ? error.message : 'Unknown error');
      throw error;
    }
  },

  login: async (email: string, password: string, captchaToken?: string): Promise<AuthResponse> => {
    try {
      const response = await api.post<AuthResponse>('/api/auth/login', {
        email,
        password,
        captcha_token: captchaToken,
      });
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
      const response = await api.post<AuthResponse>('/api/auth/refresh');
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
      const response = await api.delete<ApiResponse<void>>(`/api/records/${id}`);
      return response.data ?? { success: true };
    } catch (err) {
      console.error('API: Failed to delete record:', err);
      return { success: false, error: 'Failed to delete record' };
    }
  },

  updateNotes: async (id: string, notes: string): Promise<ApiResponse<VinylRecord>> => {
    try {
      const response = await api.put<ApiResponse<VinylRecord>>(`/api/records/${id}/notes`, { notes });
      return response.data;
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
      const response = await api.get<ApiResponse<CustomColumn[]>>('/api/custom-columns');
      return response.data;
    } catch (err) {
      console.error('Error in getAll custom columns:', err);
      return { success: false, error: 'Failed to get custom columns' };
    }
  },

  getAllValues: async (columnId: string): Promise<ApiResponse<Array<{ record_id: string; value: string }>>> => {
    try {
      const response = await api.get<ApiResponse<Array<{ record_id: string; value: string }>>>(
        `/api/custom-columns/${columnId}/all-values`
      );
      return response.data;
    } catch (err) {
      console.error('Failed to get custom column values:', err);
      return { success: false, error: 'Failed to get custom column values' };
    }
  },

  updateValue: async (recordId: string, columnId: string, value: string): Promise<ApiResponse<void>> => {
    try {
      const response = await api.put<ApiResponse<void>>(`/api/records/${recordId}/custom-values`, {
        [columnId]: value
      });
      return response.data;
    } catch (err) {
      console.error('Failed to update custom column value:', err);
      return { success: false, error: 'Failed to update custom column value' };
    }
  },

  create: async (data: Partial<CustomColumn>): Promise<ApiResponse<CustomColumn>> => {
    try {
      const response = await api.post<ApiResponse<CustomColumn>>('/api/custom-columns', data);
      return response.data;
    } catch (err) {
      console.error('Failed to create custom column:', err);
      return { success: false, error: 'Failed to create custom column' };
    }
  },

  update: async (id: string, data: Partial<CustomColumn>): Promise<ApiResponse<CustomColumn>> => {
    try {
      const response = await api.put<ApiResponse<CustomColumn>>(`/api/custom-columns/${id}`, data);
      return response.data;
    } catch (err) {
      console.error('API: Failed to update custom column:', err);
      return { success: false, error: 'Failed to update custom column' };
    }
  },

  delete: async (id: string): Promise<ApiResponse<void>> => {
    try {
      const response = await api.delete<ApiResponse<void>>(`/api/custom-columns/${id}`);
      return response.data ?? { success: true };
    } catch (err) {
      console.error('Failed to delete custom column:', err);
      return { success: false, error: 'Failed to delete custom column' };
    }
  }
};

export const customValues = {
  getForRecord: async (recordId: string): Promise<ApiResponse<CustomColumnValue[]>> => {
    try {
      const response = await api.get<ApiResponse<CustomColumnValue[]>>(`/api/records/${recordId}/custom-values`);
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
    try {
      const response = await api.put<ApiResponse<void>>(`/api/records/${recordId}/custom-values`, values);
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
      const response = await api.get(`/api/spotify/album-from-url?url=${encodeURIComponent(url)}`);
      return response.data;
    } catch (error) {
      console.error('Error getting album from URL:', error);
      return {
        success: false,
        error: 'Failed to get album information'
      };
    }
  },

  getAlbumFromUrlPublic: async (url: string, signal?: AbortSignal): Promise<{
    success: boolean;
    error?: string;
    data?: {
      album: string;
      artist: string;
      year: string;
      added_from: string;
    };
  }> => {
    try {
      const response = await api.get(`/api/spotify/album-from-url-public?url=${encodeURIComponent(url)}`, { signal });
      return response.data;
    } catch (error) {
      console.error('Error getting album from URL (public):', error);
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

// Musician Network API
export interface MusicianNetworkNode {
  id: string;
  name: string;
  category: 'musician' | 'artist';
  symbolSize: number;
  value: number;
  genres: string[];
  styles: string[];
  albums?: string[];
  collaborations?: string[];
  roles: string[];
}

export interface MusicianNetworkLink {
  source: string;
  target: string;
  value: number;
  roles: string[];
  clean_roles: string[];
  albums: string[];
  genres: string[];
  styles: string[];
}

export interface MusicianStats {
  musician: string;
  total_records: number;
  as_main_artist: number;
  as_session_musician: number;
  session_ratio: number;
  records: string[];
}

export interface MusicianNetworkData {
  nodes: MusicianNetworkNode[];
  links: MusicianNetworkLink[];
  categories: Array<{ name: string; itemStyle: { color: string } }>;
  genres: string[];
  styles: string[];
  clean_roles: string[];
  musician_stats: MusicianStats[];
  session_musicians: MusicianStats[];
  stats: {
    total_connections: number;
    unique_musicians: number;
    unique_artists: number;
    unique_albums: number;
    unique_roles: number;
    most_collaborative_musician: string;
    most_collaborative_artist: string;
  };
  custom_filters: Record<string, string[]>;
  contributor_categories: Record<string, string[]>;
}

export const musicianNetwork = {
  getData: async (): Promise<ApiResponse<MusicianNetworkData>> => {
    try {
      const response = await api.get<ApiResponse<MusicianNetworkData>>('/api/musician-network');
      return response.data;
    } catch (err) {
      console.error('Failed to get musician network data:', err);
      return { success: false, error: 'Failed to get musician network data' };
    }
  }
};

// User Settings API
export interface UserSetting {
  id: string;
  user_id: string;
  setting_key: string;
  setting_value: any;
  created_at: string;
  updated_at: string;
}

export const userSettings = {
  get: async (key: string): Promise<ApiResponse<UserSetting>> => {
    try {
      const response = await api.get<ApiResponse<UserSetting>>(`/api/settings/${key}`);
      return response.data;
    } catch (err) {
      console.error(`Failed to get setting ${key}:`, err);
      return { success: false, error: `Failed to get setting ${key}` };
    }
  },

  set: async (key: string, value: any): Promise<ApiResponse<UserSetting>> => {
    try {
      const response = await api.post<ApiResponse<UserSetting>>('/api/settings', {
        setting_key: key,
        setting_value: value
      });
      return response.data;
    } catch (err) {
      console.error(`Failed to set setting ${key}:`, err);
      return { success: false, error: `Failed to set setting ${key}` };
    }
  },

  getAll: async (): Promise<ApiResponse<UserSetting[]>> => {
    try {
      const response = await api.get<ApiResponse<UserSetting[]>>('/api/settings');
      return response.data;
    } catch (err) {
      console.error('Failed to get all settings:', err);
      return { success: false, error: 'Failed to get all settings' };
    }
  }
}; 
