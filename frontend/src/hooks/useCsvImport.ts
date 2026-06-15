import { useState } from 'react';
import { notifications } from '@mantine/notifications';
import { records, type RecordsService } from '../services/api';
import type { CustomColumn, VinylRecord } from '../types';
import { appEvents } from '../lib/appEvents';

const recordsService: RecordsService = records;

// Parse a single CSV line, handling quoted values and escaped double-quotes.
function parseCSVLine(line: string): string[] {
  const values: string[] = [];
  let currentValue = '';
  let insideQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (insideQuotes && line[i + 1] === '"') {
        // Escaped quote
        currentValue += '"';
        i++;
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if (char === ',' && !insideQuotes) {
      values.push(currentValue.trim());
      currentValue = '';
    } else {
      currentValue += char;
    }
  }

  values.push(currentValue.trim());
  return values;
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result;
      if (typeof text !== 'string') {
        reject(new Error('Failed to read CSV file'));
      } else {
        resolve(text);
      }
    };
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read CSV file'));
    reader.readAsText(file);
  });
}

/**
 * Encapsulates CSV import: parsing an exported collection CSV and adding each
 * row as a record. Exposes progress/importing state for the UI and resolves to
 * a boolean indicating whether the import ran to completion (so the caller can
 * close its modal).
 */
export function useCsvImport(customColumns: CustomColumn[]) {
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);

  const importCsv = async (file: File): Promise<boolean> => {
    setImporting(true);
    setProgress(0);

    try {
      const text = await readFileAsText(file);

      const lines = text.split('\n');
      const headers = parseCSVLine(lines[0]);
      const rows = lines.slice(1).filter(line => line.trim());
      const totalRecords = rows.length;

      let successCount = 0;
      let failureCount = 0;

      for (let i = 0; i < rows.length; i++) {
        try {
          setProgress((i / totalRecords) * 100);

          const values = parseCSVLine(rows[i]);
          const importRecord: VinylRecord = {
            artist: values[0]?.trim() || '',
            album: values[1]?.trim() || '',
            year: values[2]?.trim() ? parseInt(values[2].trim()) : undefined,
            label: values[3]?.trim(),
            country: values[4]?.trim(),
            genres: values[5]?.trim() ? values[5].trim().split(';').map(g => g.trim()) : [],
            styles: values[6]?.trim() ? values[6].trim().split(';').map(s => s.trim()) : [],
            musicians: values[7]?.trim() ? values[7].trim().split(';').map(m => m.trim()) : [],
            master_url: values[8]?.trim(),
            current_release_url: values[9]?.trim(),
            added_from: 'csv_import',
            custom_values_cache: {}
          };

          headers.forEach((header, index) => {
            const value = values[index]?.trim();
            if (!value) return;

            switch (header.toLowerCase()) {
              case 'artist':
                importRecord.artist = value;
                break;
              case 'album':
                importRecord.album = value;
                break;
              case 'original year':
                importRecord.year = parseInt(value);
                break;
              case 'label':
                importRecord.label = value;
                break;
              case 'country':
                importRecord.country = value;
                break;
              case 'genres':
                importRecord.genres = value.split(';').map(g => g.trim());
                break;
              case 'styles':
                importRecord.styles = value.split(';').map(s => s.trim());
                break;
              case 'musicians':
                importRecord.musicians = value.split(';').map(m => m.trim());
                break;
              case 'master url':
                importRecord.master_url = value;
                break;
              case 'release url':
                importRecord.current_release_url = value;
                break;
              default: {
                // Not a standard field - match against a custom column by name.
                const customColumn = customColumns.find(col => col.name === header);
                if (customColumn) {
                  importRecord.custom_values_cache![customColumn.id] = value;
                }
              }
            }
          });

          const response = await recordsService.add(importRecord);
          if (response.success) {
            successCount++;
          } else {
            failureCount++;
          }
        } catch (err) {
          console.error('Failed to process record:', err);
          failureCount++;
        }
      }

      setProgress(100);

      notifications.show({
        title: 'Import Complete',
        message: `Successfully imported ${successCount} records. ${failureCount} records failed.`,
        color: failureCount > 0 ? 'yellow' : 'green'
      });

      appEvents.emit('tableRefresh');
      return true;
    } catch (err) {
      console.error('Failed to import CSV:', err);
      notifications.show({
        title: 'Import Failed',
        message: 'Failed to import CSV file. Please check the file format and try again.',
        color: 'red'
      });
      return false;
    } finally {
      setImporting(false);
    }
  };

  return { importing, progress, importCsv };
}
