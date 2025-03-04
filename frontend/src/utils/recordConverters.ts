import type { VinylRecord, NewVinylRecord } from '../types';

export function convertToNewVinylRecord(input: Partial<VinylRecord>): NewVinylRecord {
  // Create a new object with all required fields
  const record: NewVinylRecord = {
    // Required string fields with defaults
    artist: input.artist ?? 'Unknown Artist',
    album: input.album ?? 'Unknown Album',
    added_from: input.added_from ?? 'manual',

    // Required array fields with defaults
    genres: input.genres ?? [],
    styles: input.styles ?? [],
    musicians: input.musicians ?? [],

    // Optional fields
    ...(input.year !== undefined && { year: input.year }),
    ...(input.label && { label: input.label }),
    ...(input.master_url && { master_url: input.master_url }),
    ...(input.current_release_url && { current_release_url: input.current_release_url }),
    ...(input.country && { country: input.country }),
    ...(input.barcode && { barcode: input.barcode }),
    ...(input.customValues && { customValues: input.customValues })
  };

  return record;
} 
