import { useState } from 'react';
import { TextInput, Select, MultiSelect } from '@mantine/core';
import type { CustomColumn } from '../types';

interface CustomValueCellProps {
  value: string;
  column: CustomColumn;
  onChange: (value: string) => void;
}

export function CustomValueCell({ value, column, onChange }: CustomValueCellProps) {
  const [isEditing, setIsEditing] = useState(false);

  if (column.type === 'multi-select') {
    return (
      <MultiSelect
        value={value ? value.split(',') : []}
        data={column.options || []}
        onChange={(newValues) => {
          onChange(newValues.join(','));
        }}
        styles={() => ({
          input: {
            minHeight: '36px'
          }
        })}
      />
    );
  }

  if (column.type === 'single-select') {
    return (
      <Select
        value={value}
        data={column.options || []}
        onChange={(newValue) => onChange(newValue || '')}
        styles={() => ({
          input: {
            minHeight: '36px'
          }
        })}
      />
    );
  }

  // Default text input
  return isEditing ? (
    <TextInput
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={() => setIsEditing(false)}
      autoFocus
    />
  ) : (
    <div onClick={() => setIsEditing(true)}>
      {value || '-'}
    </div>
  );
} 
