import type { VinylRecord, CustomColumnValue } from '../../types';
import { api } from '../../services/api';

// Service for per-record custom column values. Uses the shared axios instance
// so requests go through the auth refresh/retry interceptor.
export const customValuesService = {
  getForRecord: async (recordId: string): Promise<{ success: boolean; data?: CustomColumnValue[] }> => {
    try {
      const response = await api.get<{ success: boolean; data?: CustomColumnValue[] }>(
        `/api/records/${recordId}/custom-values`
      );
      return response.data;
    } catch (err) {
      console.error(`Failed to get custom values for record ${recordId}:`, err);
      return { success: false };
    }
  },
  update: async (recordId: string, values: Record<string, string>): Promise<{ success: boolean }> => {
    try {
      const response = await api.put<{ success: boolean }>(
        `/api/records/${recordId}/custom-values`,
        values
      );
      return response.data;
    } catch (err) {
      console.error(`Failed to update custom values for record ${recordId}:`, err);
      return { success: false };
    }
  },
  getAllForRecords: async (recordIds: string[]): Promise<Record<string, CustomColumnValue[]>> => {
    try {
      const results: Record<string, CustomColumnValue[]> = {};
      // Fetch custom values for each record in parallel
      await Promise.all(recordIds.map(async (recordId) => {
        const response = await customValuesService.getForRecord(recordId);
        if (response.success && response.data) {
          results[recordId] = response.data;
        }
      }));
      return results;
    } catch (err) {
      console.error('Failed to load custom values for records:', err);
      return {};
    }
  }
};

// Service for updating standard record fields.
export const recordFieldsService = {
  update: async (recordId: string, updates: Record<string, any>): Promise<{ success: boolean; data?: VinylRecord }> => {
    try {
      const response = await api.patch<{ success: boolean; data?: VinylRecord }>(
        `/api/records/${recordId}`,
        updates
      );
      return response.data;
    } catch (err) {
      console.error(`Failed to update record ${recordId}:`, err);
      return { success: false };
    }
  }
};
