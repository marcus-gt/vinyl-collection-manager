import axios from 'axios';
import type { AuthResponse, VinylRecord, ApiResponse, CustomColumn, CustomColumnValue } from '../types';

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
  (response) => {
    console.log(`Response from ${response.config.url}:`, {
      status: response.status,
      data: response.data,
      headers: response.headers
    });
    return response;
  },
  (error) => {
    // Don't log 401s from /api/auth/me as errors
    if (error.config?.url === '/api/auth/me' && error.response?.status === 401) {
      console.log('Auth check: No active session');
      return Promise.reject(error);
    }
    
    // For other errors, log them
    console.error(`Error from ${error.config?.url}:`, {
      status: error.response?.status,
      data: error.response?.data,
      message: error.message,
      // Don't log the full error object to keep the console clean
      details: error.response?.data?.error || error.message
    });
    return Promise.reject(error);
  }
);

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
};

export const records = {
  getAll: async (): Promise<ApiResponse<VinylRecord[]>> => {
    const response = await api.get<ApiResponse<VinylRecord[]>>('/api/records');
    return response.data;
  },

  add: async (record: Partial<VinylRecord>): Promise<ApiResponse<VinylRecord>> => {
    const response = await api.post<ApiResponse<VinylRecord>>('/api/records', record);
    return response.data;
  },

  delete: async (recordId: string): Promise<ApiResponse<void>> => {
    const response = await api.delete<ApiResponse<void>>(`/api/records/${recordId}`);
    return response.data;
  },

  updateNotes: async (recordId: string, notes: string): Promise<ApiResponse<VinylRecord>> => {
    const response = await api.put<ApiResponse<VinylRecord>>(`/api/records/${recordId}/notes`, { notes });
    return response.data;
  },
};

export const lookup = {
  byBarcode: async (barcode: string): Promise<ApiResponse<VinylRecord>> => {
    const response = await api.get<{success: boolean, data: VinylRecord}>(`/api/lookup/barcode/${barcode}`);
    return {
      success: response.data.success,
      data: response.data.data
    };
  },
};

export const customColumns = {
  getAll: async (): Promise<ApiResponse<CustomColumn[]>> => {
    const response = await api.get<ApiResponse<CustomColumn[]>>('/api/custom-columns');
    return response.data;
  },

  create: async (column: Omit<CustomColumn, 'id' | 'user_id' | 'created_at' | 'updated_at'>): Promise<ApiResponse<CustomColumn>> => {
    const response = await api.post<ApiResponse<CustomColumn>>('/api/custom-columns', column);
    return response.data;
  },

  update: async (id: string, column: Partial<CustomColumn>): Promise<ApiResponse<CustomColumn>> => {
    const response = await api.put<ApiResponse<CustomColumn>>(`/api/custom-columns/${id}`, column);
    return response.data;
  },

  delete: async (id: string): Promise<ApiResponse<void>> => {
    const response = await api.delete<ApiResponse<void>>(`/api/custom-columns/${id}`);
    return response.data;
  }
};

export const customValues = {
  getForRecord: async (recordId: string): Promise<ApiResponse<CustomColumnValue[]>> => {
    const response = await api.get<ApiResponse<CustomColumnValue[]>>(`/api/records/${recordId}/custom-values`);
    return response.data;
  },

  update: async (recordId: string, values: { [columnId: string]: string }): Promise<ApiResponse<CustomColumnValue[]>> => {
    const response = await api.put<ApiResponse<CustomColumnValue[]>>(`/api/records/${recordId}/custom-values`, values);
    return response.data;
  }
}; 
