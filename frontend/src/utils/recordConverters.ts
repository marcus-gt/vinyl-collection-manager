import type { VinylRecord, NewVinylRecord } from '../types';

export function convertToNewVinylRecord(record: Partial<VinylRecord>): NewVinylRecord {
  // Ensure arrays are initialized even if undefined
  const genres = Array.isArray(record.genres) ? record.genres : [];
  const styles = Array.isArray(record.styles) ? record.styles : [];
  const musicians = Array.isArray(record.musicians) ? record.musicians : [];

  return {
    // Required fields with defaults
    artist: record.artist || 'Unknown Artist',
    album: record.album || 'Unknown Album',
    added_from: record.added_from || 'manual',
    genres,
    styles,
    musicians,

    // Optional fields - only include if they have non-null values
    ...(record.year !== undefined && { year: record.year }),
    ...(record.label && { label: record.label }),
    ...(record.master_url && { master_url: record.master_url }),
    ...(record.current_release_url && { current_release_url: record.current_release_url }),
    ...(record.country && { country: record.country }),
    ...(record.barcode && { barcode: record.barcode }),
    ...(record.customValues && { customValues: record.customValues })
  };
} 
