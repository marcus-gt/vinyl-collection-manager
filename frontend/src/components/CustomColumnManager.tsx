import { useState, useEffect } from 'react';
import { Modal, Button, TextInput, Select, Stack, Group, Table, ActionIcon, Text, Box, MultiSelect, Chip, Switch } from '@mantine/core';
import { IconTrash, IconEdit, IconX } from '@tabler/icons-react';
import { customColumns } from '../services/api';
import type { CustomColumn, CustomColumnType } from '../types';
import { notifications } from '@mantine/notifications';

interface CustomColumnManagerProps {
  opened: boolean;
  onClose: () => void;
}

interface CustomColumnValue {
  record_id: string;
  value: string;
}

export function CustomColumnManager({ opened, onClose }: CustomColumnManagerProps) {
  const [columns, setColumns] = useState<CustomColumn[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingColumn, setEditingColumn] = useState<Partial<CustomColumn> | null>(null);
  const [name, setName] = useState('');
  const [type, setType] = useState<CustomColumnType>('text');
  const [options, setOptions] = useState<string[]>([]);
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
        defaultValue: defaultValue || undefined,
        applyToAll
      };

      if (editingColumn?.id) {
        // Update existing column
        const response = await customColumns.update(editingColumn.id, columnData);
        if (response.success) {
          alert('Column updated successfully');
        }
      } else {
        // Create new column
        const response = await customColumns.create(columnData);
        if (response.success) {
          alert('Column created successfully');
        }
      }
      await loadColumns();
      resetForm();
    } catch (err) {
      alert('Failed to save column');
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
    setDefaultValue(column.defaultValue || '');
    setApplyToAll(column.applyToAll || false);
  };

  const resetForm = () => {
    setEditingColumn(null);
    setName('');
    setType('text');
    setOptions([]);
    setDefaultValue('');
    setApplyToAll(false);
    setCurrentOption('');
  };

  const handleAddOption = () => {
    if (currentOption && !options.includes(currentOption)) {
      setOptions([...options, currentOption]);
      setCurrentOption('');
    }
  };

  const handleRemoveOption = async (optionToRemove: string) => {
    if (!editingColumn?.id) return;

    // First, get all records that have this column value
    try {
      const response = await customColumns.getAllValues(editingColumn.id);
      if (response.success && response.data) {
        // For each record that has this value
        const updates = response.data
          .filter((value: CustomColumnValue) => {
            if (type === 'single-select') {
              return value.value === optionToRemove;
            } else if (type === 'multi-select') {
              const values = value.value.split(',');
              return values.includes(optionToRemove);
            }
            return false;
          })
          .map((value: CustomColumnValue) => {
            let newValue = '';
            if (type === 'multi-select') {
              // Remove the option from the comma-separated list
              const values = value.value.split(',');
              newValue = values.filter((v: string) => v !== optionToRemove).join(',');
            }
            // For single-select, we just set it to empty string
            return customColumns.updateValue(value.record_id, editingColumn.id, newValue);
          });

        // Wait for all updates to complete
        await Promise.all(updates);
      }

      // Now remove the option from the column options
      const updatedOptions = options.filter(opt => opt !== optionToRemove);
      setOptions(updatedOptions);
      
      // If this was the default value, clear it
      if (defaultValue === optionToRemove) {
        setDefaultValue('');
      }

      // Update the column definition
      const response = await customColumns.update(editingColumn.id, {
        name: editingColumn.name,
        type: editingColumn.type,
        options: updatedOptions,
        defaultValue: defaultValue === optionToRemove ? '' : defaultValue || undefined
      });
      
      if (response.success) {
        notifications.show({
          title: 'Success',
          message: 'Option removed and values updated',
          color: 'green'
        });
        await loadColumns(); // Refresh the columns list
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
      fullScreen
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
                setDefaultValue('');
              }}
              data={[
                { value: 'text', label: 'Text' },
                { value: 'number', label: 'Number' },
                { value: 'single-select', label: 'Single Select' },
                { value: 'multi-select', label: 'Multi Select' }
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
                  <Box
                    style={{
                      maxHeight: '100px',
                      overflowY: 'auto',
                      border: '1px solid #eee',
                      borderRadius: '4px',
                      padding: '8px'
                    }}
                  >
                    <Group gap="xs">
                      {options.map((opt) => (
                        <Chip
                          key={opt}
                          checked={false}
                          variant="filled"
                          size="sm"
                        >
                          <Group gap={4} wrap="nowrap">
                            {opt}
                            <ActionIcon 
                              size="xs" 
                              variant="transparent" 
                              onClick={() => handleRemoveOption(opt)}
                            >
                              <IconX size={12} />
                            </ActionIcon>
                          </Group>
                        </Chip>
                      ))}
                    </Group>
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

