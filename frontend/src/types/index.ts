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

export interface VinylRecord {
  // Core fields
  id: string;
  user_id: string;
  artist: string;
  album: string;
  added_at: string;
  updated_at?: string;
  added_from: string;
  
  // Master release fields
  master_id?: number;
  master_url?: string;
  tracklist?: Track[];
  
  // Original/main release fields
  year?: string;  // Original year (preferred)
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
  current_release_year?: string;
  current_release_format?: string;
  current_label?: string;
  current_catno?: string;
  current_country?: string;
  current_release_date?: string;
  current_identifiers?: Identifier[];
  
  // Shared fields (with priority logic applied)
  genres?: string;
  styles?: string;
  musicians?: string | string[] | any;  // Legacy JSONB format (can be string, array, or object)
  contributors?: ContributorsByCategory;  // New relational format
  
  // Custom columns
  custom_values_cache?: Record<string, any>;
  
  // Legacy fields
  barcode?: string;
  notes?: string;  // Deprecated, use custom columns instead
  release_url?: string;  // Deprecated, use current_release_url
  release_year?: string;  // Deprecated, use current_release_year
  created_at?: string;
}

export interface AuthResponse {
  success: boolean;
  user?: User;
  error?: string;
  session?: {
    access_token: string;
    user: User;
  };
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
} 
