import { memo, useEffect, useState } from 'react';
import { ActionIcon, Badge, Box, Checkbox, Group, Menu, Popover, Stack, Text, Textarea, TextInput } from '@mantine/core';
import { IconCheck, IconPlus, IconSearch, IconTrash, IconX } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { modals } from '@mantine/modals';
import { useDebouncedCallback } from 'use-debounce';
import { customColumns as customColumnsApi } from '../../services/api';
import type { CustomColumn, VinylRecord } from '../../types';
import { PILL_COLORS } from '../../constants/colors';
import { getColorStyles } from './helpers';

export interface EditableCustomCellProps {
  value: string;
  recordId: string;
  column: CustomColumn;
  allRecords: VinylRecord[];
  getAllRecords: () => VinylRecord[];
  onUpdate: (recordId: string, columnId: string, newValue: string) => void;
  noTruncate?: boolean; // If true, shows full content without truncation
}

export function EditableCustomCell({ 
  value, 
  recordId, 
  column,
  getAllRecords,
  onUpdate,
  noTruncate = false
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
              radius="md"
              style={{ 
                cursor: 'pointer',
                opacity: isSelected ? 1 : 0.7,
                transition: 'opacity 0.1s ease',
                ...getColorStyles(column.option_colors?.[optionName] || PILL_COLORS.default)
              }}
              styles={{
                root: {
                  textTransform: 'none',
                  padding: '2px 5px',
                  fontSize: '10.5px'
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
                  radius="md"
                  style={getColorStyles(value)}
                  styles={{
                    root: {
                      textTransform: 'none',
                      padding: '2px 5px',
                      fontSize: '10.5px'
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
          width="min(400px, 90vw)" 
          position="bottom" 
          withArrow 
          shadow="md" 
          opened={opened}
          onChange={(o) => { 
            setOpened(o); 
            if (!o) setSearchQuery(''); // Clear search when closing
          }}
          withinPortal
        >
          <Popover.Target>
            <div style={{ width: '100%' }}>
              {values.length === 0 ? (
                <Text size="sm" c="dimmed">-</Text>
              ) : (
                <Box style={{ 
                  position: 'relative',
                  ...(noTruncate ? {} : { height: '48px', overflow: 'hidden' })
                }}>
                  <Group gap={4} wrap={noTruncate ? "wrap" : "nowrap"} style={{ 
                    ...(noTruncate ? {} : { height: '100%' }),
                    alignItems: 'center',
                    padding: '4px'
                  }}>
                    {values.map((val: string) => (
                      <Badge
                        key={val}
                        size="sm"
                        radius="md"
                        style={getColorStyles(column.option_colors?.[val] || PILL_COLORS.default)}
                        styles={{
                          root: {
                            textTransform: 'none',
                            cursor: 'default',
                            padding: '2px 5px',
                            whiteSpace: 'nowrap',
                            display: 'inline-flex',
                            flexShrink: 0,
                            fontSize: '10.5px'
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
              radius="md"
              style={{ 
                cursor: 'pointer', 
                opacity: isSelected ? 1 : 0.7,
                ...getColorStyles(column.option_colors?.[optionName] || PILL_COLORS.default)
              }}
              styles={{
                root: {
                  textTransform: 'none',
                  padding: '2px 5px',
                  fontSize: '10.5px'
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
                    radius="md"
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
          width="min(400px, 90vw)" 
          position="bottom" 
          withArrow 
          shadow="md" 
          opened={opened}
          onChange={(o) => { 
            setOpened(o); 
            if (!o) setSearchQuery('');
          }}
          withinPortal
        >
          <Popover.Target>
            <div style={{ width: '100%' }}>
              {localValue ? (
                <Badge
                  size="sm"
                  radius="md"
                  style={getColorStyles(column.option_colors?.[localValue] || PILL_COLORS.default)}
                  styles={{
                    root: {
                      textTransform: 'none',
                      cursor: 'default',
                      padding: '2px 5px',
                      fontSize: '10.5px'
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
        <Popover width="min(400px, 90vw)" position="bottom" withArrow shadow="md" opened={opened} onChange={(o) => { setOpened(o); if (!o) setTempValue(localValue); }} withinPortal>
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
      <Popover width="min(400px, 90vw)" position="bottom" withArrow shadow="md" opened={opened} onChange={(o) => { setOpened(o); if (!o) setTempValue(localValue); }} withinPortal>
        <Popover.Target>
          <div style={{ width: '100%' }}>
            <Text 
              size="sm" 
              {...(noTruncate ? {} : { lineClamp: 1 })}
              style={{ 
                ...(noTruncate ? { wordBreak: 'break-word', whiteSpace: 'pre-wrap' } : { maxWidth: '90vw' })
              }}
            >
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
