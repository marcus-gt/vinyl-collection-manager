import { Modal, Accordion, Table, Group, ActionIcon, Text } from '@mantine/core';
import { IconEdit, IconTrash } from '@tabler/icons-react';
import { modals } from '@mantine/modals';
import type { CustomColumn } from '../types';

interface SettingsProps {
  opened: boolean;
  onClose: () => void;
  customColumns: CustomColumn[];
  onEditColumn: (column: CustomColumn) => void;
  onDeleteColumn: (columnId: string) => void;
}

export function Settings({ 
  opened, 
  onClose, 
  customColumns,
  onEditColumn,
  onDeleteColumn
}: SettingsProps) {
  
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
    >
      <Accordion defaultValue="manage-columns">
        <Accordion.Item value="manage-columns">
          <Accordion.Control>Manage Columns</Accordion.Control>
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
      </Accordion>
    </Modal>
  );
}

