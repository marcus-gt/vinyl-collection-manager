export interface User {
  id: string;
  email: string;
}

export interface VinylRecord {
  id: string;
  user_id: string;
  artist: string;
  album: string;
  year?: number;
  label?: string;
  genres?: string[];
  styles?: string[];
  musicians?: string[];
  master_url?: string;
  current_release_url?: string;
  current_release_year?: number;
  created_at?: string;
  custom_values_cache: Record<string, string>;
  country?: string;
  barcode?: string;
  added_from?: string;
  customValues?: Record<string, string>;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  needs_auth?: boolean;
}

export interface AuthResponse {
  success: boolean;
  user?: {
    id: string;
    email: string;
  };
  session?: {
    access_token: string;
    user: {
      id: string;
      email: string;
    };
  };
  error?: string;
}

export type CustomColumnType = 'text' | 'number' | 'single-select' | 'multi-select' | 'boolean';

export interface CustomColumn {
  id: string;
  name: string;
  type: 'text' | 'number' | 'single-select' | 'multi-select' | 'boolean';
  options?: string[];
  option_colors?: Record<string, string>;
  defaultValue?: string;
}

export interface CustomColumnValue {
  id: string;
  record_id: string;
  column_id: string;
  value: string;
  created_at?: string;
  updated_at?: string;
}

// Available theme colors for pills
export type PillColor = 
  | 'dark'
  | 'gray'
  | 'red'
  | 'grape'
  | 'violet'
  | 'indigo'
  | 'blue'
  | 'cyan'
  | 'green'
  | 'orange';

export const PILL_COLORS = {
  default: 'blue',
  options: [
    { value: 'dark', label: 'Dark' },
    { value: 'gray', label: 'Gray' },
    { value: 'red', label: 'Red' },
    { value: 'grape', label: 'Purple' },
    { value: 'violet', label: 'Violet' },
    { value: 'indigo', label: 'Indigo' },
    { value: 'blue', label: 'Blue' },
    { value: 'cyan', label: 'Cyan' },
    { value: 'green', label: 'Green' },
    { value: 'orange', label: 'Orange' }
  ]
} as const;

export interface AddedAlbum {
  artist: string;
  album: string;
}

export interface FailedLookup {
  artist: string;
  album: string;
  error: string;
}

export interface SyncPlaylistsResponse {
  added_albums: AddedAlbum[];
  total_added: number;
  failed_lookups: FailedLookup[];
  total_failed: number;
}

export interface NewVinylRecord {
  // Required fields
  artist: string;
  album: string;
  added_from: string;

  // Optional fields with explicit types
  year?: number;
  label?: string;
  genres: string[];        // Empty array instead of undefined
  styles: string[];        // Empty array instead of undefined
  musicians: string[];     // Empty array instead of undefined
  master_url?: string;
  current_release_url?: string;
  current_release_year?: number;
  country?: string;
  barcode?: string;
  customValues?: Record<string, string>;
} 
