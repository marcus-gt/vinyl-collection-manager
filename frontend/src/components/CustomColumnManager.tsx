import { useState, useEffect } from 'react';
import { Modal, Button, TextInput, Select, Stack, Group, Table, ActionIcon, Text, Box, MultiSelect, Switch, Menu, Badge } from '@mantine/core';
import { IconTrash, IconEdit, IconX } from '@tabler/icons-react';
import { customColumns, customValues, records } from '../services/api';
import type { CustomColumn, CustomColumnType } from '../types';
import { PILL_COLORS } from '../types';
import { notifications } from '@mantine/notifications';

interface CustomColumnManagerProps {
  opened: boolean;
  onClose: () => void;
}

export function CustomColumnManager({ opened, onClose }: CustomColumnManagerProps) {
  const [columns, setColumns] = useState<CustomColumn[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingColumn, setEditingColumn] = useState<Partial<CustomColumn> | null>(null);
  const [name, setName] = useState('');
  const [type, setType] = useState<CustomColumnType>('text');
  const [options, setOptions] = useState<string[]>([]);
  const [optionColors, setOptionColors] = useState<Record<string, string>>({});
  const [defaultValue, setDefaultValue] = useState('');
  const [applyToAll, setApplyToAll] = useState(false);
  const [currentOption, setCurrentOption] = useState('');

  useEffect(() => {
    if (opened) {
      loadColumns();
    }
  }, [opened]);

  const loadColumns = async () => {
    setLoading(true);
    try {
      const response = await customColumns.getAll();
      if (response.success && response.data) {
        setColumns(response.data);
      }
    } catch (err) {
      console.error('Failed to load custom columns:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      alert('Column name is required');
      return;
    }

    if ((type === 'single-select' || type === 'multi-select') && options.length === 0) {
      alert('Select type requires at least one option');
      return;
    }

    setLoading(true);
    try {
      const columnData = {
        name,
        type,
        options: (type === 'single-select' || type === 'multi-select') ? options : undefined,
        option_colors: optionColors,
        defaultValue: defaultValue || undefined,
        applyToAll
      };

      console.log('Submitting column data:', columnData);

      if (editingColumn?.id) {
        // Update existing column
        const response = await customColumns.update(editingColumn.id, columnData);
        if (response.success) {
          notifications.show({
            title: 'Success',
            message: 'Column updated successfully',
            color: 'green'
          });
        }
      } else {
        // Create new column
        const response = await customColumns.create(columnData);
        if (response.success) {
          notifications.show({
            title: 'Success',
            message: 'Column created successfully',
            color: 'green'
          });
        }
      }
      await loadColumns();
      // Trigger table refresh
      window.dispatchEvent(new CustomEvent('refresh-table-data'));
      resetForm();
    } catch (err) {
      notifications.show({
        title: 'Error',
        message: 'Failed to save column',
        color: 'red'
      });
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (column: CustomColumn) => {
    if (!window.confirm(`Are you sure you want to delete the "${column.name}" column?`)) {
      return;
    }

    setLoading(true);
    try {
      const response = await customColumns.delete(column.id);
      if (response.success) {
        alert('Column deleted successfully');
        await loadColumns();
      }
    } catch (err) {
      alert('Failed to delete column');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (column: CustomColumn) => {
    setEditingColumn(column);
    setName(column.name);
    setType(column.type);
    setOptions(column.options || []);
    setOptionColors(column.option_colors || {});
    setDefaultValue(column.defaultValue || '');
    setApplyToAll(column.applyToAll || false);
  };

  const resetForm = () => {
    setEditingColumn(null);
    setName('');
    setType('text');
    setOptions([]);
    setOptionColors({});
    setDefaultValue('');
    setApplyToAll(false);
    setCurrentOption('');
  };

  const handleAddOption = () => {
    if (currentOption && !options.includes(currentOption)) {
      setOptions([...options, currentOption]);
      setOptionColors(prev => ({
        ...prev,
        [currentOption]: PILL_COLORS.default
      }));
      setCurrentOption('');
    }
  };

  const handleColorChange = async (option: string, color: string) => {
    if (editingColumn?.id) {
      try {
        // Update local state first for immediate feedback
        const newOptionColors = { ...optionColors, [option]: color };
        setOptionColors(newOptionColors);

        // Update in the backend
        const response = await customColumns.update(editingColumn.id, {
          ...editingColumn,
          option_colors: newOptionColors
        });
        
        if (response.success) {
          console.log('Color updated successfully');
          // Reload columns and trigger table refresh
          await loadColumns();
          // Ensure the table refresh happens after the columns are loaded
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent('refresh-table-data'));
          }, 100);
        } else {
          console.error('Update failed:', response.error);
          // If the update failed, revert the local state
          setOptionColors(optionColors);
          notifications.show({
            title: 'Error',
            message: 'Failed to update color: ' + (response.error || 'Unknown error'),
            color: 'red'
          });
        }
      } catch (err) {
        console.error('Error during color update:', err);
        // If there was an error, revert the local state
        setOptionColors(optionColors);
        notifications.show({
          title: 'Error',
          message: 'Failed to update color: ' + (err instanceof Error ? err.message : 'Unknown error'),
          color: 'red'
        });
      }
    } else {
      console.log('No column being edited, skipping backend update');
    }
  };

  const handleRemoveOption = async (optionToRemove: string) => {
    if (!editingColumn?.id) return;

    try {
      // Get all records to find ones that use this option
      const recordsResponse = await records.getAll();
      console.log('Records response:', recordsResponse);
      
      if (recordsResponse.success && recordsResponse.data) {
        // Filter records that have this value
        const recordsToUpdate = recordsResponse.data.filter(record => {
          const value = record.customValues?.[editingColumn.id!];
          if (!value) return false;

          if (type === 'single-select') {
            return value === optionToRemove;
          } else if (type === 'multi-select') {
            const values = value.split(',').filter(Boolean);
            return values.includes(optionToRemove);
          }
          return false;
        });

        console.log('Records to update:', recordsToUpdate);

        // Remove the option and its color
        const newOptionColors = { ...optionColors };
        delete newOptionColors[optionToRemove];

        // First update the column definition to remove the option
        const updateColumnResponse = await customColumns.update(editingColumn.id, {
          name: editingColumn.name || '',
          type: editingColumn.type || 'text',
          options: options.filter(opt => opt !== optionToRemove),
          option_colors: newOptionColors,
          defaultValue: defaultValue === optionToRemove ? undefined : 
            type === 'multi-select' ? defaultValue.split(',').filter(v => v !== optionToRemove).join(',') : 
            defaultValue
        });

        if (!updateColumnResponse.success) {
          throw new Error('Failed to update column options');
        }

        // Update local state
        setOptions(options.filter(opt => opt !== optionToRemove));
        setOptionColors(newOptionColors);

        // Then update all records that use this option
        const updates = recordsToUpdate.map(record => {
          if (type === 'multi-select' && record.customValues) {
            // Remove the option from the comma-separated list while preserving other options
            const values = record.customValues[editingColumn.id!].split(',').filter(Boolean);
            const newValues = values.filter(v => v !== optionToRemove);
            console.log(`Updating record ${record.id} from values [${values.join(',')}] to [${newValues.join(',')}]`);
            return customValues.update(record.id!, {
              [editingColumn.id!]: newValues.join(',')
            });
          } else {
            // For single-select, just clear the value
            console.log(`Clearing value for record ${record.id}`);
            return customValues.update(record.id!, {
              [editingColumn.id!]: ''
            });
          }
        });

        // Wait for all updates to complete
        const updateResults = await Promise.all(updates);
        console.log('Update results:', updateResults);

        // Refresh the data
        await loadColumns();
        window.dispatchEvent(new CustomEvent('refresh-table-data'));

        notifications.show({
          title: 'Success',
          message: 'Option removed and values updated',
          color: 'green'
        });
      }
    } catch (err) {
      console.error('Failed to remove option:', err);
      notifications.show({
        title: 'Error',
        message: 'Failed to remove option',
        color: 'red'
      });
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Manage Custom Columns"
      size="lg"
      styles={{
        inner: {
          '@media (max-width: 48em)': {
            padding: 0
          }
        },
        body: {
          '@media (max-width: 48em)': {
            padding: '0.5rem'
          }
        },
        content: {
          '@media (max-width: 48em)': {
            width: '100vw',
            height: '100vh',
            margin: 0,
            maxWidth: 'none',
            maxHeight: 'none'
          }
        }
      }}
    >
      <Stack>
        <Box mb="md">
          <Text size="sm" fw={500} mb="xs">Add New Column</Text>
          <Stack gap="xs">
            <TextInput
              label="Column Name"
              placeholder="e.g., Rating, Comments, Location"
              value={name}
              onChange={(e) => setName(e.target.value)}
              size="sm"
              styles={{
                input: {
                  minHeight: '36px'
                }
              }}
            />
            <Select
              label="Column Type"
              value={type}
              onChange={(value) => {
                setType(value as CustomColumnType);
                setOptions([]);
                setOptionColors({});
                setDefaultValue('');
              }}
              data={[
                { value: 'text', label: 'Text' },
                { value: 'number', label: 'Number' },
                { value: 'single-select', label: 'Single Select' },
                { value: 'multi-select', label: 'Multi Select' },
                { value: 'boolean', label: 'Checkbox' }
              ]}
              size="sm"
              styles={{
                input: {
                  minHeight: '36px'
                }
              }}
            />
            {(type === 'single-select' || type === 'multi-select') && (
              <>
                <TextInput
                  label="Add Option"
                  placeholder="Type and press Enter to add option"
                  value={currentOption}
                  onChange={(e) => setCurrentOption(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddOption();
                    }
                  }}
                  size="sm"
                  styles={{
                    input: {
                      minHeight: '36px'
                    }
                  }}
                  rightSection={
                    <Button 
                      size="xs" 
                      variant="light"
                      onClick={handleAddOption}
                      disabled={!currentOption || options.includes(currentOption)}
                    >
                      Add
                    </Button>
                  }
                />
                <Box>
                  <Text size="sm" mb="xs">Options:</Text>
                  <Text size="xs" c="dimmed" mb="sm">Click an option to change color</Text>
                  <Box
                    style={{
                      maxHeight: '200px',
                      overflowY: 'auto',
                      padding: '8px'
                    }}
                  >
                    {options.length === 0 ? (
                      <Text size="sm" c="dimmed" ta="center">No options added yet</Text>
                    ) : (
                      <Group gap={2}>
                        {options.map((opt) => (
                          <Group key={opt} gap={0} wrap="nowrap">
                            <Menu shadow="md" width={150} position="bottom-start" closeOnItemClick>
                              <Menu.Target>
                                <Badge
                                  variant="filled"
                                  size="sm"
                                  radius="sm"
                                  color={optionColors[opt] || PILL_COLORS.default}
                                  styles={{
                                    root: {
                                      textTransform: 'none',
                                      cursor: 'pointer',
                                      padding: '3px 8px',
                                      paddingRight: 25 // Make room for the X button
                                    }
                                  }}
                                >
                                  {opt}
                                </Badge>
                              </Menu.Target>
                              <Menu.Dropdown>
                                <Group gap={4} p="xs" wrap="wrap">
                                  {PILL_COLORS.options.map(({ value, label }) => (
                                    <Badge
                                      key={value}
                                      variant="filled"
                                      size="sm"
                                      radius="sm"
                                      color={value}
                                      styles={{
                                        root: {
                                          textTransform: 'none',
                                          cursor: 'pointer',
                                          padding: '3px 8px',
                                          opacity: optionColors[opt] === value ? 1 : 0.5
                                        }
                                      }}
                                      onClick={() => {
                                        if (!editingColumn) {
                                          handleSubmit();  // Save current state
                                        }
                                        handleColorChange(opt, value);
                                      }}
                                    >
                                      {label}
                                    </Badge>
                                  ))}
                                </Group>
                              </Menu.Dropdown>
                            </Menu>
                            <ActionIcon 
                              size="xs" 
                              variant="subtle"
                              onClick={() => handleRemoveOption(opt)}
                              style={{
                                position: 'relative',
                                right: 25,
                                zIndex: 2
                              }}
                            >
                              <IconX size={12} />
                            </ActionIcon>
                          </Group>
                        ))}
                      </Group>
                    )}
                  </Box>
                </Box>
              </>
            )}
            {/* Default value fields based on type */}
            {type === 'text' && (
              <TextInput
                label="Default Value"
                placeholder="Optional default value for new records"
                value={defaultValue}
                onChange={(e) => setDefaultValue(e.target.value)}
                size="sm"
                styles={{
                  input: {
                    minHeight: '36px'
                  }
                }}
              />
            )}
            {type === 'number' && (
              <TextInput
                label="Default Value"
                placeholder="Optional default value for new records"
                value={defaultValue}
                onChange={(e) => setDefaultValue(e.target.value)}
                type="number"
                size="sm"
                styles={{
                  input: {
                    minHeight: '36px'
                  }
                }}
              />
            )}
            {type === 'single-select' && options.length > 0 && (
              <Select
                label="Default Value"
                placeholder="Optional default value for new records"
                value={defaultValue}
                onChange={(value) => setDefaultValue(value || '')}
                data={options.map(opt => ({ value: opt, label: opt }))}
                clearable
                size="sm"
                styles={{
                  input: {
                    minHeight: '36px'
                  }
                }}
              />
            )}
            {type === 'multi-select' && options.length > 0 && (
              <MultiSelect
                label="Default Values"
                placeholder="Optional default values for new records"
                value={defaultValue ? defaultValue.split(',') : []}
                onChange={(values) => setDefaultValue(values.join(','))}
                data={options.map(opt => ({ value: opt, label: opt }))}
                clearable
                size="sm"
                styles={{
                  input: {
                    minHeight: '36px'
                  }
                }}
              />
            )}
            {/* Apply to all switch */}
            {defaultValue && (
              <Switch
                label="Apply default value to all existing records"
                checked={applyToAll}
                onChange={(e) => setApplyToAll(e.currentTarget.checked)}
                size="sm"
              />
            )}
            <Group justify="flex-end">
              {editingColumn && (
                <Button variant="light" onClick={resetForm} size="sm">
                  Cancel
                </Button>
              )}
              <Button onClick={handleSubmit} loading={loading} size="sm">
                {editingColumn ? 'Update Column' : 'Add Column'}
              </Button>
            </Group>
          </Stack>
        </Box>

        <Box>
          <Text size="sm" fw={500} mb="xs">Existing Columns</Text>
          <Table
            styles={{
              table: {
                overflowX: 'auto'
              },
              td: {
                height: '40px',
                maxHeight: '40px',
                padding: '8px',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }
            }}
          >
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Name</Table.Th>
                <Table.Th>Type</Table.Th>
                <Table.Th style={{ width: 100 }}>Actions</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {columns.map((column) => (
                <Table.Tr key={column.id}>
                  <Table.Td>{column.name}</Table.Td>
                  <Table.Td style={{ textTransform: 'capitalize' }}>{column.type}</Table.Td>
                  <Table.Td>
                    <Group gap="xs">
                      <ActionIcon
                        size="sm"
                        variant="light"
                        onClick={() => handleEdit(column)}
                      >
                        <IconEdit size={16} />
                      </ActionIcon>
                      <ActionIcon
                        size="sm"
                        variant="light"
                        color="red"
                        onClick={() => handleDelete(column)}
                      >
                        <IconTrash size={16} />
                      </ActionIcon>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
              {columns.length === 0 && (
                <Table.Tr>
                  <Table.Td colSpan={3} style={{ textAlign: 'center' }}>
                    <Text c="dimmed" size="sm">No custom columns yet</Text>
                  </Table.Td>
                </Table.Tr>
              )}
            </Table.Tbody>
          </Table>
        </Box>
      </Stack>
    </Modal>
  );
} 

