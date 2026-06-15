import type { ReactNode } from 'react';
import { Badge, Box, Button, Group, Modal, Stack, Text } from '@mantine/core';
import type { CustomColumn, VinylRecord } from '../../types';
import { getColorStyles } from './helpers';
import { EditableCustomCell } from './EditableCustomCell';

export interface RecordPreviewModalProps {
  previewRecord: VinylRecord | null;
  onClose: () => void;
  columnVisibility: Record<string, boolean>;
  customColumns: CustomColumn[];
  userRecords: VinylRecord[];
  getAllRecords: () => VinylRecord[];
  createEditableStandardCell: (
    record: VinylRecord,
    fieldName: string,
    fieldLabel: string,
    inputType: 'text' | 'number' | 'textarea' | 'array',
    options?: { requirePencilClick?: boolean; displayValue?: string; noTruncate?: boolean }
  ) => ReactNode;
  onCustomValueUpdate: (recordId: string, columnId: string, newValue: string) => void | Promise<void>;
}

export function RecordPreviewModal({
  previewRecord,
  onClose,
  columnVisibility,
  customColumns,
  userRecords,
  getAllRecords,
  createEditableStandardCell,
  onCustomValueUpdate,
}: RecordPreviewModalProps) {
  return (
      <Modal
        opened={!!previewRecord}
        onClose={onClose}
        title={previewRecord ? `${previewRecord.artist} - ${previewRecord.album}` : 'Record Details'}
        size="lg"
        fullScreen={window.innerWidth < 768}
      >
        {previewRecord && (() => {
          // Helper function to check if a column is visible
          const isColumnVisible = (columnId: string) => {
            return columnVisibility[columnId] !== false;
          };

          return (
          <Stack gap="xs">
            {/* All Fields - Notion-style key: value layout */}
            {isColumnVisible('artist') && (
            <Box style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', minHeight: '32px' }}>
              <Text size="sm" c="gray.6" style={{ minWidth: '140px', paddingTop: '8px', flexShrink: 0 }}>Artist</Text>
              <Box style={{ flex: 1, minWidth: 0, maxHeight: '200px', overflowY: 'auto' }}>
                {createEditableStandardCell(previewRecord, 'artist', 'Artist', 'textarea', { noTruncate: true })}
              </Box>
            </Box>
            )}

            {isColumnVisible('album') && (
            <Box style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', minHeight: '32px' }}>
              <Text size="sm" c="gray.6" style={{ minWidth: '140px', paddingTop: '8px', flexShrink: 0 }}>Album</Text>
              <Box style={{ flex: 1, minWidth: 0, maxHeight: '200px', overflowY: 'auto' }}>
                {createEditableStandardCell(previewRecord, 'album', 'Album', 'textarea', { noTruncate: true })}
              </Box>
            </Box>
            )}

            {isColumnVisible('year') && (
            <Box style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', minHeight: '32px' }}>
              <Text size="sm" c="gray.6" style={{ minWidth: '140px', paddingTop: '8px', flexShrink: 0 }}>Original Year</Text>
              <Box style={{ flex: 1, minWidth: 0, maxHeight: '200px', overflowY: 'auto' }}>
                {createEditableStandardCell(previewRecord, 'year', 'Original Year', 'number', { noTruncate: true })}
              </Box>
            </Box>
            )}

            {isColumnVisible('current_release_year') && (
            <Box style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', minHeight: '32px' }}>
              <Text size="sm" c="gray.6" style={{ minWidth: '140px', paddingTop: '8px', flexShrink: 0 }}>Release Year</Text>
              <Box style={{ flex: 1, minWidth: 0, maxHeight: '200px', overflowY: 'auto' }}>
                {createEditableStandardCell(previewRecord, 'current_release_year', 'Release Year', 'number', { noTruncate: true })}
              </Box>
            </Box>
            )}

            {isColumnVisible('label') && (
            <Box style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', minHeight: '32px' }}>
              <Text size="sm" c="gray.6" style={{ minWidth: '140px', paddingTop: '8px', flexShrink: 0 }}>Original Label</Text>
              <Box style={{ flex: 1, minWidth: 0 }}>
                {createEditableStandardCell(previewRecord, 'label', 'Original Label', 'textarea', { noTruncate: true })}
              </Box>
            </Box>
            )}

            {isColumnVisible('original_catno') && (
            <Box style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', minHeight: '32px' }}>
              <Text size="sm" c="gray.6" style={{ minWidth: '140px', paddingTop: '8px', flexShrink: 0 }}>Original Catno</Text>
              <Box style={{ flex: 1, minWidth: 0 }}>
                {createEditableStandardCell(previewRecord, 'original_catno', 'Original Catno', 'text', { noTruncate: true })}
              </Box>
            </Box>
            )}

            {isColumnVisible('country') && (
            <Box style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', minHeight: '32px' }}>
              <Text size="sm" c="gray.6" style={{ minWidth: '140px', paddingTop: '8px', flexShrink: 0 }}>Original Country</Text>
              <Box style={{ flex: 1, minWidth: 0 }}>
                {createEditableStandardCell(previewRecord, 'country', 'Original Country', 'text', { noTruncate: true })}
              </Box>
            </Box>
            )}

            {isColumnVisible('current_label') && (
            <Box style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', minHeight: '32px' }}>
              <Text size="sm" c="gray.6" style={{ minWidth: '140px', paddingTop: '8px', flexShrink: 0 }}>Release Label</Text>
              <Box style={{ flex: 1, minWidth: 0 }}>
                {createEditableStandardCell(previewRecord, 'current_label', 'Release Label', 'textarea', { noTruncate: true })}
              </Box>
            </Box>
            )}

            {isColumnVisible('current_catno') && (
            <Box style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', minHeight: '32px' }}>
              <Text size="sm" c="gray.6" style={{ minWidth: '140px', paddingTop: '8px', flexShrink: 0 }}>Release Catno</Text>
              <Box style={{ flex: 1, minWidth: 0 }}>
                {createEditableStandardCell(previewRecord, 'current_catno', 'Release Catno', 'text', { noTruncate: true })}
              </Box>
            </Box>
            )}

            {isColumnVisible('current_country') && (
            <Box style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', minHeight: '32px' }}>
              <Text size="sm" c="gray.6" style={{ minWidth: '140px', paddingTop: '8px', flexShrink: 0 }}>Release Country</Text>
              <Box style={{ flex: 1, minWidth: 0 }}>
                {createEditableStandardCell(previewRecord, 'current_country', 'Release Country', 'text', { noTruncate: true })}
              </Box>
            </Box>
            )}

            {isColumnVisible('genres') && (
            <Box style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', minHeight: '32px' }}>
              <Text size="sm" c="gray.6" style={{ minWidth: '140px', paddingTop: '8px', flexShrink: 0 }}>Genres</Text>
              <Box style={{ flex: 1, minWidth: 0, maxHeight: '200px', overflowY: 'auto' }}>
                {createEditableStandardCell(previewRecord, 'genres', 'Genres (comma-separated)', 'array', {
                  displayValue: previewRecord.genres?.join(', ') || '-',
                  noTruncate: true
                })}
              </Box>
            </Box>
            )}

            {isColumnVisible('styles') && (
            <Box style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', minHeight: '32px' }}>
              <Text size="sm" c="gray.6" style={{ minWidth: '140px', paddingTop: '8px', flexShrink: 0 }}>Styles</Text>
              <Box style={{ flex: 1, minWidth: 0, maxHeight: '200px', overflowY: 'auto' }}>
                {createEditableStandardCell(previewRecord, 'styles', 'Styles (comma-separated)', 'array', {
                  displayValue: previewRecord.styles?.join(', ') || '-',
                  noTruncate: true
                })}
              </Box>
            </Box>
            )}

            {isColumnVisible('current_release_format') && (
            <Box style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', minHeight: '32px' }}>
              <Text size="sm" c="gray.6" style={{ minWidth: '140px', paddingTop: '8px', flexShrink: 0 }}>Format</Text>
              <Box style={{ flex: 1, minWidth: 0, maxHeight: '200px', overflowY: 'auto' }}>
                {createEditableStandardCell(previewRecord, 'current_release_format', 'Format', 'textarea', { noTruncate: true })}
              </Box>
            </Box>
            )}

            {isColumnVisible('master_format') && (
            <Box style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', minHeight: '32px' }}>
              <Text size="sm" c="gray.6" style={{ minWidth: '140px', paddingTop: '8px', flexShrink: 0 }}>Master Format</Text>
              <Box style={{ flex: 1, minWidth: 0, maxHeight: '200px', overflowY: 'auto' }}>
                {createEditableStandardCell(previewRecord, 'master_format', 'Master Format', 'textarea', { noTruncate: true })}
              </Box>
            </Box>
            )}

            {isColumnVisible('tracklist') && (
            <Box style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', minHeight: '32px' }}>
              <Text size="sm" c="gray.6" style={{ minWidth: '140px', paddingTop: '8px', flexShrink: 0 }}>Tracklist</Text>
              <Box style={{ flex: 1, minWidth: 0, maxHeight: '250px', overflowY: 'auto', paddingTop: '8px' }}>
                {(() => {
                  // Parse tracklist if it's a string (JSONB from database)
                  let parsedTracklist = previewRecord.tracklist;
                  if (typeof previewRecord.tracklist === 'string') {
                    try {
                      parsedTracklist = JSON.parse(previewRecord.tracklist);
                    } catch {
                      parsedTracklist = [];
                    }
                  }
                  
                  // Format track inline: "Position: Title - Duration"
                  const formatTrackInline = (t: any) => {
                    const pos = t.position || '';
                    const title = t.title || '';
                    const duration = t.duration || '';
                    return `${pos}${pos && title ? ': ' : ''}${title}${duration ? ` - ${duration}` : ''}`;
                  };
                  
                  // Filter to only include tracks with positions
                  const tracks = Array.isArray(parsedTracklist) 
                    ? parsedTracklist.filter((t: any) => t.position && t.position.trim() && t.title) 
                    : [];
                  
                  // Group tracks by side (A, B, C, D, etc.)
                  const groupedBySide = tracks.reduce((acc: any, track: any) => {
                    const position = track.position || '';
                    // Extract the letter from position (e.g., "A1" -> "A")
                    const sideMatch = position.match(/^([A-Z])/);
                    const side = sideMatch ? sideMatch[1] : 'Other';
                    
                    if (!acc[side]) {
                      acc[side] = [];
                    }
                    acc[side].push(track);
                    return acc;
                  }, {});
                  
                  // Sort sides alphabetically
                  const sortedSides = Object.keys(groupedBySide).sort();
                  
                  return sortedSides.length > 0 ? (
                    <Stack gap="md">
                      {sortedSides.map((side, sideIdx) => (
                        <Box key={sideIdx}>
                          <Text size="sm" fw={600} mb={6}>{side}-side</Text>
                          <Stack gap={4}>
                            {groupedBySide[side].map((track: any, trackIdx: number) => (
                              <Text key={trackIdx} size="sm" ml="md">
                                {formatTrackInline(track)}
                              </Text>
                            ))}
                          </Stack>
                        </Box>
                      ))}
                    </Stack>
                  ) : (
                    <Text size="sm" c="dimmed">-</Text>
                  );
                })()}
              </Box>
            </Box>
            )}

            {isColumnVisible('contributors') && (
            <Box style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', minHeight: '32px' }}>
              <Text size="sm" c="gray.6" style={{ minWidth: '140px', paddingTop: '8px', flexShrink: 0 }}>Contributors</Text>
              <Box style={{ flex: 1, minWidth: 0, maxHeight: '250px', overflowY: 'auto', paddingTop: '8px' }}>
                {previewRecord.contributors && typeof previewRecord.contributors === 'object' && Object.keys(previewRecord.contributors).length > 0 ? (
                  <Stack gap="sm">
                    {Object.entries(previewRecord.contributors).map(([mainCategory, subCategories]) => {
                      // Collect all contributors from all subcategories for this main category
                      const contributorsByName = new Map<string, {name: string, roles: Set<string>, instruments: Set<string>}>();
                      
                      Object.entries(subCategories as any).forEach(([_subCategory, contribList]) => {
                        (contribList as any[]).forEach(contrib => {
                          const cleanName = contrib.name.replace(/\s*\(\d+\)\s*$/, '').trim();
                          if (!contributorsByName.has(cleanName)) {
                            contributorsByName.set(cleanName, {
                              name: cleanName,
                              roles: new Set(),
                              instruments: new Set()
                            });
                          }
                          const existing = contributorsByName.get(cleanName)!;
                          (contrib.roles || []).forEach((r: string) => existing.roles.add(r));
                          (contrib.instruments || []).forEach((i: string) => existing.instruments.add(i));
                        });
                      });
                      
                      if (contributorsByName.size === 0) return null;
                      
                      return (
                        <Box key={mainCategory}>
                          <Text size="sm" fw={600} mb={4}>{mainCategory}</Text>
                          {Array.from(contributorsByName.values()).map((contrib, cIdx) => {
                            // Combine roles and instruments for display
                            const allParts = [...Array.from(contrib.roles), ...Array.from(contrib.instruments)];
                            
                            // Skip if no parts to show
                            if (allParts.length === 0) return null;
                            
                            return (
                              <Text key={cIdx} size="sm" ml="md">
                                <Text component="span" fw={500}>{contrib.name}</Text>
                                <Text component="span" c="dimmed"> - {allParts.join(', ')}</Text>
                              </Text>
                            );
                          })}
                        </Box>
                      );
                    })}
                  </Stack>
                ) : (
                  <Text size="sm" c="dimmed">-</Text>
                )}
              </Box>
            </Box>
            )}

            {isColumnVisible('added_from') && (
            <Box style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', minHeight: '32px' }}>
              <Text size="sm" c="gray.6" style={{ minWidth: '140px', paddingTop: '8px', flexShrink: 0 }}>Source</Text>
              <Box style={{ flex: 1, paddingTop: '8px', minWidth: 0 }}>
                {previewRecord.added_from ? (
                  (() => {
                    const valueMap: Record<string, string> = {
                      'manual': 'Manual',
                      'spotify': 'Spotify URL',
                      'spotify_list': 'Spotify List Manual',
                      'spotify_list_sub': 'Spotify List Auto',
                      'barcode': 'Barcode',
                      'discogs_url': 'Discogs',
                      'csv_import': 'CSV Import'
                    };
                    const optionColors: Record<string, string> = {
                      'Manual': 'gray',
                      'Spotify URL': 'green',
                      'Spotify List Manual': 'green',
                      'Spotify List Auto': 'green',
                      'Barcode': 'blue',
                      'Discogs': 'orange',
                      'CSV Import': 'violet'
                    };
                    const displayValue = valueMap[previewRecord.added_from] || previewRecord.added_from;
                    const colorName = optionColors[displayValue] || 'gray';
                    return (
                      <Badge
                        size="sm"
                        radius="md"
                        style={getColorStyles(colorName)}
                        styles={{
                          root: {
                            textTransform: 'none',
                            padding: '2px 5px',
                            fontSize: '10.5px'
                          }
                        }}
                      >
                        {displayValue}
                      </Badge>
                    );
                  })()
                ) : (
                  <Text size="sm">-</Text>
                )}
              </Box>
            </Box>
            )}

            {isColumnVisible('created_at') && (
            <Box style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', minHeight: '32px' }}>
              <Text size="sm" c="gray.6" style={{ minWidth: '140px', paddingTop: '8px', flexShrink: 0 }}>Added</Text>
              <Box style={{ flex: 1, paddingTop: '8px', minWidth: 0 }}>
                <Text size="sm" style={{ wordBreak: 'break-word' }}>{previewRecord.created_at ? new Date(previewRecord.created_at).toLocaleDateString() : '-'}</Text>
              </Box>
            </Box>
            )}

            {isColumnVisible('links') && (
            <Box style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', minHeight: '32px' }}>
              <Text size="sm" c="gray.6" style={{ minWidth: '140px', paddingTop: '8px', flexShrink: 0 }}>Discogs Links</Text>
              <Box style={{ flex: 1, minWidth: 0 }}>
                <Group gap="xs">
                  {previewRecord.master_url && (
                    <Button
                      component="a"
                      href={previewRecord.master_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      variant="light"
                      size="xs"
                    >
                      View Master
                    </Button>
                  )}
                  {previewRecord.original_release_url && (
                    <Button
                      component="a"
                      href={previewRecord.original_release_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      variant="light"
                      size="xs"
                    >
                      View Original
                    </Button>
                  )}
                  {previewRecord.current_release_url && (
                    <Button
                      component="a"
                      href={previewRecord.current_release_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      variant="light"
                      size="xs"
                    >
                      View Current
                    </Button>
                  )}
                  {!previewRecord.master_url && !previewRecord.original_release_url && !previewRecord.current_release_url && (
                    <Text size="sm">-</Text>
                  )}
                </Group>
              </Box>
            </Box>
            )}

            {/* Custom Columns */}
            {customColumns.filter(column => isColumnVisible(column.id)).map((column) => {
              const value = previewRecord.custom_values_cache?.[column.id];
              return (
                <Box key={column.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', minHeight: '32px' }}>
                  <Text size="sm" c="gray.6" style={{ minWidth: '140px', paddingTop: '8px', flexShrink: 0 }}>{column.name}</Text>
                  <Box style={{ flex: 1, minWidth: 0, maxHeight: '200px', overflowY: 'auto' }}>
                    <EditableCustomCell
                      recordId={previewRecord.id!}
                      column={column}
                      value={value}
                      allRecords={userRecords}
                      getAllRecords={getAllRecords}
                      noTruncate={true}
                      onUpdate={onCustomValueUpdate}
                    />
                  </Box>
                </Box>
              );
            })}
          </Stack>
          );
        })()}
      </Modal>

  );
}
