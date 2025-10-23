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

    // Handle text filters with AND/OR mode (new format: { terms: string[], mode: 'AND' | 'OR' })
    if (filter.value && typeof filter.value === 'object' && 'terms' in filter.value && 'mode' in filter.value) {
      const { terms, mode } = filter.value;
      return `${terms.join(', ')} (${mode})`;
    }

    switch (column.meta?.type) {
      case 'number':
        if (filter.value && typeof filter.value === 'object') {
          const range = filter.value as { min?: number; max?: number; includeEmpty?: boolean };
          let rangeStr = '';
          if (range.min !== undefined && range.max !== undefined) {
            rangeStr = `${range.min} - ${range.max}`;
          } else if (range.min !== undefined) {
            rangeStr = `≥ ${range.min}`;
          } else if (range.max !== undefined) {
            rangeStr = `≤ ${range.max}`;
          }
          
          // Add "(excl. empty)" if includeEmpty is false
          if (rangeStr && range.includeEmpty === false) {
            rangeStr += ' (excl. empty)';
          }
          
          return rangeStr || String(filter.value);
        }
        return String(filter.value);
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
