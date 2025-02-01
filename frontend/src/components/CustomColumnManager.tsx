import { useState, useEffect } from 'react';
import { Modal, Button, TextInput, Select, Stack, Group, Table, ActionIcon, Text, Box, MultiSelect } from '@mantine/core';
import { IconTrash, IconEdit } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { customColumns } from '../services/api';
import type { CustomColumn, CustomColumnType } from '../types';

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

    if (type === 'select' && options.length === 0) {
      alert('Select type requires at least one option');
      return;
    }

    setLoading(true);
    try {
      if (editingColumn?.id) {
        // Update existing column
        const response = await customColumns.update(editingColumn.id, {
          name,
          type,
          options: type === 'select' ? options : undefined
        });
        if (response.success) {
          alert('Column updated successfully');
        }
      } else {
        // Create new column
        const response = await customColumns.create({
          name,
          type,
          options: type === 'select' ? options : undefined
        });
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
  };

  const resetForm = () => {
    setEditingColumn(null);
    setName('');
    setType('text');
    setOptions([]);
  };

  const handleAddOption = (value: string) => {
    if (value && !options.includes(value)) {
      setOptions([...options, value]);
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Manage Custom Columns"
      size="lg"
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
            />
            <Select
              label="Column Type"
              value={type}
              onChange={(value) => setType(value as CustomColumnType)}
              data={[
                { value: 'text', label: 'Text' },
                { value: 'number', label: 'Number' },
                { value: 'select', label: 'Select' }
              ]}
            />
            {type === 'select' && (
              <>
                <TextInput
                  label="Add Option"
                  placeholder="Type and press Enter to add option"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddOption(e.currentTarget.value);
                      e.currentTarget.value = '';
                    }
                  }}
                />
                <MultiSelect
                  label="Selected Options"
                  placeholder="Select options"
                  value={options}
                  onChange={setOptions}
                  data={options.map(opt => ({ value: opt, label: opt }))}
                  searchable
                  clearable
                />
              </>
            )}
            <Group justify="flex-end">
              {editingColumn && (
                <Button variant="light" onClick={resetForm}>
                  Cancel
                </Button>
              )}
              <Button onClick={handleSubmit} loading={loading}>
                {editingColumn ? 'Update Column' : 'Add Column'}
              </Button>
            </Group>
          </Stack>
        </Box>

        <Box>
          <Text size="sm" fw={500} mb="xs">Existing Columns</Text>
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Name</Table.Th>
                <Table.Th>Type</Table.Th>
                <Table.Th>Options</Table.Th>
                <Table.Th style={{ width: 100 }}>Actions</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {columns.map((column) => (
                <Table.Tr key={column.id}>
                  <Table.Td>{column.name}</Table.Td>
                  <Table.Td style={{ textTransform: 'capitalize' }}>{column.type}</Table.Td>
                  <Table.Td>
                    {column.type === 'select' && column.options?.join(', ')}
                  </Table.Td>
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
                  <Table.Td colSpan={4} style={{ textAlign: 'center' }}>
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

