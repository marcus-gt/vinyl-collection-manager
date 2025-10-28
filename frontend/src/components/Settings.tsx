import { Modal, Accordion, Table, Group, ActionIcon, Text, Box } from '@mantine/core';
import { IconEdit, IconTrash, IconGripVertical, IconEye, IconEyeOff } from '@tabler/icons-react';
import { modals } from '@mantine/modals';
import type { CustomColumn } from '../types';
import { useState } from 'react';

interface ColumnOrderItem {
  id: string;
  name: string;
  type: 'standard' | 'custom';
  customColumn?: CustomColumn;
}

interface SettingsProps {
  opened: boolean;
  onClose: () => void;
  customColumns: CustomColumn[];
  onEditColumn: (column: CustomColumn) => void;
  onDeleteColumn: (columnId: string) => void;
  columnOrder: string[];
  onColumnOrderChange: (newOrder: string[]) => void;
  columnVisibility: Record<string, boolean>;
  onColumnVisibilityChange: (columnId: string, visible: boolean) => void;
}

export function Settings({ 
  opened, 
  onClose, 
  customColumns,
  onEditColumn,
  onDeleteColumn,
  columnOrder,
  onColumnOrderChange,
  columnVisibility,
  onColumnVisibilityChange
}: SettingsProps) {
  
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // Standard columns definition (matching Collection.tsx)
  const standardColumns = [
    { id: 'artist', name: 'Artist' },
    { id: 'album', name: 'Album' },
    { id: 'year', name: 'Year' },
    { id: 'label', name: 'Label' },
    { id: 'country', name: 'Country' },
    { id: 'genres', name: 'Genres' },
    { id: 'styles', name: 'Styles' },
    { id: 'musicians', name: 'Musicians' },
    { id: 'added_from', name: 'Source' },
    { id: 'created_at', name: 'Added' },
    { id: 'current_release_year', name: 'Release Year' },
    { id: 'current_release_format', name: 'Format' },
    { id: 'master_format', name: 'Master Format' },
    { id: 'discogs_links', name: 'Discogs Links' }
  ];

  // Build ordered column list
  const allColumns: ColumnOrderItem[] = columnOrder
    .map(id => {
      const standardCol = standardColumns.find(c => c.id === id);
      if (standardCol) {
        return { id: standardCol.id, name: standardCol.name, type: 'standard' as const } as ColumnOrderItem;
      }
      const customCol = customColumns.find(c => c.id === id);
      if (customCol) {
        return { id: customCol.id, name: customCol.name, type: 'custom' as const, customColumn: customCol } as ColumnOrderItem;
      }
      return null;
    })
    .filter((col): col is ColumnOrderItem => col !== null);

  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    setDragOverIndex(index);
  };

  const handleDrop = (index: number) => {
    if (draggedIndex === null || draggedIndex === index) {
      setDraggedIndex(null);
      setDragOverIndex(null);
      return;
    }

    const newOrder = [...allColumns];
    const draggedItem = newOrder[draggedIndex];
    newOrder.splice(draggedIndex, 1);
    newOrder.splice(index, 0, draggedItem);

    onColumnOrderChange(newOrder.map(col => col.id));
    setDraggedIndex(null);
    setDragOverIndex(null);
  };
  
  const handleDelete = (column: CustomColumn) => {
    modals.openConfirmModal({
      title: 'Delete Column',
      children: (
        <Text size="sm">
          Are you sure you want to delete the column "{column.name}"? This will remove all data in this column from all records. This action cannot be undone.
        </Text>
      ),
      labels: { confirm: 'Delete', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: () => {
        onDeleteColumn(column.id);
      }
    });
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Settings"
      size="lg"
      styles={{
        body: { maxHeight: '70vh', overflowY: 'auto' },
        content: { maxHeight: '80vh' }
      }}
    >
      <Accordion defaultValue="manage-columns">
        <Accordion.Item value="manage-columns">
          <Accordion.Control>Manage Custom Columns</Accordion.Control>
          <Accordion.Panel>
            {customColumns.length === 0 ? (
              <Text size="sm" c="dimmed" ta="center" py="md">
                No custom columns yet
              </Text>
            ) : (
              <Table>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Name</Table.Th>
                    <Table.Th>Type</Table.Th>
                    <Table.Th style={{ width: 100 }}>Actions</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {customColumns.map((column) => (
                    <Table.Tr key={column.id}>
                      <Table.Td>{column.name}</Table.Td>
                      <Table.Td style={{ textTransform: 'capitalize' }}>{column.type}</Table.Td>
                      <Table.Td>
                        <Group gap="xs">
                          <ActionIcon
                            size="sm"
                            variant="light"
                            onClick={() => onEditColumn(column)}
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
                </Table.Tbody>
              </Table>
            )}
          </Accordion.Panel>
        </Accordion.Item>

        <Accordion.Item value="column-order">
          <Accordion.Control>Column Order and Visibility</Accordion.Control>
          <Accordion.Panel>
            {allColumns.length === 0 ? (
              <Text size="sm" c="dimmed" ta="center" py="md">
                No columns to display
              </Text>
            ) : (
              <Table>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th style={{ width: 40 }}></Table.Th>
                    <Table.Th>Column Name</Table.Th>
                    <Table.Th>Type</Table.Th>
                    <Table.Th style={{ width: 80 }}>Visible</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {allColumns.map((column, index) => (
                  <Table.Tr
                    key={column.id}
                    draggable
                    onDragStart={() => handleDragStart(index)}
                    onDragOver={(e) => handleDragOver(e, index)}
                    onDrop={() => handleDrop(index)}
                    onDragEnd={() => {
                      setDraggedIndex(null);
                      setDragOverIndex(null);
                    }}
                    style={{
                      cursor: 'move',
                      opacity: draggedIndex === index ? 0.5 : 1,
                      backgroundColor: dragOverIndex === index && draggedIndex !== index
                        ? 'var(--mantine-color-dark-5)'
                        : undefined,
                      transition: 'background-color 0.2s, opacity 0.2s'
                    }}
                  >
                    <Table.Td>
                      <Box style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <IconGripVertical size={16} style={{ color: 'var(--mantine-color-dark-3)' }} />
                      </Box>
                    </Table.Td>
                    <Table.Td>{column.name}</Table.Td>
                    <Table.Td style={{ textTransform: 'capitalize' }}>
                      {column.type === 'custom' && column.customColumn 
                        ? column.customColumn.type 
                        : column.type}
                    </Table.Td>
                    <Table.Td>
                      <ActionIcon
                        variant="subtle"
                        color={columnVisibility[column.id] !== false ? 'blue' : 'gray'}
                        onClick={(e) => {
                          e.stopPropagation();
                          onColumnVisibilityChange(column.id, columnVisibility[column.id] === false);
                        }}
                      >
                        {columnVisibility[column.id] !== false ? (
                          <IconEye size={18} />
                        ) : (
                          <IconEyeOff size={18} />
                        )}
                      </ActionIcon>
                    </Table.Td>
                  </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            )}
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>
    </Modal>
  );
}

