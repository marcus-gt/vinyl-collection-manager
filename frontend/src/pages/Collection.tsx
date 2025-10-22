import { useEffect, useState, useMemo } from 'react';
import { TextInput, Textarea, Button, Group, Stack, Text, ActionIcon, Modal, Tooltip, Popover, Box, Badge, Checkbox } from '@mantine/core';
import { IconTrash, IconX, IconSearch, IconPlus, IconColumns, IconPencil, IconCheck } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { records, customColumns as customColumnsApi } from '../services/api';
import type { VinylRecord, CustomColumn, CustomColumnValue } from '../types';
import { CustomColumnManager } from '../components/CustomColumnManager';
import { AddRecordsModal } from '../components/AddRecordsModal';
import { useDebouncedCallback } from 'use-debounce';
import { PILL_COLORS } from '../types';
import { ResizableTable } from '../components/ResizableTable';
import { SortingState, ColumnDef, Row } from '@tanstack/react-table';

const PAGE_SIZE = 40;

// Create a service for custom values
const customValuesService = {
  getForRecord: async (recordId: string): Promise<{ success: boolean; data?: CustomColumnValue[] }> => {
    try {
      const response = await fetch(`/api/records/${recordId}/custom-values`, {
        method: 'GET',
        credentials: 'include'
      });
      const data = await response.json();
      return data;
    } catch (err) {
      console.error(`Failed to get custom values for record ${recordId}:`, err);
      return { success: false };
    }
  },
  update: async (recordId: string, values: Record<string, string>): Promise<{ success: boolean }> => {
    try {
      const response = await fetch(`/api/records/${recordId}/custom-values`, {
        method: 'PUT',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(values)
      });
      const data = await response.json();
      return data;
    } catch (err) {
      console.error(`Failed to update custom values for record ${recordId}:`, err);
      return { success: false };
    }
  },
  getAllForRecords: async (recordIds: string[]): Promise<Record<string, CustomColumnValue[]>> => {
    try {
      const results: Record<string, CustomColumnValue[]> = {};
      // Fetch custom values for each record in parallel
      await Promise.all(recordIds.map(async (recordId) => {
        const response = await customValuesService.getForRecord(recordId);
        if (response.success && response.data) {
          results[recordId] = response.data;
        }
      }));
      return results;
    } catch (err) {
      console.error('Failed to load custom values for records:', err);
      return {};
    }
  }
};

// Service for updating standard record fields
const recordFieldsService = {
  update: async (recordId: string, updates: Record<string, any>): Promise<{ success: boolean; data?: VinylRecord }> => {
    try {
      const response = await fetch(`/api/records/${recordId}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updates)
      });
      const data = await response.json();
      return data;
    } catch (err) {
      console.error(`Failed to update record ${recordId}:`, err);
      return { success: false };
    }
  }
};

// Reusable component for editing standard columns (with pencil icon for two-step edit)
interface EditableStandardCellProps {
  value: any;
  displayValue?: string;
  fieldName: string;
  fieldLabel: string;
  recordId: string;
  inputType: 'text' | 'number' | 'textarea' | 'array';
  onUpdate: (recordId: string, fieldName: string, newValue: any) => void;
}

function EditableStandardCell({ 
  value, 
  displayValue, 
  fieldName, 
  fieldLabel, 
  recordId, 
  inputType, 
  onUpdate 
}: EditableStandardCellProps) {
  const [localValue, setLocalValue] = useState(value);
  const [opened, setOpened] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  
  useEffect(() => {
    setLocalValue(value);
  }, [value]);
  
  // For array types, check if arrays are equal
  const hasChanges = inputType === 'array'
    ? JSON.stringify(localValue) !== JSON.stringify(value)
    : localValue !== value;
  
  const handleSave = async () => {
    if (!recordId || !hasChanges) return;
    
    try {
      const response = await recordFieldsService.update(recordId, { [fieldName]: localValue });
      if (response.success) {
        onUpdate(recordId, fieldName, localValue);
        setIsEditing(false);
        setOpened(false);
      }
    } catch (error) {
      console.error(`Error updating ${fieldName}:`, error);
    }
  };
  
  const handleCancel = () => {
    setLocalValue(value);
    setIsEditing(false);
    setOpened(false);
  };
  
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      handleCancel();
    } else if (e.key === 'Enter' && e.ctrlKey && hasChanges) {
      handleSave();
    }
  };
  
  // Render display value (for arrays, join with comma)
  const renderDisplayValue = () => {
    if (displayValue !== undefined) return displayValue;
    if (inputType === 'array') {
      return Array.isArray(value) && value.length > 0 ? value.join(', ') : '-';
    }
    return value || '-';
  };
  
  // Render input field based on type
  const renderInput = () => {
    if (inputType === 'textarea' || inputType === 'array') {
      const textValue = inputType === 'array' 
        ? (Array.isArray(localValue) ? localValue.join(', ') : '')
        : localValue;
        
      return (
        <Textarea
          size="sm"
          value={textValue}
          onChange={(e) => {
            const newValue = inputType === 'array'
              ? e.target.value.split(',').map(s => s.trim()).filter(s => s)
              : e.target.value;
            setLocalValue(newValue);
          }}
          placeholder={`Enter ${fieldLabel.toLowerCase()}`}
          autosize
          minRows={2}
          maxRows={6}
          styles={{ root: { maxWidth: '90vw' } }}
          onKeyDown={handleKeyDown}
          autoFocus
        />
      );
    }
    
    if (inputType === 'number') {
      return (
        <TextInput
          size="sm"
          type="number"
          value={localValue}
          onChange={(e) => setLocalValue(e.target.value ? parseInt(e.target.value) : '')}
          placeholder={`Enter ${fieldLabel.toLowerCase()}`}
          styles={{ input: { minHeight: '36px' }, root: { maxWidth: '90vw' } }}
          onKeyDown={handleKeyDown}
          autoFocus
        />
      );
    }
    
    // Default: text input
    return (
      <Textarea
        size="sm"
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        placeholder={`Enter ${fieldLabel.toLowerCase()}`}
        autosize
        minRows={2}
        maxRows={6}
        styles={{ root: { maxWidth: '90vw' } }}
        onKeyDown={handleKeyDown}
        autoFocus
      />
    );
  };
  
  return (
    <Box 
      style={{ 
        position: 'relative', 
        width: '100%', 
        height: '100%', 
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center'
      }} 
      onClick={() => setOpened(true)}
    >
      <Popover width={400} position="bottom" withArrow shadow="md" opened={opened} onChange={(o) => { setOpened(o); if (!o) handleCancel(); }}>
        <Popover.Target>
          <div style={{ width: '100%' }}>
            <Text size="sm" lineClamp={1} style={{ maxWidth: '90vw' }}>
              {renderDisplayValue()}
            </Text>
          </div>
        </Popover.Target>
        <Popover.Dropdown>
          <Stack gap="xs">
            <Group justify="space-between" align="center">
              <Text size="sm" fw={500}>{fieldLabel}</Text>
              <Group gap="xs">
                {isEditing ? (
                  <>
                    {hasChanges && (
                      <ActionIcon size="sm" variant="subtle" color="green" onClick={(e) => { e.stopPropagation(); handleSave(); }}>
                        <IconCheck size={16} />
                      </ActionIcon>
                    )}
                    <ActionIcon size="sm" variant="subtle" color="red" onClick={(e) => { e.stopPropagation(); handleCancel(); }}>
                      <IconX size={16} />
                    </ActionIcon>
                  </>
                ) : (
                  <>
                    <ActionIcon size="sm" variant="subtle" onClick={(e) => { e.stopPropagation(); setIsEditing(true); }}>
                      <IconPencil size={16} />
                    </ActionIcon>
                    <ActionIcon size="sm" variant="subtle" onClick={(e) => { e.stopPropagation(); handleCancel(); }}>
                      <IconX size={16} />
                    </ActionIcon>
                  </>
                )}
              </Group>
            </Group>
            {isEditing ? renderInput() : (
              <Text size="sm" style={{ whiteSpace: 'pre-wrap', userSelect: 'text' }}>
                {renderDisplayValue()}
              </Text>
            )}
          </Stack>
        </Popover.Dropdown>
      </Popover>
    </Box>
  );
}

// Reusable component for editing custom columns (with auto-save behavior)
interface EditableCustomCellProps {
  value: string;
  recordId: string;
  column: CustomColumn;
  onUpdate: (recordId: string, columnId: string, newValue: string) => void;
}

function EditableCustomCell({ 
  value, 
  recordId, 
  column,
  onUpdate 
}: EditableCustomCellProps) {
  const [localValue, setLocalValue] = useState(value);
  const [opened, setOpened] = useState(false);
  
  useEffect(() => {
    setLocalValue(value);
  }, [value]);
  
  const debouncedUpdate = useDebouncedCallback(async (newValue: string) => {
    if (!recordId) return;
    onUpdate(recordId, column.id, newValue);
  }, 1000);
  
  const handleChange = (newValue: string) => {
    setLocalValue(newValue);
    debouncedUpdate(newValue);
  };
  
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      setOpened(false);
    }
    if (e.key === 'Escape') {
      setOpened(false);
    }
  };
  
  // Boolean type
  if (column.type === 'boolean') {
    return (
      <Box style={{ 
        width: '100%', 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center',
        height: '32px'
      }}>
        <Checkbox
          checked={localValue === 'true'}
          onChange={(e) => handleChange(e.currentTarget.checked.toString())}
          size="sm"
          styles={{
            input: {
              cursor: 'pointer'
            }
          }}
        />
      </Box>
    );
  }
  
  // Multi-select type
  if (column.type === 'multi-select' && column.options) {
    const values = localValue ? localValue.split(',') : [];
    
    return (
      <Box 
        style={{ 
          position: 'relative', 
          width: '100%', 
          height: '100%', 
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center'
        }} 
        onClick={() => setOpened(true)}
      >
        <Popover width={400} position="bottom" withArrow shadow="md" opened={opened} onChange={setOpened}>
          <Popover.Target>
            <div style={{ width: '100%' }}>
              {values.length === 0 ? (
                <Text size="sm" c="dimmed">-</Text>
              ) : (
                <Box style={{ 
                  position: 'relative',
                  height: '48px',
                  overflow: 'hidden'
                }}>
                  <Group gap={4} wrap="nowrap" style={{ 
                    height: '100%',
                    alignItems: 'center',
                    padding: '4px'
                  }}>
                    {values.map((val: string) => (
                      <Badge
                        key={val}
                        variant="filled"
                        size="sm"
                        radius="sm"
                        color={column.option_colors?.[val] || PILL_COLORS.default}
                        styles={{
                          root: {
                            textTransform: 'none',
                            cursor: 'default',
                            padding: '3px 8px',
                            whiteSpace: 'nowrap',
                            display: 'inline-flex',
                            flexShrink: 0,
                            height: '20px',
                            lineHeight: '14px'
                          }
                        }}
                      >
                        {val}
                      </Badge>
                    ))}
                  </Group>
                </Box>
              )}
            </div>
          </Popover.Target>
          <Popover.Dropdown>
            <Stack gap="xs">
              <Group justify="space-between" align="center">
                <Text size="sm" fw={500}>Edit {column.name}</Text>
                <ActionIcon size="sm" variant="subtle" onClick={(e) => { e.stopPropagation(); setOpened(false); }}>
                  <IconX size={16} />
                </ActionIcon>
              </Group>
              <Group gap="xs" wrap="wrap">
                {(column.options || []).map((opt) => {
                  const isSelected = values.includes(opt);
                  return (
                    <Badge
                      key={opt}
                      variant="filled"
                      size="sm"
                      radius="sm"
                      color={column.option_colors?.[opt] || PILL_COLORS.default}
                      styles={{
                        root: {
                          textTransform: 'none',
                          cursor: 'pointer',
                          padding: '3px 8px',
                          opacity: isSelected ? 1 : 0.3
                        }
                      }}
                      onClick={() => {
                        const newValues = isSelected
                          ? values.filter((v: string) => v !== opt)
                          : [...values, opt];
                        handleChange(newValues.join(','));
                      }}
                    >
                      {opt}
                    </Badge>
                  );
                })}
              </Group>
            </Stack>
          </Popover.Dropdown>
        </Popover>
      </Box>
    );
  }
  
  // Single-select type
  if (column.type === 'single-select' && column.options) {
    return (
      <Box 
        style={{ 
          position: 'relative', 
          width: '100%', 
          height: '100%', 
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center'
        }} 
        onClick={() => setOpened(true)}
      >
        <Popover width={400} position="bottom" withArrow shadow="md" opened={opened} onChange={setOpened}>
          <Popover.Target>
            <div style={{ width: '100%' }}>
              {localValue ? (
                <Badge
                  variant="filled"
                  size="sm"
                  radius="sm"
                  color={column.option_colors?.[localValue] || PILL_COLORS.default}
                  styles={{
                    root: {
                      textTransform: 'none',
                      cursor: 'default',
                      padding: '3px 8px'
                    }
                  }}
                >
                  {localValue}
                </Badge>
              ) : (
                <Text size="sm" c="dimmed">-</Text>
              )}
            </div>
          </Popover.Target>
          <Popover.Dropdown>
            <Stack gap="xs">
              <Group justify="space-between" align="center">
                <Text size="sm" fw={500}>Edit {column.name}</Text>
                <ActionIcon size="sm" variant="subtle" onClick={(e) => { e.stopPropagation(); setOpened(false); }}>
                  <IconX size={16} />
                </ActionIcon>
              </Group>
              <Group gap="xs" wrap="wrap">
                {column.options.map((opt) => (
                  <Badge
                    key={opt}
                    variant="filled"
                    size="sm"
                    radius="sm"
                    color={column.option_colors?.[opt] || PILL_COLORS.default}
                    styles={{
                      root: {
                        textTransform: 'none',
                        cursor: 'pointer',
                        padding: '3px 8px',
                        opacity: localValue === opt ? 1 : 0.5
                      }
                    }}
                    onClick={() => {
                      if (localValue === opt) {
                        handleChange('');
                      } else {
                        handleChange(opt);
                      }
                      setOpened(false);
                    }}
                  >
                    {opt}
                  </Badge>
                ))}
              </Group>
            </Stack>
          </Popover.Dropdown>
        </Popover>
      </Box>
    );
  }
  
  // Number type
  if (column.type === 'number') {
    return (
      <Box 
        style={{ 
          position: 'relative', 
          width: '100%', 
          height: '100%', 
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center'
        }} 
        onClick={() => setOpened(true)}
      >
        <Popover width={400} position="bottom" withArrow shadow="md" opened={opened} onChange={setOpened}>
          <Popover.Target>
            <div style={{ width: '100%' }}>
              <Text size="sm" lineClamp={1} style={{ maxWidth: '90vw' }}>
                {localValue || '-'}
              </Text>
            </div>
          </Popover.Target>
          <Popover.Dropdown>
            <Stack gap="xs">
              <Group justify="space-between" align="center">
                <Text size="sm" fw={500}>Edit {column.name}</Text>
                <ActionIcon size="sm" variant="subtle" onClick={(e) => { e.stopPropagation(); setOpened(false); }}>
                  <IconX size={16} />
                </ActionIcon>
              </Group>
              <TextInput
                size="sm"
                type="number"
                value={localValue}
                onChange={(e) => handleChange(e.target.value)}
                placeholder={`Enter ${column.name.toLowerCase()}`}
                styles={{
                  input: {
                    minHeight: '36px'
                  },
                  root: {
                    maxWidth: '90vw'
                  }
                }}
                onKeyDown={handleKeyDown}
              />
            </Stack>
          </Popover.Dropdown>
        </Popover>
      </Box>
    );
  }
  
  // Default: Text type
  return (
    <Box 
      style={{ 
        position: 'relative', 
        width: '100%', 
        height: '100%', 
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center'
      }} 
      onClick={() => setOpened(true)}
    >
      <Popover width={400} position="bottom" withArrow shadow="md" opened={opened} onChange={setOpened}>
        <Popover.Target>
          <div style={{ width: '100%' }}>
            <Text size="sm" lineClamp={1} style={{ maxWidth: '90vw' }}>
              {localValue || '-'}
            </Text>
          </div>
        </Popover.Target>
        <Popover.Dropdown>
          <Stack gap="xs">
            <Group justify="space-between" align="center">
              <Text size="sm" fw={500}>Edit {column.name}</Text>
              <ActionIcon size="sm" variant="subtle" onClick={(e) => { e.stopPropagation(); setOpened(false); }}>
                <IconX size={16} />
              </ActionIcon>
            </Group>
            <Textarea
              size="sm"
              value={localValue}
              onChange={(e) => handleChange(e.target.value)}
              placeholder={`Enter ${column.name.toLowerCase()}`}
              autosize
              minRows={2}
              maxRows={6}
              styles={{
                root: {
                  maxWidth: '90vw'
                }
              }}
              onKeyDown={handleKeyDown}
            />
          </Stack>
        </Popover.Dropdown>
      </Popover>
    </Box>
  );
}

// Reusable component for editing Discogs links
interface EditableDiscogsLinksProps {
  masterUrl: string | null;
  currentReleaseUrl: string | null;
  recordId: string;
  onUpdate: (recordId: string, updates: { master_url?: string | null; current_release_url?: string | null }) => void;
}

function EditableDiscogsLinks({ 
  masterUrl, 
  currentReleaseUrl, 
  recordId, 
  onUpdate 
}: EditableDiscogsLinksProps) {
  const [opened, setOpened] = useState(false);
  const [localMasterUrl, setLocalMasterUrl] = useState(masterUrl || '');
  const [localCurrentUrl, setLocalCurrentUrl] = useState(currentReleaseUrl || '');
  const [masterError, setMasterError] = useState('');
  const [currentError, setCurrentError] = useState('');
  
  useEffect(() => {
    setLocalMasterUrl(masterUrl || '');
    setLocalCurrentUrl(currentReleaseUrl || '');
  }, [masterUrl, currentReleaseUrl]);
  
  const validateDiscogsUrl = (url: string, type: 'master' | 'release'): boolean => {
    if (!url) return true; // Empty is valid
    
    const masterPattern = /^https?:\/\/(www\.)?discogs\.com\/master\/\d+/;
    const releasePattern = /^https?:\/\/(www\.)?discogs\.com\/release\/\d+/;
    
    if (type === 'master') {
      return masterPattern.test(url);
    } else {
      return releasePattern.test(url);
    }
  };
  
  const hasChanges = localMasterUrl !== (masterUrl || '') || localCurrentUrl !== (currentReleaseUrl || '');
  
  const handleSave = async () => {
    // Validate URLs
    let hasErrors = false;
    
    if (localMasterUrl && !validateDiscogsUrl(localMasterUrl, 'master')) {
      setMasterError('Must be a valid Discogs master URL (e.g., https://www.discogs.com/master/123456)');
      hasErrors = true;
    } else {
      setMasterError('');
    }
    
    if (localCurrentUrl && !validateDiscogsUrl(localCurrentUrl, 'release')) {
      setCurrentError('Must be a valid Discogs release URL (e.g., https://www.discogs.com/release/123456)');
      hasErrors = true;
    } else {
      setCurrentError('');
    }
    
    if (hasErrors || !hasChanges) return;
    
    const updates: { master_url?: string | null; current_release_url?: string | null } = {};
    
    if (localMasterUrl !== (masterUrl || '')) {
      updates.master_url = localMasterUrl || null;
    }
    
    if (localCurrentUrl !== (currentReleaseUrl || '')) {
      updates.current_release_url = localCurrentUrl || null;
    }
    
    onUpdate(recordId, updates);
    setOpened(false);
  };
  
  const handleCancel = () => {
    setLocalMasterUrl(masterUrl || '');
    setLocalCurrentUrl(currentReleaseUrl || '');
    setMasterError('');
    setCurrentError('');
    setOpened(false);
  };
  
  return (
    <Box 
      style={{ 
        position: 'relative', 
        width: '100%', 
        height: '100%', 
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center'
      }} 
      onClick={() => setOpened(true)}
    >
      <Popover width={500} position="bottom" withArrow shadow="md" opened={opened} onChange={(o) => { setOpened(o); if (!o) handleCancel(); }}>
        <Popover.Target>
          <div style={{ width: '100%' }}>
            <Group gap={4} wrap="nowrap">
              {masterUrl && (
                <Button
                  component="a"
                  href={masterUrl}
                  target="_blank"
                  variant="light"
                  size="compact-xs"
                  style={{ fontSize: '11px', padding: '2px 8px' }}
                  onClick={(e) => e.stopPropagation()}
                >
                  Original
                </Button>
              )}
              {currentReleaseUrl && (
                <Button
                  component="a"
                  href={currentReleaseUrl}
                  target="_blank"
                  variant="light"
                  size="compact-xs"
                  color="blue"
                  style={{ fontSize: '11px', padding: '2px 8px' }}
                  onClick={(e) => e.stopPropagation()}
                >
                  Current
                </Button>
              )}
              {!masterUrl && !currentReleaseUrl && (
                <Text size="sm" c="dimmed">-</Text>
              )}
            </Group>
          </div>
        </Popover.Target>
        <Popover.Dropdown>
          <Stack gap="xs">
            <Group justify="space-between" align="center">
              <Text size="sm" fw={500}>Edit Discogs Links</Text>
              <Group gap="xs">
                {hasChanges && !masterError && !currentError && (
                  <ActionIcon size="sm" variant="subtle" color="green" onClick={(e) => { e.stopPropagation(); handleSave(); }}>
                    <IconCheck size={16} />
                  </ActionIcon>
                )}
                <ActionIcon size="sm" variant="subtle" color="red" onClick={(e) => { e.stopPropagation(); handleCancel(); }}>
                  <IconX size={16} />
                </ActionIcon>
              </Group>
            </Group>
            
            {/* Original/Master URL */}
            <Box>
              <Group gap="xs" align="flex-start">
                <Text size="sm" fw={500} style={{ minWidth: '60px', marginTop: '6px' }}>Original</Text>
                <Box style={{ flex: 1 }}>
                  <TextInput
                    size="sm"
                    value={localMasterUrl}
                    onChange={(e) => {
                      setLocalMasterUrl(e.target.value);
                      if (masterError) setMasterError('');
                    }}
                    placeholder="https://www.discogs.com/master/123456"
                    error={masterError}
                    styles={{
                      input: {
                        fontSize: '12px'
                      }
                    }}
                  />
                </Box>
              </Group>
            </Box>
            
            {/* Current Release URL */}
            <Box>
              <Group gap="xs" align="flex-start">
                <Text size="sm" fw={500} style={{ minWidth: '60px', marginTop: '6px' }}>Current</Text>
                <Box style={{ flex: 1 }}>
                  <TextInput
                    size="sm"
                    value={localCurrentUrl}
                    onChange={(e) => {
                      setLocalCurrentUrl(e.target.value);
                      if (currentError) setCurrentError('');
                    }}
                    placeholder="https://www.discogs.com/release/123456"
                    error={currentError}
                    styles={{
                      input: {
                        fontSize: '12px'
                      }
                    }}
                  />
                </Box>
              </Group>
            </Box>
          </Stack>
        </Popover.Dropdown>
      </Popover>
    </Box>
  );
}

function Collection() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userRecords, setUserRecords] = useState<VinylRecord[]>([]);
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [editingRecord, setEditingRecord] = useState<VinylRecord | null>(null);
  const [editingNotes, setEditingNotes] = useState('');
  const [sortStatus, setSortStatus] = useState<SortingState>([{ id: 'artist', desc: false }]);
  const [addRecordsModalOpened, setAddRecordsModalOpened] = useState(false);
  const [customColumnManagerOpened, setCustomColumnManagerOpened] = useState(false);
  const [customColumns, setCustomColumns] = useState<CustomColumn[]>([]);

  useEffect(() => {
    loadRecords();
    loadCustomColumns();

    // Add event listeners for data updates
    const handleCustomValuesUpdate = () => {
      console.log('Custom values update event received');
      loadRecords();
    };

    const handleTableRefresh = () => {
      console.log('Table refresh event received, reloading records...');
      loadRecords();
      loadCustomColumns();
      console.log('Records reload initiated');
    };

    // Add event listeners
    window.addEventListener('custom-values-updated', handleCustomValuesUpdate);
    window.addEventListener('vinyl-collection-table-refresh', handleTableRefresh);

    return () => {
      console.log('Removing event listeners');
      window.removeEventListener('custom-values-updated', handleCustomValuesUpdate);
      window.removeEventListener('vinyl-collection-table-refresh', handleTableRefresh);
    };
  }, []);

  // Separate useEffect for CSV export to ensure it has access to current userRecords
  useEffect(() => {
    const handleExportCSV = () => {
      console.log('Export CSV event received');
      console.log('Current records:', userRecords);
      
      if (!userRecords.length) {
        notifications.show({
          title: 'No Records',
          message: 'There are no records to export.',
          color: 'yellow'
        });
        return;
      }

      // Define standard headers
      const standardHeaders = [
        'Artist',
        'Album',
        'Original Year',
        'Original Format',
        'Label',
        'Country',
        'Genres',
        'Styles',
        'Musicians',
        'Added',
        'Release Year',
        'Release Format',
        'Master URL',
        'Release URL'
      ];

      // Add custom column headers
      const customHeaders = customColumns.map(col => col.name);
      const headers = [...standardHeaders, ...customHeaders];

      console.log('Headers:', headers);
      console.log('Custom columns:', customColumns);

      // Convert records to CSV rows
      const rows = userRecords.map(record => {
        console.log('Processing record:', record);
        
        // Standard fields
        const standardFields = [
          record.artist || '',
          record.album || '',
          record.year?.toString() || '',
          record.master_format || '',
          record.label || '',
          record.country || '',
          (record.genres || []).join('; '),
          (record.styles || []).join('; '),
          (record.musicians || []).join('; '),
          record.created_at ? new Date(record.created_at).toLocaleString() : '',
          record.current_release_year?.toString() || '',
          record.current_release_format || '',
          record.master_url || '',
          record.current_release_url || ''
        ];

        // Custom fields
        const customFields = customColumns.map(col => {
          const value = record.custom_values_cache[col.id];
          console.log(`Custom field ${col.name}:`, value);
          return value || '';
        });

        const row = [...standardFields, ...customFields];
        console.log('Generated row:', row);
        return row;
      });

      console.log('Generated rows:', rows);

      // Combine headers and rows
      const csvContent = [
        headers.join(','),
        ...rows.map(row => 
          row.map(cell => {
            // Handle null or undefined
            if (cell === null || cell === undefined) return '';
            
            // Convert to string and handle special characters
            const str = String(cell);
            if (str.includes(',') || str.includes('\n') || str.includes('"')) {
              return `"${str.replace(/"/g, '""')}"`;
            }
            return str;
          }).join(',')
        )
      ].join('\n');

      console.log('CSV Content:', csvContent);

      // Create blob and trigger save dialog
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const defaultFileName = `vinyl-collection-${new Date().toISOString().split('T')[0]}.csv`;
      
      const downloadFile = () => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = defaultFileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      };

      // Try to use the modern File System Access API
      if ('showSaveFilePicker' in window) {
        (window as any).showSaveFilePicker({
          suggestedName: defaultFileName,
          types: [{
            description: 'CSV File',
            accept: { 'text/csv': ['.csv'] },
          }],
        })
          .then((handle: any) => handle.createWritable())
          .then((writable: any) => writable.write(blob).then(() => writable.close()))
          .catch((err: Error) => {
            // Fallback to traditional method if user cancels or there's an error
            if (err.name !== 'AbortError') {
              downloadFile();
            }
          });
      } else {
        // Fallback for browsers that don't support showSaveFilePicker
        downloadFile();
      }
    };

    window.addEventListener('export-collection-csv', handleExportCSV);
    return () => window.removeEventListener('export-collection-csv', handleExportCSV);
  }, [userRecords, customColumns]); // Include dependencies

  const loadRecords = async () => {
    setLoading(true);
    try {
      const response = await records.getAll();
      if (response.success && response.data) {
        // Records now include custom_values_cache
        setUserRecords(response.data);
      } else {
        setError(response.error || 'Failed to load records');
      }
    } catch (err) {
      setError('Failed to load records');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadCustomColumns = async () => {
    try {
      const response = await customColumnsApi.getAll();
      if (response.success && response.data) {
        setCustomColumns(response.data);
      }
    } catch (err) {
      console.error('Failed to load custom columns:', err);
    }
  };

  const handleUpdateNotes = async () => {
    if (!editingRecord?.id) return;
    
    setLoading(true);
    try {
      const response = await records.updateNotes(editingRecord.id, editingNotes);
      if (response.success && response.data) {
        setUserRecords(prevRecords => 
          prevRecords.map(record => 
            record.id === editingRecord.id ? response.data! : record
          )
        );
        setEditingRecord(null);
        notifications.show({
          title: 'Success',
          message: 'Notes updated successfully',
          color: 'green'
        });
      } else {
        setError(response.error || 'Failed to update notes');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update notes');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (record: VinylRecord) => {
    console.log('Delete initiated for record:', record);
    
    if (!record.id) {
      console.error('No record ID found:', record);
      return;
    }

    if (!window.confirm('Are you sure you want to delete this record?')) {
      console.log('Delete cancelled by user');
      return;
    }

    console.log('Starting delete process for record ID:', record.id);
    setLoading(true);
    try {
      // First load fresh data to ensure we have the latest state
      const currentData = await records.getAll();
      console.log('Current data from server:', currentData);
      
      if (currentData.success && currentData.data) {
        setUserRecords(currentData.data);
      }

      console.log('Calling delete API...');
      const response = await records.delete(record.id);
      console.log('Delete API response:', response);
      
      if (response.success) {
        console.log('Delete successful, reloading data...');
        // Reload the full data after successful deletion
        const refreshedData = await records.getAll();
        console.log('Refreshed data:', refreshedData);
        
        if (refreshedData.success && refreshedData.data) {
          setUserRecords(refreshedData.data);
          notifications.show({
            title: 'Success',
            message: 'Record deleted successfully',
            color: 'green'
          });
        } else {
          console.error('Failed to reload data after deletion');
          notifications.show({
            title: 'Warning',
            message: 'Record may have been deleted but failed to refresh data',
            color: 'yellow'
          });
        }
      } else {
        console.error('Delete failed:', response.error);
        setError(response.error || 'Failed to delete record');
        notifications.show({
          title: 'Error',
          message: response.error || 'Failed to delete record',
          color: 'red'
        });
      }
    } catch (err) {
      console.error('Error during delete:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to delete record';
      setError(errorMessage);
      notifications.show({
        title: 'Error',
        message: errorMessage,
        color: 'red'
      });
    } finally {
      setLoading(false);
      console.log('Delete process completed');
    }
  };

  const tableColumns = useMemo(() => {
    const standardColumns: ColumnDef<VinylRecord>[] = [
            { 
              id: 'artist',
              accessorKey: 'artist', 
              header: 'Artist', 
              enableSorting: true,
              size: 200,
              enableResizing: true,
              minSize: 100,
              maxSize: 500,
              cell: ({ row }: { row: Row<VinylRecord> }) => (
                <EditableStandardCell
                  value={row.original.artist || ''}
                  fieldName="artist"
                  fieldLabel="Artist"
                  recordId={row.original.id!}
                  inputType="textarea"
                  onUpdate={(recordId, fieldName, newValue) => {
                    setUserRecords(prevRecords =>
                      prevRecords.map(r => r.id === recordId ? { ...r, [fieldName]: newValue } : r)
                    );
                  }}
                />
              )
            },
            { 
              id: 'album',
              accessorKey: 'album', 
              header: 'Album', 
              enableSorting: true,
              size: 250,
              enableResizing: true,
              minSize: 100,
              maxSize: 500,
              cell: ({ row }: { row: Row<VinylRecord> }) => (
                <EditableStandardCell
                  value={row.original.album || ''}
                  fieldName="album"
                  fieldLabel="Album"
                  recordId={row.original.id!}
                  inputType="textarea"
                  onUpdate={(recordId, fieldName, newValue) => {
                    setUserRecords(prevRecords =>
                      prevRecords.map(r => r.id === recordId ? { ...r, [fieldName]: newValue } : r)
                    );
                  }}
                />
              )
            },
            { 
              id: 'year',
              accessorKey: 'year', 
              header: 'Original Year',
              enableSorting: true,
              size: 80,
              cell: ({ row }: { row: Row<VinylRecord> }) => (
                <EditableStandardCell
                  value={row.original.year || ''}
                  fieldName="year"
                  fieldLabel="Original Year"
                  recordId={row.original.id!}
                  inputType="number"
                  onUpdate={(recordId, fieldName, newValue) => {
                    setUserRecords(prevRecords =>
                      prevRecords.map(r => r.id === recordId ? { ...r, [fieldName]: newValue } : r)
                    );
                  }}
                />
              )
            },
            { 
              id: 'current_release_year', 
              accessorKey: 'current_release_year', 
              header: 'Release Year', 
              enableSorting: true, 
              size: 80,
              enableResizing: true,
              minSize: 80,
              maxSize: 120,
              cell: ({ row }: { row: Row<VinylRecord> }) => (
                <EditableStandardCell
                  value={row.original.current_release_year || ''}
                  fieldName="current_release_year"
                  fieldLabel="Release Year"
                  recordId={row.original.id!}
                  inputType="number"
                  onUpdate={(recordId, fieldName, newValue) => {
                    setUserRecords(prevRecords =>
                      prevRecords.map(r => r.id === recordId ? { ...r, [fieldName]: newValue } : r)
                    );
                  }}
                />
              )
            },
            { 
              id: 'label', 
              accessorKey: 'label', 
              header: 'Label', 
              enableSorting: true,
              size: 150,
              enableResizing: true,
              minSize: 100,
              maxSize: 500,
              cell: ({ row }: { row: Row<VinylRecord> }) => (
                <EditableStandardCell
                  value={row.original.label || ''}
                  fieldName="label"
                  fieldLabel="Label"
                  recordId={row.original.id!}
                  inputType="textarea"
                  onUpdate={(recordId, fieldName, newValue) => {
                    setUserRecords(prevRecords =>
                      prevRecords.map(r => r.id === recordId ? { ...r, [fieldName]: newValue } : r)
                    );
                  }}
                />
              )
            },
            { 
              id: 'country', 
              accessorKey: 'country', 
              header: 'Country', 
              enableSorting: true,
              size: 100,
              enableResizing: true,
              minSize: 80,
              maxSize: 200,
              cell: ({ row }: { row: Row<VinylRecord> }) => (
                <EditableStandardCell
                  value={row.original.country || ''}
                  fieldName="country"
                  fieldLabel="Country"
                  recordId={row.original.id!}
                  inputType="textarea"
                  onUpdate={(recordId, fieldName, newValue) => {
                    setUserRecords(prevRecords =>
                      prevRecords.map(r => r.id === recordId ? { ...r, [fieldName]: newValue } : r)
                    );
                  }}
                />
              )
            },
            {
              id: 'master_format',
              accessorKey: 'master_format',
              header: 'Original Format',
              enableSorting: true,
              size: 100,
              enableResizing: true,
              minSize: 80,
              maxSize: 150,
              cell: ({ row }: { row: Row<VinylRecord> }) => (
                <EditableStandardCell
                  value={row.original.master_format || ''}
                  fieldName="master_format"
                  fieldLabel="Original Format"
                  recordId={row.original.id!}
                  inputType="textarea"
                  onUpdate={(recordId, fieldName, newValue) => {
                    setUserRecords(prevRecords =>
                      prevRecords.map(r => r.id === recordId ? { ...r, [fieldName]: newValue } : r)
                    );
                  }}
                />
              )
            },
            {
              id: 'current_release_format',
              accessorKey: 'current_release_format',
              header: 'Release Format',
              enableSorting: true,
              size: 100,
              enableResizing: true,
              minSize: 80,
              maxSize: 150,
              cell: ({ row }: { row: Row<VinylRecord> }) => (
                <EditableStandardCell
                  value={row.original.current_release_format || ''}
                  fieldName="current_release_format"
                  fieldLabel="Release Format"
                  recordId={row.original.id!}
                  inputType="textarea"
                  onUpdate={(recordId, fieldName, newValue) => {
                    setUserRecords(prevRecords =>
                      prevRecords.map(r => r.id === recordId ? { ...r, [fieldName]: newValue } : r)
                    );
                  }}
                />
              )
            },
            { 
              id: 'genres', 
              accessorKey: 'genres', 
              header: 'Genres', 
              enableSorting: true,
              size: 150,
              enableResizing: true,
              minSize: 100,
              maxSize: 500,
              cell: ({ row }: { row: Row<VinylRecord> }) => (
                <EditableStandardCell
                  value={row.original.genres || []}
                  displayValue={row.original.genres?.join(', ') || '-'}
                  fieldName="genres"
                  fieldLabel="Genres (comma-separated)"
                  recordId={row.original.id!}
                  inputType="array"
                  onUpdate={(recordId, fieldName, newValue) => {
                    setUserRecords(prevRecords =>
                      prevRecords.map(r => r.id === recordId ? { ...r, [fieldName]: newValue } : r)
                    );
                  }}
                />
              )
            },
            { 
              id: 'styles', 
              accessorKey: 'styles', 
              header: 'Styles', 
              enableSorting: true,
              size: 180,
              enableResizing: true,
              minSize: 100,
              maxSize: 500,
              cell: ({ row }: { row: Row<VinylRecord> }) => (
                <EditableStandardCell
                  value={row.original.styles || []}
                  displayValue={row.original.styles?.join(', ') || '-'}
                  fieldName="styles"
                  fieldLabel="Styles (comma-separated)"
                  recordId={row.original.id!}
                  inputType="array"
                  onUpdate={(recordId, fieldName, newValue) => {
                    setUserRecords(prevRecords =>
                      prevRecords.map(r => r.id === recordId ? { ...r, [fieldName]: newValue } : r)
                    );
                  }}
                />
              )
            },
            { 
              id: 'musicians', 
              accessorKey: 'musicians', 
              header: 'Musicians', 
              enableSorting: true,
              size: 200,
              enableResizing: true,
              minSize: 100,
              maxSize: 500,
              cell: ({ row }: { row: Row<VinylRecord> }) => (
                <EditableStandardCell
                  value={row.original.musicians || []}
                  displayValue={row.original.musicians?.join(', ') || '-'}
                  fieldName="musicians"
                  fieldLabel="Musicians (comma-separated)"
                  recordId={row.original.id!}
                  inputType="array"
                  onUpdate={(recordId, fieldName, newValue) => {
                    setUserRecords(prevRecords =>
                      prevRecords.map(r => r.id === recordId ? { ...r, [fieldName]: newValue } : r)
                    );
                  }}
                />
              )
            },
            { 
              id: 'created_at', 
              accessorKey: 'created_at', 
              header: 'Added', 
              enableSorting: true,
              size: 150,
              enableResizing: true,
              minSize: 100,
              maxSize: 500,
              cell: ({ row }: { row: Row<VinylRecord> }) => row.original.created_at ? 
                new Date(row.original.created_at).toLocaleDateString() : '-'
            },
            {
              id: 'added_from',
              accessorKey: 'added_from',
              header: 'Source',
              enableSorting: true,
              size: 160,
              enableResizing: true,
              minSize: 160,
              maxSize: 200,
              meta: {
                type: 'single-select',
                options: [
                  'Manual',
                  'Spotify URL',
                  'Spotify List Manual',
                  'Spotify List Auto',
                  'Barcode',
                  'Discogs',
                  'CSV Import'
                ],
                valueMap: {
                  'manual': 'Manual',
                  'spotify': 'Spotify URL',
                  'spotify_list': 'Spotify List Manual',
                  'spotify_list_sub': 'Spotify List Auto',
                  'barcode': 'Barcode',
                  'discogs_url': 'Discogs',
                  'csv_import': 'CSV Import'
                },
                labelMap: {
                  'Manual': 'manual',
                  'Spotify URL': 'spotify',
                  'Spotify List Manual': 'spotify_list',
                  'Spotify List Auto': 'spotify_list_sub',
                  'Barcode': 'barcode',
                  'Discogs': 'discogs_url',
                  'CSV Import': 'csv_import'
                },
                option_colors: {
                  'Manual': 'gray',
                  'Spotify URL': 'green',
                  'Spotify List Manual': 'green',
                  'Spotify List Auto': 'green',
                  'Barcode': 'blue',
                  'Discogs': 'orange',
                  'CSV Import': 'violet'
                }
              },
              filterFn: (row: Row<VinylRecord>, columnId: string, filterValue: string) => {
                const cellValue = row.getValue(columnId);
                // Use hardcoded map for filter values
                const labelMap: Record<string, string> = {
                  'Manual': 'manual',
                  'Spotify URL': 'spotify',
                  'Spotify List Manual': 'spotify_list',
                  'Spotify List Auto': 'spotify_list_sub',
                  'Barcode': 'barcode',
                  'Discogs': 'discogs_url',
                  'CSV Import': 'csv_import'
                };
                const internalValue = labelMap[filterValue];
                console.log('Filter comparison:', { cellValue, filterValue, internalValue, labelMap });
                return cellValue === internalValue;
              },
              enableColumnFilter: true,
              cell: ({ row }: { row: Row<VinylRecord> }) => {
                const source = row.original.added_from;
                const displayMap: Record<string, string> = {
                  'manual': 'Manual',
                  'spotify': 'Spotify URL',
                  'spotify_list': 'Spotify List Manual',
                  'spotify_list_sub': 'Spotify List Auto',
                  'barcode': 'Barcode',
                  'discogs_url': 'Discogs',
                  'csv_import': 'CSV Import'
                };
                const colorMap: Record<string, string> = {
                  'manual': 'gray',
                  'spotify': 'green',
                  'spotify_list': 'green',
                  'spotify_list_sub': 'green',
                  'barcode': 'blue',
                  'discogs_url': 'orange',
                  'csv_import': 'violet'
                };
                
                const displayText = source ? displayMap[source] || source : '-';
                const color = source ? colorMap[source] : undefined;
                
                return (
                  <Box style={{ position: 'relative' }}>
                    <Text size="sm" lineClamp={1} style={{ cursor: 'default', maxWidth: '90vw' }}>
                      {source ? (
                        <Badge
                          variant="filled"
                          size="sm"
                          radius="sm"
                          color={color}
                          styles={{
                            root: {
                              textTransform: 'none',
                              cursor: 'default',
                              padding: '3px 8px'
                            }
                          }}
                        >
                          {displayText}
                        </Badge>
                      ) : (
                        <Text size="sm" c="dimmed">-</Text>
                      )}
                    </Text>
                  </Box>
                );
              }
            },
            {
              id: 'links',
              accessorKey: 'links',
              header: 'Discogs Links',
              size: 142,
              minSize: 142,
              maxSize: 142,
              enableResizing: false,
              cell: ({ row }: { row: Row<VinylRecord> }) => (
                <EditableDiscogsLinks
                  masterUrl={row.original.master_url || null}
                  currentReleaseUrl={row.original.current_release_url || null}
                  recordId={row.original.id!}
                  onUpdate={async (recordId, updates) => {
                    try {
                      const response = await recordFieldsService.update(recordId, updates);
                      if (response.success) {
                        setUserRecords(prevRecords =>
                          prevRecords.map(r => r.id === recordId ? { 
                            ...r, 
                            master_url: updates.master_url !== undefined ? updates.master_url || undefined : r.master_url,
                            current_release_url: updates.current_release_url !== undefined ? updates.current_release_url || undefined : r.current_release_url
                          } : r)
                        );
                      }
                    } catch (error) {
                      console.error('Error updating Discogs links:', error);
                      notifications.show({
                        title: 'Error',
                        message: 'Failed to update Discogs links',
                        color: 'red'
                      });
                    }
                  }}
                />
              ),
            },
    ];

    // Add custom columns
    customColumns.forEach(column => {
      standardColumns.push({
        id: column.id,
        header: column.name,
        accessorFn: (record: VinylRecord) => {
          // Safely access custom_values_cache with fallback
          return record.custom_values_cache?.[column.id] || '';
        },
        enableSorting: true,
        size: column.type === 'boolean' ? 50 : // Smaller width for boolean columns
              column.type === 'multi-select' ? 300 : 
              ['text'].includes(column.type) ? 300 : 150,
        enableResizing: true,
        minSize: column.type === 'boolean' ? 50 : 100, // Smaller min width for boolean
        maxSize: column.type === 'boolean' ? 100 : 1000, // Smaller max width for boolean
        meta: { 
          type: column.type,
          options: column.options,
          option_colors: column.option_colors
        },
        filterFn: column.type === 'multi-select' ? 'arrIncludes' : 
                  column.type === 'single-select' ? 'equals' : 
                  undefined,
        enableColumnFilter: column.type === 'multi-select' || column.type === 'single-select',
        cell: ({ row }: { row: Row<VinylRecord> }) => (
          <EditableCustomCell
            value={row.original.custom_values_cache[column.id] || ''}
            recordId={row.original.id!}
            column={column}
            onUpdate={async (recordId, columnId, newValue) => {
              try {
                console.log('Updating custom value:', {
                  columnId,
                  newValue,
                  recordId
                });
                
                const valueToSend = {
                  [columnId]: newValue
                };

                const response = await customValuesService.update(recordId, valueToSend);
                
                if (response.success) {
                  setUserRecords(prevRecords =>
                    prevRecords.map(r =>
                      r.id === recordId
                        ? {
                            ...r,
                            custom_values_cache: {
                              ...r.custom_values_cache,
                              [columnId]: newValue
                            }
                          }
                        : r
                    )
                  );
                  console.log('Successfully updated custom value');
                } else {
                  console.error('Failed to update custom value');
                  notifications.show({
                    title: 'Error',
                    message: 'Failed to update value',
                    color: 'red'
                  });
                }
              } catch (err) {
                console.error('Error updating custom value:', err);
                notifications.show({
                  title: 'Error',
                  message: 'Failed to update value',
                  color: 'red'
                });
              }
            }}
          />
        )
      });
    });

    // Add actions column last
    const actionsColumn: ColumnDef<VinylRecord> = {
      id: 'actions',
      accessorKey: 'actions',
      header: '', // Empty header
      size: 50, // Reduced from 100 to 50
      enableResizing: true,
      minSize: 50, // Reduced from 100 to 50
      maxSize: 100,
      cell: ({ row }: { row: Row<VinylRecord> }) => (
        <Box style={{ 
          width: '100%', 
          display: 'flex', 
          justifyContent: 'center', 
          alignItems: 'center'
        }}>
                  <Tooltip label="Delete">
                    <ActionIcon 
                      color="red" 
                      variant="light"
                      size="sm"
              onClick={(e) => {
                e.stopPropagation();
                console.log('Delete clicked for record:', row.original);
                handleDelete(row.original);
              }}
                    >
                      <IconTrash size={16} />
                    </ActionIcon>
                  </Tooltip>
        </Box>
      ),
    };

    return [...standardColumns, actionsColumn];
  }, [customColumns]);

  return (
    <Box
      style={{
        padding: 'var(--mantine-spacing-md)',
      }}
    >
      <Group justify="space-between" mb="md">
        <TextInput
          placeholder="Search records..."
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.currentTarget.value)}
          leftSection={<IconSearch size={14} />}
          style={{ minWidth: '300px' }}
        />
        <Group>
          <Button
            variant="default"
            onClick={() => setAddRecordsModalOpened(true)}
            leftSection={<IconPlus size={14} />}
          >
            Add Records
          </Button>
          <Button
            variant="default"
            onClick={() => setCustomColumnManagerOpened(true)}
            leftSection={<IconColumns size={14} />}
          >
            Manage Columns
          </Button>
        </Group>
      </Group>

      {error && (
        <Text c="red" mb="md">
          {error}
        </Text>
      )}

      <ResizableTable
        data={userRecords}
        columns={tableColumns}
        sortState={sortStatus}
        onSortChange={setSortStatus}
        tableId="vinyl-collection"
        loading={loading}
        recordsPerPage={PAGE_SIZE}
        page={page}
        onPageChange={setPage}
        customColumns={customColumns}
        searchQuery={searchQuery}
      />

      {/* Modals */}
      <CustomColumnManager
        opened={customColumnManagerOpened}
        onClose={() => setCustomColumnManagerOpened(false)}
        customColumns={customColumns}
        onCustomColumnsChange={(newColumns: CustomColumn[]) => {
          setCustomColumns(newColumns);
          loadCustomColumns();
        }}
      />
      <AddRecordsModal
        opened={addRecordsModalOpened}
        onClose={() => setAddRecordsModalOpened(false)}
      />

      <Modal
        opened={!!editingRecord}
        onClose={() => setEditingRecord(null)}
        title="Edit Notes"
        size="md"
      >
        <Stack>
          {editingRecord && (
            <Text size="sm" fw={500}>
              {editingRecord.artist} - {editingRecord.album}
            </Text>
          )}
          <TextInput
            label="Notes"
            value={editingNotes}
            onChange={(e) => setEditingNotes(e.target.value)}
            placeholder="Add notes about this record..."
            size="sm"
            styles={{
              input: {
                minHeight: '36px'
              }
            }}
          />
          <Group justify="flex-end">
            <Button variant="light" onClick={() => setEditingRecord(null)} size="sm">
              Cancel
            </Button>
            <Button onClick={handleUpdateNotes} loading={loading} size="sm">
              Save
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Box>
  );
}

export default Collection; 
