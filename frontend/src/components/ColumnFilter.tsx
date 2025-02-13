import { useState, useMemo } from 'react';
import { Menu, Button, TextInput, Select, MultiSelect, Stack, Group, Text } from '@mantine/core';
import { IconFilter, IconX } from '@tabler/icons-react';

interface ColumnFilterProps {
  columnId: string;
  columnType: 'text' | 'number' | 'array' | 'single-select' | 'multi-select' | 'date';
  value: string | null;
  onChange: (value: string | null) => void;
  options?: string[];  // For select/multi-select columns
  data: any[];  // Full dataset to extract unique values
}

export function ColumnFilter({ 
  columnId, 
  columnType, 
  value, 
  onChange,
  options,
  data 
}: ColumnFilterProps) {
  const [opened, setOpened] = useState(false);

  // Extract unique values from the data for this column
  const uniqueValues = useMemo(() => {
    if (columnType === 'array') {
      // For array columns, flatten all arrays and get unique values
      const allValues = data
        .map(row => row[columnId])
        .filter(Boolean)
        .flat();
      return [...new Set(allValues)].sort();
    } else {
      // For regular columns, just get unique values
      const values = data
        .map(row => row[columnId])
        .filter(Boolean);
      return [...new Set(values)].sort();
    }
  }, [data, columnId, columnType]);

  const handleClear = () => {
    onChange(null);
    setOpened(false);
  };

  const renderFilterContent = () => {
    switch (columnType) {
      case 'text':
        return (
          <TextInput
            placeholder="Filter text..."
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            size="xs"
          />
        );

      case 'number':
        return (
          <TextInput
            placeholder="Filter number..."
            value={value || ''}
            onChange={(e) => {
              const val = e.target.value;
              if (val === '' || /^[0-9]+$/.test(val)) {
                onChange(val);
              }
            }}
            size="xs"
            type="number"
          />
        );

      case 'array':
      case 'multi-select':
        return (
          <MultiSelect
            placeholder="Select values..."
            value={value ? value.split(',') : []}
            onChange={(vals) => onChange(vals.length > 0 ? vals.join(',') : null)}
            data={options || uniqueValues}
            searchable
            clearable
            size="xs"
          />
        );

      case 'single-select':
        return (
          <Select
            placeholder="Select value..."
            value={value}
            onChange={onChange}
            data={options || uniqueValues}
            searchable
            clearable
            size="xs"
          />
        );

      case 'date':
        return (
          <TextInput
            placeholder="YYYY-MM-DD"
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            size="xs"
          />
        );

      default:
        return null;
    }
  };

  return (
    <Menu 
      opened={opened} 
      onChange={setOpened}
      position="bottom-start"
      shadow="md"
      width={200}
    >
      <Menu.Target>
        <Button 
          variant={value ? "light" : "subtle"}
          size="xs"
          leftSection={<IconFilter size={14} />}
          rightSection={value && (
            <IconX 
              size={14}
              style={{ cursor: 'pointer' }}
              onClick={(e) => {
                e.stopPropagation();
                handleClear();
              }}
            />
          )}
          style={{ width: '100%' }}
        >
          {value ? 'Filtered' : 'Filter'}
        </Button>
      </Menu.Target>

      <Menu.Dropdown>
        <Stack gap="xs" p="xs">
          <Text size="xs" fw={500}>Filter {columnId}</Text>
          {renderFilterContent()}
        </Stack>
      </Menu.Dropdown>
    </Menu>
  );
} 
