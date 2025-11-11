import { lookup } from './api';
import type { VinylRecord } from '../types';

export interface LookupResult {
  success: boolean;
  data?: VinylRecord;
  error?: string;
}

/**
 * Lookup a record by artist and album name
 */
export async function lookupByArtistAlbum(
  artist: string,
  album: string,
  signal?: AbortSignal
): Promise<LookupResult> {
  try {
    const response = await lookup.byArtistAlbum(artist, album, signal);
    if (response.success && response.data) {
      return {
        success: true,
        data: response.data
      };
    } else {
      return {
        success: false,
        error: response.error || "Couldn't find record"
      };
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw err; // Re-throw abort errors
    }
    return {
      success: false,
      error: "Couldn't find record"
    };
  }
}

/**
 * Lookup a record by Discogs release ID
 */
export async function lookupByDiscogsId(
  id: string,
  signal?: AbortSignal
): Promise<LookupResult> {
  try {
    const response = await lookup.byDiscogsId(id, signal);
    if (response.success && response.data) {
      return {
        success: true,
        data: response.data
      };
    } else {
      return {
        success: false,
        error: response.error || 'Failed to find record'
      };
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw err; // Re-throw abort errors
    }
    return {
      success: false,
      error: 'Failed to lookup Discogs release'
    };
  }
}

/**
 * Lookup a record by Discogs URL
 */
export async function lookupByDiscogsUrl(
  url: string,
  signal?: AbortSignal
): Promise<LookupResult> {
  try {
    const response = await lookup.byDiscogsUrl(url, signal);
    if (response.success && response.data) {
      return {
        success: true,
        data: response.data
      };
    } else {
      return {
        success: false,
        error: response.error || 'Failed to find record'
      };
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw err; // Re-throw abort errors
    }
    return {
      success: false,
      error: 'Failed to lookup Discogs release'
    };
  }
}

/**
 * Lookup a record by barcode
 */
export async function lookupByBarcode(
  barcode: string,
  signal?: AbortSignal
): Promise<LookupResult> {
  try {
    const response = await lookup.byBarcode(barcode, signal);
    if (response.success && response.data) {
      return {
        success: true,
        data: response.data
      };
    } else {
      return {
        success: false,
        error: response.error || 'Failed to find record'
      };
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw err; // Re-throw abort errors
    }
    return {
      success: false,
      error: 'Failed to lookup barcode'
    };
  }
}

export interface DetectedInputType {
  type: 'discogs_url' | 'discogs_id' | 'barcode' | 'spotify_url' | 'invalid';
  value: string;
  error?: string;
}

/**
 * Detect the type of input provided (Discogs URL, Discogs ID, barcode, etc.)
 */
export function detectInputType(input: string): DetectedInputType {
  const trimmed = input.trim();
  
  // Check for Discogs URL
  if (trimmed.includes('discogs.com')) {
    if (trimmed.includes('discogs.com/release/') || trimmed.includes('discogs.com/master/')) {
      return { type: 'discogs_url', value: trimmed };
    } else {
      return {
        type: 'invalid',
        value: trimmed,
        error: 'Invalid Discogs URL. Please use a release or master URL'
      };
    }
  }
  
  // Check for Spotify URL
  if (trimmed.includes('spotify.com')) {
    return { type: 'spotify_url', value: trimmed };
  }
  
  // Check for numeric Discogs ID (pure digits)
  if (/^\d+$/.test(trimmed)) {
    // Could be either a barcode or Discogs ID
    // If it's 7-8 digits, likely a Discogs release ID
    // If it's 12-13 digits, likely a barcode (EAN/UPC)
    if (trimmed.length >= 10) {
      return { type: 'barcode', value: trimmed };
    } else {
      return { type: 'discogs_id', value: trimmed };
    }
  }
  
  return {
    type: 'invalid',
    value: trimmed,
    error: 'Invalid input. Please enter a Discogs URL, Discogs ID, or barcode'
  };
}

/**
 * Unified lookup function that detects input type and routes to appropriate lookup
 */
export async function lookupUnified(
  input: string,
  signal?: AbortSignal
): Promise<LookupResult> {
  const detected = detectInputType(input);
  
  switch (detected.type) {
    case 'discogs_url':
      return lookupByDiscogsUrl(detected.value, signal);
    case 'discogs_id':
      return lookupByDiscogsId(detected.value, signal);
    case 'barcode':
      return lookupByBarcode(detected.value, signal);
    case 'invalid':
      return {
        success: false,
        error: detected.error || 'Invalid input'
      };
    default:
      return {
        success: false,
        error: 'Unsupported input type'
      };
  }
}

