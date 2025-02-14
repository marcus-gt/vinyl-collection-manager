export interface User {
  id: string;
  email: string;
}

export interface VinylRecord {
  id?: string;
  user_id?: string;
  artist: string;
  album: string;
  year?: number;
  barcode?: string;
  genres?: string[];
  styles?: string[];
  musicians?: string[];
  master_url?: string;
  current_release_url?: string;
  current_release_year?: number;
  label?: string;
  notes?: string;
  created_at?: string;
  updated_at?: string;
  added_from: 'barcode' | 'discogs_url' | 'spotify' | 'manual';
  customValues?: {
    [columnId: string]: string;
  };
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
