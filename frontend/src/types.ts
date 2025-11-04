export interface User {
  id: string;
  email: string;
}

export interface Identifier {
  type: string;
  value: string;
  description?: string;
}

export interface Track {
  position: string;
  title: string;
  duration: string;
}

export interface Contributor {
  name: string;
  roles: string[];
  instruments: string[];
  notes?: any;
}

export interface ContributorsByCategory {
  [category: string]: {
    [subcategory: string]: Contributor[];
  };
}

// Single type for all vinyl records
export interface VinylRecord {
  // Required fields
  artist: string;
  album: string;
  genres: string[];
  styles: string[];
  musicians: string[];
  added_from: string;
  custom_values_cache: Record<string, string>;  // Required, but can be empty object
  contributors?: ContributorsByCategory;  // New relational format

  // Master release fields
  master_id?: number;
  master_url?: string;
  tracklist?: Track[];

  // Original/main release fields
  year?: number;  // Original year (preferred)
  label?: string;  // Original label (preferred)
  country?: string;  // Original country (preferred)
  master_format?: string;  // Original format (legacy name for compatibility)
  original_release_id?: number;
  original_release_url?: string;
  original_catno?: string;
  original_release_date?: string;
  original_identifiers?: Identifier[];

  // Current/specific release fields
  current_release_id?: number;
  current_release_url?: string;
  current_release_year?: number;
  current_release_format?: string;
  current_label?: string;
  current_catno?: string;
  current_country?: string;
  current_release_date?: string;
  current_identifiers?: Identifier[];

  // Legacy fields
  barcode?: string;

  // Database fields (only present on existing records)
  id?: string;
  user_id?: string;
  created_at?: string;
  updated_at?: string;
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
  user_id: string;
  name: string;
  type: CustomColumnType;
  options?: string[];
  option_colors?: Record<string, string>;
  defaultValue?: string;
  applyToAll?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface CustomColumnValue {
  id: string;
  record_id: string;
  column_id: string;
  value: string;
  created_at?: string;
  updated_at?: string;
}

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
