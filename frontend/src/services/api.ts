import axios from 'axios';
import type { AuthResponse, VinylRecord, ApiResponse } from '../types';

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

api.interceptors.request.use((config) => {
  config.withCredentials = true;
  return config;
});

export const auth = {
  register: async (email: string, password: string): Promise<AuthResponse> => {
    const response = await api.post<AuthResponse>('/api/auth/register', { email, password });
    return response.data;
  },

  login: async (email: string, password: string): Promise<AuthResponse> => {
    const response = await api.post<AuthResponse>('/api/auth/login', { email, password });
    return response.data;
  },

  logout: async (): Promise<void> => {
    await api.post('/api/auth/logout');
  },

  getCurrentUser: async (): Promise<AuthResponse> => {
    const response = await api.get<AuthResponse>('/api/auth/me');
    return response.data;
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
