import { Group, Badge, Text, Box } from '@mantine/core';
import { IconX } from '@tabler/icons-react';
import { ColumnFiltersState } from '@tanstack/react-table';
import type { ExtendedColumnDef } from './ResizableTable';

interface ActiveFiltersProps {
  filters: ColumnFiltersState;
  columns: ExtendedColumnDef<any>[];
  onClearFilter: (columnId: string) => void;
}

export function ActiveFilters({ filters, columns, onClearFilter }: ActiveFiltersProps) {
  if (!filters.length) return null;

  const renderFilterValue = (filter: { id: string; value: any }) => {
    const column = columns.find(col => col.id === filter.id);
    
    if (!column) return String(filter.value);

    switch (column.meta?.type) {
      case 'multi-select':
        return Array.isArray(filter.value) 
          ? filter.value.join(', ')
          : filter.value;
      case 'dateRange':
        if (filter.value && typeof filter.value === 'object') {
          const range = filter.value as { start: Date | null; end: Date | null };
          const start = range.start ? new Date(range.start).toLocaleDateString() : '';
          const end = range.end ? new Date(range.end).toLocaleDateString() : '';
          return start && end ? `${start} - ${end}` : start || end;
        }
        return '';
      case 'boolean':
        return filter.value ? 'Yes' : 'No';
      default:
        return String(filter.value);
    }
  };

  return (
    <Box mb="md">
      <Group gap="xs" align="center">
        <Text size="sm" fw={500}>Active Filters:</Text>
        {filters.map(filter => {
          const column = columns.find(col => col.id === filter.id);
          const columnName = column?.meta?.customColumn?.name || column?.header?.toString() || filter.id;
          
          return (
            <Badge 
              key={filter.id}
              variant="filled"
              rightSection={
                <IconX 
                  size={14}
                  style={{ cursor: 'pointer' }}
                  onClick={() => onClearFilter(filter.id)}
                />
              }
            >
              {columnName}: {renderFilterValue(filter)}
            </Badge>
          );
        })}
      </Group>
    </Box>
  );
} 
