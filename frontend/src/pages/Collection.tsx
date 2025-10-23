import { useEffect, useState, useMemo, memo, useRef } from 'react';
import { TextInput, Textarea, Button, Group, Stack, Text, ActionIcon, Modal, Tooltip, Popover, Box, Badge, Checkbox, Menu } from '@mantine/core';
import { IconTrash, IconX, IconSearch, IconPlus, IconColumns, IconPencil, IconCheck } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { modals } from '@mantine/modals';
import { records, customColumns as customColumnsApi } from '../services/api';
import type { VinylRecord, CustomColumn, CustomColumnValue } from '../types';
import { CustomColumnManager } from '../components/CustomColumnManager';
import { AddRecordsModal } from '../components/AddRecordsModal';
import { useDebouncedCallback } from 'use-debounce';
import { PILL_COLORS } from '../constants/colors';
import { ResizableTable } from '../components/ResizableTable';
import { SortingState, ColumnDef, Row } from '@tanstack/react-table';

const PAGE_SIZE = 40;

// Helper function to get color styles for badges
const getColorStyles = (colorName: string) => {
  const colorOption = PILL_COLORS.options.find(opt => opt.value === colorName);
  if (colorOption) {
    return {
      backgroundColor: colorOption.background,
      color: colorOption.color,
      border: 'none'
    };
  }
  // Default gray if not found
  const defaultColor = PILL_COLORS.options.find(opt => opt.value === 'gray');
  return {
    backgroundColor: defaultColor?.background || 'rgba(120, 119, 116, 0.2)',
    color: defaultColor?.color || 'rgba(120, 119, 116, 1)',
    border: 'none'
  };
};

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

// Reusable component for editing standard columns (with optional pencil icon for two-step edit)
interface EditableStandardCellProps {
  value: any;
  displayValue?: string;
  fieldName: string;
  fieldLabel: string;
  recordId: string;
  inputType: 'text' | 'number' | 'textarea' | 'array';
  requirePencilClick?: boolean; // If true, shows pencil icon for two-step edit (default: true for standard columns)
  onUpdate: (recordId: string, fieldName: string, newValue: any) => void;
}

function EditableStandardCell({ 
  value, 
  displayValue, 
  fieldName, 
  fieldLabel, 
  recordId, 
  inputType, 
  requirePencilClick = true,
  onUpdate 
}: EditableStandardCellProps) {
  const [localValue, setLocalValue] = useState(value);
  const [opened, setOpened] = useState(false);
  const [isEditing, setIsEditing] = useState(!requirePencilClick); // Auto-edit if no pencil required
  
  useEffect(() => {
    setLocalValue(value);
  }, [value]);
  
  // Reset editing state when opening if pencil is not required
  useEffect(() => {
    if (opened && !requirePencilClick) {
      setIsEditing(true);
    }
  }, [opened, requirePencilClick]);
  
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
        setIsEditing(!requirePencilClick); // Keep editing mode if no pencil required
        setOpened(false);
      }
    } catch (error) {
      console.error(`Error updating ${fieldName}:`, error);
    }
  };
  
  const handleCancel = () => {
    setLocalValue(value);
    setIsEditing(!requirePencilClick); // Keep editing mode if no pencil required
    setOpened(false);
  };
  
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      handleCancel();
    } else if (inputType === 'textarea' || inputType === 'array') {
      // For textarea: Enter saves (or closes if no changes), Shift+Enter creates new line
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (hasChanges) {
          handleSave();
        } else {
          setOpened(false);
        }
      }
    } else {
      // For text/number inputs: Enter saves (or closes if no changes)
      if (e.key === 'Enter') {
        e.preventDefault();
        if (hasChanges) {
          handleSave();
        } else {
          setOpened(false);
        }
      }
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
              <Group gap={4}>
                {requirePencilClick && !isEditing ? (
                  // View mode (with pencil): show pencil and X
                  <>
                    <ActionIcon size="sm" variant="subtle" onClick={(e) => { e.stopPropagation(); setIsEditing(true); }}>
                      <IconPencil size={16} />
                    </ActionIcon>
                    <ActionIcon size="sm" variant="subtle" onClick={(e) => { e.stopPropagation(); handleCancel(); }}>
                      <IconX size={16} />
                    </ActionIcon>
                  </>
                ) : (
                  // Edit mode (or no pencil required): show checkmark (if changes) and X
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
                )}
              </Group>
            </Group>
            {(requirePencilClick && !isEditing) ? (
              <Text size="sm" style={{ whiteSpace: 'pre-wrap', userSelect: 'text' }}>
                {renderDisplayValue()}
              </Text>
            ) : (
              renderInput()
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
  allRecords: VinylRecord[];
  getAllRecords: () => VinylRecord[];
  onUpdate: (recordId: string, columnId: string, newValue: string) => void;
}

function EditableCustomCell({ 
  value, 
  recordId, 
  column,
  getAllRecords,
  onUpdate 
}: EditableCustomCellProps) {
  const [localValue, setLocalValue] = useState(value);
  const [opened, setOpened] = useState(false);
  const [, forceUpdate] = useState({});
  
  useEffect(() => {
    setLocalValue(value);
  }, [value]);
  
  // Listen for column metadata updates from other cells
  useEffect(() => {
    const handleMetadataUpdate = (event: Event) => {
      const customEvent = event as CustomEvent;
      if (customEvent.detail?.columnId === column.id) {
        // Update local column reference with new metadata
        if (customEvent.detail.option_colors) {
          column.option_colors = customEvent.detail.option_colors;
        }
        if (customEvent.detail.options) {
          column.options = customEvent.detail.options;
        }
        // Force re-render to show updated colors/options
        forceUpdate({});
      }
    };
    
    const handleRecordValuesUpdate = (event: Event) => {
      const customEvent = event as CustomEvent;
      if (customEvent.detail?.columnId === column.id) {
        // Check if this record's value needs updating
        const update = customEvent.detail.updates?.find((u: any) => u.recordId === recordId);
        if (update) {
          // Update the local value to reflect the change
          setLocalValue(update.value);
        }
      }
    };
    
    window.addEventListener('updateColumnMetadata', handleMetadataUpdate);
    window.addEventListener('updateRecordValues', handleRecordValuesUpdate);
    return () => {
      window.removeEventListener('updateColumnMetadata', handleMetadataUpdate);
      window.removeEventListener('updateRecordValues', handleRecordValuesUpdate);
    };
  }, [column, forceUpdate, recordId]);
  
  const debouncedUpdate = useDebouncedCallback(async (newValue: string) => {
    if (!recordId) return;
    onUpdate(recordId, column.id, newValue);
  }, 1000);
  
  const handleChange = (newValue: string) => {
    setLocalValue(newValue);
    debouncedUpdate(newValue);
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
    const [searchQuery, setSearchQuery] = useState('');
    const [isCreatingOption, setIsCreatingOption] = useState(false);
    
    // Filter options based on search query
    const filteredOptions = (column.options || [])
      .filter(opt => !values.includes(opt))
      .filter(opt => opt.toLowerCase().includes(searchQuery.toLowerCase()));
    
    // Check if search query matches an existing option exactly
    const exactMatch = column.options?.some(opt => opt.toLowerCase() === searchQuery.toLowerCase());
    const showCreateOption = searchQuery.trim() && !exactMatch;
    
    // Function to create a new option and add it to the column
    const handleCreateOption = async (newOption: string) => {
      if (!newOption.trim() || isCreatingOption) return;
      
      setIsCreatingOption(true);
      try {
        // Update the column with the new option
        const updatedOptions = [...(column.options || []), newOption.trim()];
        await customColumnsApi.update(column.id, {
          options: updatedOptions
        });
        
        // Update the column object locally to show the new option immediately
        column.options = updatedOptions;
        
        // Add the new option to the selected values
        const newValues = [...values, newOption.trim()];
        handleChange(newValues.join(','));
        
        // Clear search query
        setSearchQuery('');
        
        // Force a re-render to show the new option without closing popovers
        forceUpdate({});
        
        notifications.show({
          title: 'Option created',
          message: `Added "${newOption.trim()}" to ${column.name}`,
          color: 'green'
        });
      } catch (error) {
        console.error('Error creating option:', error);
        notifications.show({
          title: 'Error',
          message: 'Failed to create new option',
          color: 'red'
        });
      } finally {
        setIsCreatingOption(false);
      }
    };
    
    // Function to change option color
    const handleChangeColor = async (optionName: string, newColor: string) => {
      try {
        const updatedColors = {
          ...(column.option_colors || {}),
          [optionName]: newColor
        };
        
        await customColumnsApi.update(column.id, {
          option_colors: updatedColors
        });
        
        // Manually update the column object to reflect new colors immediately
        column.option_colors = updatedColors;
        
        // Force a re-render to show the color change without closing popovers
        forceUpdate({});
        
        // Dispatch a custom event that only updates the column metadata without refreshing everything
        window.dispatchEvent(new CustomEvent('updateColumnMetadata', { 
          detail: { columnId: column.id, option_colors: updatedColors } 
        }));
      } catch (error) {
        console.error('Error changing color:', error);
        notifications.show({
          title: 'Error',
          message: 'Failed to change color',
          color: 'red'
        });
      }
    };
    
    // Function to rename an option
    const handleRenameOption = async (oldName: string, newName: string) => {
      console.log(`[handleRenameOption] Called with oldName="${oldName}", newName="${newName}"`);
      
      if (!newName.trim() || oldName === newName.trim()) {
        console.log('[handleRenameOption] Early return: empty or same name');
        return;
      }
      
      try {
        // Check if new name already exists
        if (column.options?.some(opt => opt.toLowerCase() === newName.trim().toLowerCase() && opt !== oldName)) {
          console.log('[handleRenameOption] Error: option name already exists');
          notifications.show({
            title: 'Error',
            message: 'An option with this name already exists',
            color: 'red'
          });
          return;
        }
        
        // Update options list
        const updatedOptions = (column.options || []).map(opt => opt === oldName ? newName.trim() : opt);
        console.log('[handleRenameOption] Updated options:', updatedOptions);
        
        // Update option colors if the old name had a color
        const updatedColors = { ...(column.option_colors || {}) };
        if (updatedColors[oldName]) {
          updatedColors[newName.trim()] = updatedColors[oldName];
          delete updatedColors[oldName];
        }
        
        console.log('[handleRenameOption] Calling API to update column...');
        await customColumnsApi.update(column.id, {
          options: updatedOptions,
          option_colors: updatedColors
        });
        console.log('[handleRenameOption] Column updated successfully');
        
        // Update ALL records that have this option selected
        // Get fresh records to ensure we have the latest data
        const currentRecords = getAllRecords();
        console.log(`[handleRenameOption] Got ${currentRecords.length} records from getAllRecords()`);
        
        const recordsToUpdate = currentRecords.filter(record => {
          const value = record.custom_values_cache?.[column.id];
          if (!value) return false;
          
          if (column.type === 'single-select') {
            return value === oldName;
          } else if (column.type === 'multi-select') {
            const values = value.split(',').filter(Boolean);
            return values.includes(oldName);
          }
          return false;
        });
        
        console.log(`[handleRenameOption] Found ${recordsToUpdate.length} records to update:`, recordsToUpdate.map(r => ({ id: r.id, value: r.custom_values_cache[column.id] })));
        
        // Update the column object locally first
        column.options = updatedOptions;
        column.option_colors = updatedColors;
        
        // Show immediate feedback
        notifications.show({
          title: 'Renaming option',
          message: `Updating "${oldName}" to "${newName.trim()}" across ${recordsToUpdate.length} record${recordsToUpdate.length !== 1 ? 's' : ''}...`,
          color: 'blue',
          autoClose: 2000
        });
        
        // Update each record in the background (without awaiting)
        Promise.all(recordsToUpdate.map(async (record) => {
          const currentValue = record.custom_values_cache[column.id];
          let newValue: string;
          
          if (column.type === 'single-select') {
            newValue = newName.trim();
          } else {
            // multi-select: replace oldName with newName in the comma-separated list
            const values = currentValue.split(',').filter(Boolean);
            newValue = values.map(v => v === oldName ? newName.trim() : v).join(',');
          }
          
          // Update the record via API
          await onUpdate(record.id!, column.id, newValue);
          
          // Return the record ID and new value for local state update
          return { recordId: record.id!, newValue };
        })).then((updates) => {
          // After all updates complete, dispatch events to refresh other cells
          // 1. Update column metadata (options and colors)
          window.dispatchEvent(new CustomEvent('updateColumnMetadata', { 
            detail: { columnId: column.id, options: updatedOptions, option_colors: updatedColors } 
          }));
          
          // 2. Update record values with the new option name
          window.dispatchEvent(new CustomEvent('updateRecordValues', { 
            detail: { 
              columnId: column.id, 
              updates: updates.map(u => ({ recordId: u.recordId, value: u.newValue }))
            } 
          }));
          
          notifications.show({
            title: 'Option renamed',
            message: `Successfully updated ${recordsToUpdate.length} record${recordsToUpdate.length !== 1 ? 's' : ''}`,
            color: 'green'
          });
        }).catch((error) => {
          console.error('Error updating records:', error);
          notifications.show({
            title: 'Error',
            message: 'Some records may not have been updated',
            color: 'red'
          });
        });
      } catch (error) {
        console.error('Error renaming option:', error);
        notifications.show({
          title: 'Error',
          message: 'Failed to rename option',
          color: 'red'
        });
      }
    };
    
    // Function to delete an option
    const handleDeleteOption = async (optionName: string) => {
      try {
        // Remove from options list
        const updatedOptions = (column.options || []).filter(opt => opt !== optionName);
        
        // Remove from option colors
        const updatedColors = { ...(column.option_colors || {}) };
        delete updatedColors[optionName];
        
        await customColumnsApi.update(column.id, {
          options: updatedOptions,
          option_colors: updatedColors
        });
        
        // Update ALL records that have this option selected
        // Get fresh records to ensure we have the latest data
        const currentRecords = getAllRecords();
        const recordsToUpdate = currentRecords.filter(record => {
          const value = record.custom_values_cache?.[column.id];
          if (!value) return false;
          
          if (column.type === 'single-select') {
            return value === optionName;
          } else if (column.type === 'multi-select') {
            const values = value.split(',').filter(Boolean);
            return values.includes(optionName);
          }
          return false;
        });
        
        // Update the column object locally first
        column.options = updatedOptions;
        column.option_colors = updatedColors;
        
        // Show immediate feedback
        notifications.show({
          title: 'Deleting option',
          message: `Removing "${optionName}" from ${recordsToUpdate.length} record${recordsToUpdate.length !== 1 ? 's' : ''}...`,
          color: 'blue',
          autoClose: 2000
        });
        
        // Update each record in the background (without awaiting)
        Promise.all(recordsToUpdate.map(async (record) => {
          const currentValue = record.custom_values_cache[column.id];
          let newValue: string;
          
          if (column.type === 'single-select') {
            newValue = ''; // Clear single-select value
          } else {
            // multi-select: remove optionName from the comma-separated list
            const values = currentValue.split(',').filter(Boolean);
            newValue = values.filter(v => v !== optionName).join(',');
          }
          
          // Update the record via API
          await onUpdate(record.id!, column.id, newValue);
          
          // Return the record ID and new value for local state update
          return { recordId: record.id!, newValue };
        })).then((updates) => {
          // After all updates complete, dispatch events to refresh other cells
          // 1. Update column metadata (options and colors)
          window.dispatchEvent(new CustomEvent('updateColumnMetadata', { 
            detail: { columnId: column.id, options: updatedOptions, option_colors: updatedColors } 
          }));
          
          // 2. Update record values with the deleted option removed
          window.dispatchEvent(new CustomEvent('updateRecordValues', { 
            detail: { 
              columnId: column.id, 
              updates: updates.map(u => ({ recordId: u.recordId, value: u.newValue }))
            } 
          }));
          
          notifications.show({
            title: 'Option deleted',
            message: `Successfully removed from ${recordsToUpdate.length} record${recordsToUpdate.length !== 1 ? 's' : ''}`,
            color: 'green'
          });
        }).catch((error) => {
          console.error('Error updating records:', error);
          notifications.show({
            title: 'Error',
            message: 'Some records may not have been updated',
            color: 'red'
          });
        });
      } catch (error) {
        console.error('Error deleting option:', error);
        notifications.show({
          title: 'Error',
          message: 'Failed to delete option',
          color: 'red'
        });
      }
    };
    
    // Component for rendering a badge with context menu
    const OptionBadge = memo(({ 
      optionName, 
      isSelected, 
      onClick 
    }: { 
      optionName: string; 
      isSelected: boolean; 
      onClick?: () => void;
    }) => {
      const [menuOpened, setMenuOpened] = useState(false);
      const [editedName, setEditedName] = useState(optionName);
      
      return (
        <Menu 
          opened={menuOpened} 
          onChange={(opened) => {
            setMenuOpened(opened);
            if (opened) {
              setEditedName(optionName); // Reset to current name when opening
            }
          }}
          position="bottom-start"
          withinPortal={false}
        >
          <Menu.Target>
            <Badge
              size="sm"
              radius="sm"
              style={{ 
                cursor: 'pointer',
                opacity: isSelected ? 1 : 0.7,
                transition: 'opacity 0.1s ease',
                ...getColorStyles(column.option_colors?.[optionName] || PILL_COLORS.default)
              }}
              styles={{
                root: {
                  textTransform: 'none',
                  padding: '3px 8px'
                }
              }}
              onMouseEnter={(e) => {
                if (!isSelected) e.currentTarget.style.opacity = '1';
              }}
              onMouseLeave={(e) => {
                if (!isSelected) e.currentTarget.style.opacity = '0.7';
              }}
              onClick={(e) => {
                e.stopPropagation();
                // Left click - select/deselect if menu not open
                if (!menuOpened && onClick) {
                  onClick();
                }
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setMenuOpened(true);
                setEditedName(optionName); // Set the edited name when opening menu
              }}
            >
              {optionName}
            </Badge>
          </Menu.Target>
          <Menu.Dropdown>
            {/* Header with action buttons */}
            <Box p="xs" pb={0} onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
              <Group justify="space-between" align="center" mb="xs">
                <Text size="xs" fw={500} c="dimmed">Edit Option</Text>
                <Group gap={4} wrap="nowrap">
                  {editedName.trim() && editedName !== optionName && (
                    <ActionIcon
                      size="xs"
                      color="green"
                      variant="subtle"
                      onClick={async (e) => {
                        e.stopPropagation();
                        await handleRenameOption(optionName, editedName);
                        setMenuOpened(false);
                      }}
                      style={{ width: '24px', height: '24px' }}
                    >
                      <IconCheck size={14} />
                    </ActionIcon>
                  )}
                  <ActionIcon
                    size="xs"
                    color="red"
                    variant="subtle"
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuOpened(false);
                    }}
                    style={{ width: '24px', height: '24px' }}
                  >
                    <IconX size={14} />
                  </ActionIcon>
                </Group>
              </Group>
              
               {/* Edit name text input */}
               <TextInput
                 size="xs"
                 value={editedName}
                 onChange={(e) => {
                   e.stopPropagation();
                   setEditedName(e.target.value);
                 }}
                 onKeyDown={(e) => {
                   e.stopPropagation();
                   if (e.key === 'Enter' && editedName.trim() && editedName !== optionName) {
                     e.preventDefault();
                     handleRenameOption(optionName, editedName);
                     setMenuOpened(false);
                   } else if (e.key === 'Escape') {
                     setEditedName(optionName);
                     setMenuOpened(false);
                   }
                 }}
                 placeholder="Option name"
                 onClick={(e) => e.stopPropagation()}
                 onFocus={(e) => e.stopPropagation()}
                 onMouseDown={(e) => e.stopPropagation()}
                 autoComplete="off"
               />
            </Box>
            
            <Menu.Divider />
            
            {/* Color picker section */}
            <Menu.Label>Change color</Menu.Label>
            {PILL_COLORS.options.map(({ value, label }) => (
              <Menu.Item
                key={value}
                onClick={async (e) => {
                  e.stopPropagation();
                  await handleChangeColor(optionName, value);
                  // Don't close menu - user can see color change in real-time
                }}
                style={{ paddingTop: '4px', paddingBottom: '4px' }}
              >
                <Badge
                  size="sm"
                  radius="sm"
                  style={getColorStyles(value)}
                  styles={{
                    root: {
                      textTransform: 'none',
                      padding: '4px 8px'
                    }
                  }}
                >
                  {label}
                </Badge>
              </Menu.Item>
            ))}
            
            <Menu.Divider />
            
            {/* Delete */}
            <Menu.Item
              leftSection={<IconTrash size={14} />}
              color="red"
              onClick={(e) => {
                e.stopPropagation();
                modals.openConfirmModal({
                  title: 'Delete option',
                  children: (
                    <Text size="sm">
                      Are you sure you want to delete "{optionName}"? This will remove it from all records in this column.
                    </Text>
                  ),
                  labels: { confirm: 'Delete', cancel: 'Cancel' },
                  confirmProps: { color: 'red' },
                  onConfirm: async () => {
                    await handleDeleteOption(optionName);
                    setMenuOpened(false);
                  },
                  onCancel: () => {
                    // Keep menu open if user cancels
                  }
                });
              }}
            >
              Delete option
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      );
    });
    
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
        <Popover 
          width={400} 
          position="bottom" 
          withArrow 
          shadow="md" 
          opened={opened}
          onChange={(o) => { 
            setOpened(o); 
            if (!o) setSearchQuery(''); // Clear search when closing
          }}
        >
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
                        size="sm"
                        radius="sm"
                        style={getColorStyles(column.option_colors?.[val] || PILL_COLORS.default)}
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
            <Stack gap="md">
              <Group justify="space-between" align="center">
                <Text size="sm" fw={500}>Edit {column.name}</Text>
                <ActionIcon size="sm" variant="subtle" onClick={(e) => { e.stopPropagation(); setOpened(false); }}>
                  <IconX size={16} />
                </ActionIcon>
              </Group>
              
              {/* Selected values at the top */}
              {values.length > 0 && (
                <Box>
                  <Group gap={4} wrap="wrap">
                    {values.map((val: string) => (
                      <OptionBadge
                        key={val}
                        optionName={val}
                        isSelected={true}
                        onClick={() => {
                          // Remove from selected
                          const newValues = values.filter((v: string) => v !== val);
                          handleChange(newValues.join(','));
                        }}
                      />
                    ))}
                  </Group>
                </Box>
              )}
              
              {/* Search input */}
              <TextInput
                placeholder="Search options..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && showCreateOption) {
                    e.preventDefault();
                    handleCreateOption(searchQuery);
                  }
                }}
                size="sm"
                leftSection={<IconSearch size={14} />}
                onClick={(e) => e.stopPropagation()}
              />
              
              {/* Separator */}
              <Box style={{ 
                borderTop: '1px solid var(--mantine-color-gray-3)',
                paddingTop: '8px'
              }}>
                <Text size="xs" c="dimmed" mb="xs">Select options</Text>
                
                {/* Create new option button (shown when search doesn't match) */}
                {showCreateOption && (
                  <Box
                    style={{
                      padding: '6px 8px',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      backgroundColor: 'transparent',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      transition: 'background-color 0.1s ease',
                      marginBottom: '8px',
                      border: '1px dashed var(--mantine-color-gray-4)'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = 'var(--mantine-color-gray-light-hover)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }}
                    onClick={() => handleCreateOption(searchQuery)}
                  >
                    <IconPlus size={14} />
                    <Text size="sm">Create "{searchQuery}"</Text>
                  </Box>
                )}
                
                {/* Available options as a cloud */}
                <Group gap={4} wrap="wrap">
                  {filteredOptions.length > 0 ? (
                    filteredOptions.map((opt) => (
                      <OptionBadge
                        key={opt}
                        optionName={opt}
                        isSelected={false}
                        onClick={() => {
                          // Add to selected
                          const newValues = [...values, opt];
                          handleChange(newValues.join(','));
                          setSearchQuery(''); // Clear search after selection
                        }}
                      />
                    ))
                  ) : !showCreateOption ? (
                    <Text size="sm" c="dimmed">No options found</Text>
                  ) : null}
                </Group>
              </Box>
            </Stack>
          </Popover.Dropdown>
        </Popover>
      </Box>
    );
  }
  
  // Single-select type
  if (column.type === 'single-select' && column.options) {
    const [searchQuery, setSearchQuery] = useState('');
    const [isCreatingOption, setIsCreatingOption] = useState(false);
    
    // Filter options based on search query
    const filteredOptions = (column.options || []).filter(opt => 
      opt.toLowerCase().includes(searchQuery.toLowerCase())
    );
    
    // Check if search query matches an existing option exactly
    const exactMatch = column.options?.some(opt => opt.toLowerCase() === searchQuery.toLowerCase());
    const showCreateOption = searchQuery.trim() && !exactMatch;
    
    // Function to create a new option (for single-select, auto-select it)
    const handleCreateOption = async (newOption: string) => {
      if (!newOption.trim() || isCreatingOption) return;
      
      setIsCreatingOption(true);
      try {
        const updatedOptions = [...(column.options || []), newOption.trim()];
        await customColumnsApi.update(column.id, {
          options: updatedOptions
        });
        
        column.options = updatedOptions;
        handleChange(newOption.trim()); // Auto-select the new option
        setSearchQuery('');
        forceUpdate({});
        
        notifications.show({
          title: 'Option created',
          message: `Added "${newOption.trim()}" to ${column.name}`,
          color: 'green'
        });
      } catch (error) {
        console.error('Error creating option:', error);
        notifications.show({
          title: 'Error',
          message: 'Failed to create new option',
          color: 'red'
        });
      } finally {
        setIsCreatingOption(false);
      }
    };
    
    const handleChangeColor = async (optionName: string, newColor: string) => {
      try {
        const updatedColors = {
          ...(column.option_colors || {}),
          [optionName]: newColor
        };
        
        await customColumnsApi.update(column.id, {
          option_colors: updatedColors
        });
        
        column.option_colors = updatedColors;
        forceUpdate({});
        
        window.dispatchEvent(new CustomEvent('updateColumnMetadata', { 
          detail: { columnId: column.id, option_colors: updatedColors } 
        }));
      } catch (error) {
        console.error('Error changing color:', error);
        notifications.show({
          title: 'Error',
          message: 'Failed to change color',
          color: 'red'
        });
      }
    };
    
    const handleRenameOption = async (oldName: string, newName: string) => {
      if (!newName.trim() || oldName === newName.trim()) return;
      
      try {
        if (column.options?.some(opt => opt.toLowerCase() === newName.trim().toLowerCase() && opt !== oldName)) {
          notifications.show({
            title: 'Error',
            message: 'An option with this name already exists',
            color: 'red'
          });
          return;
        }
        
        const updatedOptions = (column.options || []).map(opt => opt === oldName ? newName.trim() : opt);
        const updatedColors = { ...(column.option_colors || {}) };
        if (updatedColors[oldName]) {
          updatedColors[newName.trim()] = updatedColors[oldName];
          delete updatedColors[oldName];
        }
        
        await customColumnsApi.update(column.id, {
          options: updatedOptions,
          option_colors: updatedColors
        });
        
        const currentRecords = getAllRecords();
        const recordsToUpdate = currentRecords.filter(record => {
          const value = record.custom_values_cache?.[column.id];
          return value === oldName;
        });
        
        column.options = updatedOptions;
        column.option_colors = updatedColors;
        
        notifications.show({
          title: 'Renaming option',
          message: `Updating "${oldName}" to "${newName.trim()}" across ${recordsToUpdate.length} record${recordsToUpdate.length !== 1 ? 's' : ''}...`,
          color: 'blue',
          autoClose: 2000
        });
        
        Promise.all(recordsToUpdate.map(async (record) => {
          await onUpdate(record.id!, column.id, newName.trim());
          return { recordId: record.id!, newValue: newName.trim() };
        })).then((updates) => {
          window.dispatchEvent(new CustomEvent('updateColumnMetadata', { 
            detail: { columnId: column.id, options: updatedOptions, option_colors: updatedColors } 
          }));
          
          window.dispatchEvent(new CustomEvent('updateRecordValues', { 
            detail: { 
              columnId: column.id, 
              updates: updates.map(u => ({ recordId: u.recordId, value: u.newValue }))
            } 
          }));
          
          notifications.show({
            title: 'Option renamed',
            message: `Successfully updated ${recordsToUpdate.length} record${recordsToUpdate.length !== 1 ? 's' : ''}`,
            color: 'green'
          });
        }).catch((error) => {
          console.error('Error updating records:', error);
          notifications.show({
            title: 'Error',
            message: 'Some records may not have been updated',
            color: 'red'
          });
        });
      } catch (error) {
        console.error('Error renaming option:', error);
        notifications.show({
          title: 'Error',
          message: 'Failed to rename option',
          color: 'red'
        });
      }
    };
    
    const handleDeleteOption = async (optionName: string) => {
      try {
        const updatedOptions = (column.options || []).filter(opt => opt !== optionName);
        const updatedColors = { ...(column.option_colors || {}) };
        delete updatedColors[optionName];
        
        await customColumnsApi.update(column.id, {
          options: updatedOptions,
          option_colors: updatedColors
        });
        
        const currentRecords = getAllRecords();
        const recordsToUpdate = currentRecords.filter(record => {
          const value = record.custom_values_cache?.[column.id];
          return value === optionName;
        });
        
        column.options = updatedOptions;
        column.option_colors = updatedColors;
        
        notifications.show({
          title: 'Deleting option',
          message: `Removing "${optionName}" from ${recordsToUpdate.length} record${recordsToUpdate.length !== 1 ? 's' : ''}...`,
          color: 'blue',
          autoClose: 2000
        });
        
        Promise.all(recordsToUpdate.map(async (record) => {
          await onUpdate(record.id!, column.id, ''); // Clear value
          return { recordId: record.id!, newValue: '' };
        })).then((updates) => {
          window.dispatchEvent(new CustomEvent('updateColumnMetadata', { 
            detail: { columnId: column.id, options: updatedOptions, option_colors: updatedColors } 
          }));
          
          window.dispatchEvent(new CustomEvent('updateRecordValues', { 
            detail: { 
              columnId: column.id, 
              updates: updates.map(u => ({ recordId: u.recordId, value: u.newValue }))
            } 
          }));
          
          notifications.show({
            title: 'Option deleted',
            message: `Successfully removed from ${recordsToUpdate.length} record${recordsToUpdate.length !== 1 ? 's' : ''}`,
            color: 'green'
          });
        }).catch((error) => {
          console.error('Error updating records:', error);
          notifications.show({
            title: 'Error',
            message: 'Some records may not have been updated',
            color: 'red'
          });
        });
      } catch (error) {
        console.error('Error deleting option:', error);
        notifications.show({
          title: 'Error',
          message: 'Failed to delete option',
          color: 'red'
        });
      }
    };
    
    const OptionBadge = memo(({ optionName, isSelected, onClick }: { 
      optionName: string; 
      isSelected: boolean; 
      onClick?: () => void;
    }) => {
      const [menuOpened, setMenuOpened] = useState(false);
      const [editedName, setEditedName] = useState('');
      
      return (
        <Menu 
          opened={menuOpened} 
          onChange={setMenuOpened}
          withinPortal={false}
          position="bottom-start"
        >
          <Menu.Target>
            <Badge
              size="sm"
              radius="sm"
              style={{ 
                cursor: 'pointer', 
                opacity: isSelected ? 1 : 0.7,
                ...getColorStyles(column.option_colors?.[optionName] || PILL_COLORS.default)
              }}
              styles={{
                root: {
                  textTransform: 'none',
                  padding: '3px 8px'
                }
              }}
              onMouseEnter={(e) => {
                if (!isSelected) e.currentTarget.style.opacity = '1';
              }}
              onMouseLeave={(e) => {
                if (!isSelected) e.currentTarget.style.opacity = '0.7';
              }}
              onClick={(e) => {
                e.stopPropagation();
                if (!menuOpened && onClick) {
                  onClick();
                }
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setMenuOpened(true);
                setEditedName(optionName);
              }}
            >
              {optionName}
            </Badge>
          </Menu.Target>
          <Menu.Dropdown>
            <Box p="xs" pb={0} onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
              <Group justify="space-between" align="center" mb="xs">
                <Text size="xs" fw={500} c="dimmed">Edit Option</Text>
                <Group gap={4} wrap="nowrap">
                  {editedName.trim() && editedName !== optionName && (
                    <ActionIcon
                      size="xs"
                      color="green"
                      variant="subtle"
                      onClick={async (e) => {
                        e.stopPropagation();
                        await handleRenameOption(optionName, editedName);
                        setMenuOpened(false);
                      }}
                      style={{ width: '24px', height: '24px' }}
                    >
                      <IconCheck size={14} />
                    </ActionIcon>
                  )}
                  <ActionIcon
                    size="xs"
                    color="red"
                    variant="subtle"
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuOpened(false);
                    }}
                    style={{ width: '24px', height: '24px' }}
                  >
                    <IconX size={14} />
                  </ActionIcon>
                </Group>
              </Group>
              
              <TextInput
                size="xs"
                value={editedName}
                onChange={(e) => setEditedName(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === 'Enter' && editedName.trim() && editedName !== optionName) {
                    handleRenameOption(optionName, editedName);
                    setMenuOpened(false);
                  }
                }}
                placeholder="Option name"
                styles={{ input: { fontSize: '12px' } }}
              />
            </Box>
            
            <Menu.Divider />
            
            <Box p="xs" onClick={(e) => e.stopPropagation()}>
              <Text size="xs" c="dimmed" mb="xs">Color</Text>
              {PILL_COLORS.options.map(({ value, label }) => (
                <Menu.Item
                  key={value}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleChangeColor(optionName, value);
                  }}
                  style={{ paddingTop: '4px', paddingBottom: '4px' }}
                >
                  <Badge
                    size="sm"
                    radius="sm"
                    style={getColorStyles(value)}
                    styles={{
                      root: {
                        textTransform: 'none',
                        padding: '3px 8px'
                      }
                    }}
                  >
                    {label}
                  </Badge>
                </Menu.Item>
              ))}
            </Box>
            
            <Menu.Divider />
            
            <Menu.Item
              leftSection={<IconTrash size={14} />}
              color="red"
              onClick={(e) => {
                e.stopPropagation();
                modals.openConfirmModal({
                  title: 'Delete option',
                  children: (
                    <Text size="sm">
                      Are you sure you want to delete "{optionName}"? This will remove it from all records in this column.
                    </Text>
                  ),
                  labels: { confirm: 'Delete', cancel: 'Cancel' },
                  confirmProps: { color: 'red' },
                  onConfirm: async () => {
                    await handleDeleteOption(optionName);
                    setMenuOpened(false);
                  },
                  onCancel: () => {}
                });
              }}
            >
              Delete option
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      );
    });
    
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
        <Popover 
          width={400} 
          position="bottom" 
          withArrow 
          shadow="md" 
          opened={opened}
          onChange={(o) => { 
            setOpened(o); 
            if (!o) setSearchQuery('');
          }}
        >
          <Popover.Target>
            <div style={{ width: '100%' }}>
              {localValue ? (
                <Badge
                  size="sm"
                  radius="sm"
                  style={getColorStyles(column.option_colors?.[localValue] || PILL_COLORS.default)}
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
            <Stack gap="md">
              <Group justify="space-between" align="center">
                <Text size="sm" fw={500}>Edit {column.name}</Text>
                <ActionIcon size="sm" variant="subtle" onClick={(e) => { e.stopPropagation(); setOpened(false); }}>
                  <IconX size={16} />
                </ActionIcon>
              </Group>
              
              {/* Current selection at the top */}
              {localValue && (
                <Box>
                  <OptionBadge
                    optionName={localValue}
                    isSelected={true}
                    onClick={() => handleChange('')}
                  />
                </Box>
              )}
              
              {/* Search input */}
              <TextInput
                placeholder="Search options..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && showCreateOption) {
                    e.preventDefault();
                    handleCreateOption(searchQuery);
                  }
                }}
                size="sm"
                leftSection={<IconSearch size={14} />}
                onClick={(e) => e.stopPropagation()}
              />
              
              {/* Separator */}
              <Box style={{ 
                borderTop: '1px solid var(--mantine-color-gray-3)',
                paddingTop: '8px'
              }}>
                <Text size="xs" c="dimmed" mb="xs">Select option</Text>
                
                {/* Create new option */}
                {showCreateOption && (
                  <Box
                    style={{
                      padding: '6px 8px',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      backgroundColor: 'transparent',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      marginBottom: '4px',
                      transition: 'background-color 0.1s ease'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = 'var(--mantine-color-gray-light-hover)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }}
                    onClick={() => handleCreateOption(searchQuery)}
                  >
                    <IconPlus size={14} />
                    <Text size="sm">Create "{searchQuery.trim()}"</Text>
                  </Box>
                )}
                
                {/* Available options */}
                <Group gap={4} wrap="wrap">
                  {filteredOptions
                    .filter(opt => opt !== localValue)
                    .map((opt) => (
                      <OptionBadge
                        key={opt}
                        optionName={opt}
                        isSelected={false}
                        onClick={() => handleChange(opt)}
                      />
                    ))}
                </Group>
                
                {filteredOptions.filter(opt => opt !== localValue).length === 0 && !showCreateOption && (
                  <Text size="sm" c="dimmed" ta="center" py="md">
                    No options found
                  </Text>
                )}
              </Box>
            </Stack>
          </Popover.Dropdown>
        </Popover>
      </Box>
    );
  }
  
  // Number type
  if (column.type === 'number') {
    const [tempValue, setTempValue] = useState(localValue);
    const hasChanges = tempValue !== localValue;
    
    const handleSave = () => {
      if (hasChanges) {
        handleChange(tempValue);
      }
      setOpened(false);
    };
    
    const handleCancel = () => {
      setTempValue(localValue);
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
        <Popover width={400} position="bottom" withArrow shadow="md" opened={opened} onChange={(o) => { setOpened(o); if (!o) setTempValue(localValue); }}>
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
                <Group gap={4}>
                  {hasChanges && (
                    <ActionIcon
                      size="sm"
                      color="green"
                      variant="subtle"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSave();
                      }}
                    >
                      <IconCheck size={16} />
                    </ActionIcon>
                  )}
                  <ActionIcon 
                    size="sm" 
                    variant="subtle"
                    color="red"
                    onClick={(e) => { 
                      e.stopPropagation(); 
                      handleCancel();
                    }}
                  >
                    <IconX size={16} />
                  </ActionIcon>
                </Group>
              </Group>
              <TextInput
                size="sm"
                type="number"
                value={tempValue}
                onChange={(e) => setTempValue(e.target.value)}
                placeholder={`Enter ${column.name.toLowerCase()}`}
                styles={{
                  input: {
                    minHeight: '36px'
                  },
                  root: {
                    maxWidth: '90vw'
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (hasChanges) {
                      handleSave();
                    } else {
                      setOpened(false);
                    }
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    handleCancel();
                  }
                }}
              />
            </Stack>
          </Popover.Dropdown>
        </Popover>
      </Box>
    );
  }
  
  // Default: Text type
  const [tempValue, setTempValue] = useState(localValue);
  const hasChanges = tempValue !== localValue;
  
  const handleSave = () => {
    if (hasChanges) {
      handleChange(tempValue);
    }
    setOpened(false);
  };
  
  const handleCancel = () => {
    setTempValue(localValue);
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
      <Popover width={400} position="bottom" withArrow shadow="md" opened={opened} onChange={(o) => { setOpened(o); if (!o) setTempValue(localValue); }}>
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
              <Group gap={4}>
                {hasChanges && (
                  <ActionIcon
                    size="sm"
                    color="green"
                    variant="subtle"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSave();
                    }}
                  >
                    <IconCheck size={16} />
                  </ActionIcon>
                )}
                <ActionIcon 
                  size="sm" 
                  variant="subtle"
                  color="red"
                  onClick={(e) => { 
                    e.stopPropagation(); 
                    handleCancel();
                  }}
                >
                  <IconX size={16} />
                </ActionIcon>
              </Group>
            </Group>
            <Textarea
              size="sm"
              value={tempValue}
              onChange={(e) => setTempValue(e.target.value)}
              placeholder={`Enter ${column.name.toLowerCase()}`}
              autosize
              minRows={2}
              maxRows={6}
              styles={{
                root: {
                  maxWidth: '90vw'
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  if (hasChanges) {
                    handleSave();
                  } else {
                    setOpened(false);
                  }
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  handleCancel();
                }
                // Shift+Enter will naturally create a new line (default Textarea behavior)
              }}
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
  
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (hasChanges && !masterError && !currentError) {
        handleSave();
      } else if (!hasChanges) {
        setOpened(false);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleCancel();
    }
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
                    onKeyDown={handleKeyDown}
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
                    onKeyDown={handleKeyDown}
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
  const userRecordsRef = useRef<VinylRecord[]>([]);
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [editingRecord, setEditingRecord] = useState<VinylRecord | null>(null);
  const [editingNotes, setEditingNotes] = useState('');
  const [sortStatus, setSortStatus] = useState<SortingState>([{ id: 'artist', desc: false }]);
  const [addRecordsModalOpened, setAddRecordsModalOpened] = useState(false);
  const [customColumnManagerOpened, setCustomColumnManagerOpened] = useState(false);
  const [customColumns, setCustomColumns] = useState<CustomColumn[]>([]);
  
  // Keep ref in sync with state
  useEffect(() => {
    userRecordsRef.current = userRecords;
  }, [userRecords]);

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

    const handleCustomColumnsRefresh = () => {
      console.log('Custom columns refresh event received');
      loadCustomColumns();
    };

    // Add event listeners
    window.addEventListener('custom-values-updated', handleCustomValuesUpdate);
    window.addEventListener('vinyl-collection-table-refresh', handleTableRefresh);
    window.addEventListener('refreshCustomColumns', handleCustomColumnsRefresh);

    return () => {
      console.log('Removing event listeners');
      window.removeEventListener('custom-values-updated', handleCustomValuesUpdate);
      window.removeEventListener('vinyl-collection-table-refresh', handleTableRefresh);
      window.removeEventListener('refreshCustomColumns', handleCustomColumnsRefresh);
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

  const handleDelete = (record: VinylRecord) => {
    console.log('Delete initiated for record:', record);
    
    if (!record.id) {
      console.error('No record ID found:', record);
      return;
    }

    modals.openConfirmModal({
      title: 'Delete record',
      children: (
        <Stack gap="xs">
          <Text size="sm">
            Are you sure you want to delete this record?
          </Text>
          <Text size="sm" fw={500}>
            {record.artist} - {record.album}
          </Text>
          <Text size="xs" c="dimmed">
            This action cannot be undone.
          </Text>
        </Stack>
      ),
      labels: { confirm: 'Delete', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: async () => {
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
          const response = await records.delete(record.id!);
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
      }
    });
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
                  'csv_import': 'purple'
                };
                
                const displayText = source ? displayMap[source] || source : '-';
                const color = source ? colorMap[source] : 'gray';
                
                return (
                  <Box style={{ position: 'relative' }}>
                    <Text size="sm" lineClamp={1} style={{ cursor: 'default', maxWidth: '90vw' }}>
                      {source ? (
                        <Badge
                          size="sm"
                          radius="sm"
                          style={getColorStyles(color)}
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
            allRecords={userRecords}
            getAllRecords={() => userRecordsRef.current}
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
