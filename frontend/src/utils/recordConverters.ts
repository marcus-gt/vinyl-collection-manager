import type { VinylRecord, NewVinylRecord } from '../types';

export function convertToNewVinylRecord(record: VinylRecord | Partial<VinylRecord>): NewVinylRecord {
  return {
    // Required fields with defaults
    artist: record.artist || 'Unknown Artist',
    album: record.album || 'Unknown Album',
    added_from: record.added_from || 'manual',
    genres: record.genres || [],
    styles: record.styles || [],
    musicians: record.musicians || [],

    // Optional fields
    ...(record.year && { year: record.year }),
    ...(record.label && { label: record.label }),
    ...(record.master_url && { master_url: record.master_url }),
    ...(record.current_release_url && { current_release_url: record.current_release_url }),
    ...(record.country && { country: record.country }),
    ...(record.barcode && { barcode: record.barcode }),
    ...(record.customValues && { customValues: record.customValues })
  };
} 
