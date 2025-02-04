import axios from 'axios';
import type { AuthResponse, VinylRecord, ApiResponse, CustomColumn, CustomColumnValue } from '../types';
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
};

export const records = {
  getAll: async (): Promise<ApiResponse<VinylRecord[]>> => {
    try {
      const response = await fetch('/api/records', {
        method: 'GET',
        credentials: 'include'
      });
      return handleApiResponse(response);
    } catch (err) {
      console.error('Failed to get records:', err);
      return { success: false, error: 'Failed to get records' };
    }
  },

  add: async (record: Partial<VinylRecord>): Promise<ApiResponse<VinylRecord>> => {
    const response = await api.post<ApiResponse<VinylRecord>>('/api/records', record);
    return response.data;
  },

  delete: async (id: string): Promise<ApiResponse<void>> => {
    try {
      const response = await fetch(`/api/records/${id}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      return handleApiResponse(response);
    } catch (err) {
      console.error('Failed to delete record:', err);
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
    try {
      console.log('API: Fetching all custom columns');
      const response = await fetch('/api/custom-columns', {
        method: 'GET',
        credentials: 'include'
      });
      const responseText = await response.text();
      console.log('API: Custom columns response:', responseText);
      const data = JSON.parse(responseText);
      console.log('API: Parsed custom columns:', data);
      return data;
    } catch (err) {
      console.error('Failed to get custom columns:', err);
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
    const response = await api.get<ApiResponse<CustomColumnValue[]>>(`/api/records/${recordId}/custom-values`);
    return response.data;
  },

  update: async (recordId: string, values: Record<string, string>): Promise<ApiResponse<void>> => {
    try {
      const response = await fetch(`/api/records/${recordId}/custom-values`, {
        method: 'PUT',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(values)
      });
      return handleApiResponse(response);
    } catch (err) {
      console.error('Failed to update custom values:', err);
      return { success: false, error: 'Failed to update custom values' };
    }
  }
}; 
