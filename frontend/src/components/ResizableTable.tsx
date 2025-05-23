import React, { useState, useMemo, useEffect } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  flexRender,
  ColumnDef,
  SortingState,
  ColumnResizeMode,
  Header,
  HeaderGroup,
  Row,
  Cell,
  OnChangeFn,
  RowData,
  ColumnFiltersState,
  FilterFn
} from '@tanstack/react-table';
import { Table, Box, Text, LoadingOverlay, Group, TextInput, useMantineTheme, MultiSelect, Select } from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { useLocalStorage } from '@mantine/hooks';
import { IconSearch, IconCalendar } from '@tabler/icons-react';
import dayjs from 'dayjs';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore';
import isSameOrAfter from 'dayjs/plugin/isSameOrAfter';
import minMax from 'dayjs/plugin/minMax';
import { MyCustomPagination } from './MyCustomPagination';
import { columnFilters as columnFiltersApi } from '../services/api';
import { ActiveFilters } from './ActiveFilters';

// Initialize dayjs plugins
dayjs.extend(isSameOrBefore);
dayjs.extend(isSameOrAfter);
dayjs.extend(minMax);

// Define filter types
type FilterType = 'text' | 'number' | 'single-select' | 'multi-select' | 'boolean' | 'dateRange';

interface ColumnFilter {
  type: FilterType;
  options?: string[];
}

interface DateRangeValue {
  start: Date | null;
  end: Date | null;
}

interface CustomColumnData {
  id: string;
  name: string;
  type: 'text' | 'number' | 'single-select' | 'multi-select' | 'boolean';
  options?: string[];
  option_colors?: Record<string, string>;
  defaultValue?: string;
  applyToAll?: boolean;
}

// Export the type
export type ExtendedColumnDef<T> = ColumnDef<T> & {
  filter?: ColumnFilter;
  accessorKey?: string;
  meta?: {
    type?: 'text' | 'number' | 'single-select' | 'multi-select' | 'boolean' | 'dateRange';
    options?: string[];
    customColumn?: CustomColumnData;
    labelMap?: Record<string, string>;
    valueMap?: Record<string, string>;
  };
};

// Extend RowData to include created_at and custom_values_cache
interface BaseRowData {
  created_at?: string;
  custom_values_cache: Record<string, string>;
}

interface ResizableTableProps<T extends RowData & BaseRowData> {
  data: T[];
  columns: ExtendedColumnDef<T>[];
  sortState?: SortingState;
  onSortChange?: OnChangeFn<SortingState>;
  tableId: string;
  loading?: boolean;
  recordsPerPage: number;
  page: number;
  onPageChange: (page: number) => void;
  customColumns?: CustomColumnData[];
  onColumnFiltersChange?: (filters: ColumnFiltersState) => void;
  searchQuery?: string;
}

export function ResizableTable<T extends RowData & BaseRowData>({ 
  data, 
  columns, 
  sortState, 
  onSortChange,
  tableId,
  loading = false,
  recordsPerPage,
  page,
  onPageChange,
  customColumns = [],
  onColumnFiltersChange,
  searchQuery = ''
}: ResizableTableProps<T>) {
  const theme = useMantineTheme();
  const [columnSizing, setColumnSizing] = useLocalStorage<Record<string, number>>({
    key: `table-sizing-${tableId}`,
    defaultValue: {}
  });

  const [columnResizeMode] = useState<ColumnResizeMode>('onChange');
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const columnHeaderHeight = 32;
  const filterRowHeight = 40;

  // Load saved filters on mount
  useEffect(() => {
    const loadFilters = async () => {
      const response = await columnFiltersApi.getAll();
      if (response.success && response.data) {
        console.log('Loading saved filters:', response.data);
        
        // Convert saved filters to table format
        const tableFilters = Object.entries(response.data).map(([id, value]) => {
          // For custom columns, ensure the filter value matches expected format
          const column = columns.find(col => col.id === id);
          if (column?.meta?.customColumn) {
            // Handle custom column filter value based on type
            switch (column.meta.type) {
              case 'multi-select':
                return { id, value: Array.isArray(value) ? value : [value].filter(Boolean) };
              case 'single-select':
                return { id, value: value || '' };
              default:
                return { id, value };
            }
          }
          return { id, value };
        });

        console.log('Converted filters:', tableFilters);
        
        // Set filters in state
        setColumnFilters(tableFilters);
        
        // Force table to recompute filtered rows
        table.setColumnFilters(tableFilters);
        
        // Notify parent of filter changes
        if (onColumnFiltersChange) {
          onColumnFiltersChange(tableFilters);
        }
      }
    };
    loadFilters();
  }, [columns, onColumnFiltersChange]);

  // Save filters when they change
  useEffect(() => {
    const saveFilters = async () => {
      // Convert table filters to storage format
      const filterData = columnFilters.reduce((acc, filter) => ({
        ...acc,
        [filter.id]: filter.value
      }), {});
      
      await columnFiltersApi.update(filterData);
    };
    
    // Debounce to avoid too many saves
    const timeoutId = setTimeout(saveFilters, 1000);
    return () => clearTimeout(timeoutId);
  }, [columnFilters]);

  const textFilter: FilterFn<T> = (row: Row<T>, columnId: string, value: string): boolean => {
    const cellValue = row.getValue(columnId);
    if (!cellValue) return false;
    if (Array.isArray(cellValue)) {
      return cellValue.some(item => 
        String(item).toLowerCase().includes(value.toLowerCase())
      );
    }
    return String(cellValue).toLowerCase().includes(value.toLowerCase());
  };

  const multiSelectFilter: FilterFn<T> = (
    row: Row<T>,
    columnId: string,
    value: string[]
  ): boolean => {
    console.log(`Filtering row for ${columnId}:`, {
      value,
      cellValue: row.getValue(columnId),
      rowData: row.original
    });
    
    if (!value || value.length === 0) return true;

    // For custom columns, access the value through customValues
    let cellValue = row.getValue(columnId);
    if (columnId.startsWith('customValues.') && typeof row.original === 'object' && row.original !== null) {
      const customValues = (row.original as any).customValues;
      if (customValues && typeof customValues === 'object') {
        const customColumnId = columnId.split('.')[1];
        cellValue = customValues[customColumnId];
      }
    }

    if (!cellValue) return false;
    
    // Convert cell value to array if it's a comma-separated string
    const cellValues = Array.isArray(cellValue) 
      ? cellValue.map(v => String(v).trim().toLowerCase())
      : typeof cellValue === 'string'
        ? cellValue.split(',').map(v => v.trim().toLowerCase()).filter(Boolean)
        : [String(cellValue).trim().toLowerCase()];

    // Trim and lowercase the filter values
    const trimmedFilterValues = value.map(v => v.trim().toLowerCase());

    console.log('Processed values:', {
      filterValues: trimmedFilterValues,
      cellValues,
      cellValueType: typeof cellValue
    });

    // Check if ALL filter values are present in the cell values
    const result = trimmedFilterValues.every(filterValue => 
      cellValues.some(cellValue => cellValue === filterValue)
    );

    console.log(`Filter result for ${columnId}:`, {
      filterValues: trimmedFilterValues,
      cellValues,
      result,
      explanation: result 
        ? 'Row matches because it contains all selected options'
        : 'Row filtered out because it is missing some selected options'
    });
    
    return result;
  };

  const numberFilter: FilterFn<T> = (
    row: Row<T>,
    columnId: string,
    value: { min?: number; max?: number }
  ): boolean => {
    if (!value || (!value.min && !value.max)) return true;
    const cellValue = Number(row.getValue(columnId));
    if (isNaN(cellValue)) return false;
    if (value.min && cellValue < value.min) return false;
    if (value.max && cellValue > value.max) return false;
    return true;
  };

  const singleSelectFilter: FilterFn<T> = (
    row: Row<T>,
    columnId: string,
    filterValue: string
  ): boolean => {
    if (!filterValue) return true;
    const cellValue = row.getValue(columnId);
    
    // For the Source column, we need to compare raw values
    if (columnId === 'added_from') {
      console.log('Single-select filter comparison:', {
        columnId,
        cellValue,
        filterValue,
        matches: cellValue === filterValue
      });
    }
    
    return cellValue === filterValue;
  };

  const booleanFilter: FilterFn<T> = (
    row: Row<T>,
    columnId: string,
    value: boolean | null
  ): boolean => {
    if (value === null) return true;
    const cellValue = row.getValue(columnId);
    return Boolean(cellValue) === value;
  };

  const dateRangeFilter: FilterFn<any> = (
    row: Row<any>,
    columnId: string,
    filterValue: [Date | null, Date | null]
  ): boolean => {
    // If no filter value is set, show all rows
    if (!filterValue || (!filterValue[0] && !filterValue[1])) {
      return true;
    }

    const cellValue = row.getValue(columnId);
    // If cell has no value, don't show it when filtering
    if (!cellValue) {
      return false;
    }

    const cellDate = new Date(cellValue as string | number | Date);
    const [start, end] = filterValue;

    if (start && end) {
      return cellDate >= start && cellDate <= end;
    } else if (start) {
      return cellDate >= start;
    } else if (end) {
      return cellDate <= end;
    }

    return true;
  };

  // Get min and max dates from the data
  const dateRangeLimits = useMemo(() => {
    const dates = data
      .map(row => row.created_at)
      .filter((date): date is string => Boolean(date))
      .map(date => new Date(date))
      .filter(date => !isNaN(date.getTime()));

    if (!dates.length) return { minDate: undefined, maxDate: undefined };

    return {
      minDate: new Date(Math.min(...dates.map(d => d.getTime()))),
      maxDate: new Date(Math.max(...dates.map(d => d.getTime())))
    };
  }, [data]);

  // Determine filter types for columns
  const columnsWithFilters = useMemo(() => {
    console.log('Initial columns:', JSON.stringify(columns, null, 2));
    console.log('Available custom columns:', customColumns);
    
    return columns.map(column => {
      const columnId = String(column.accessorKey || column.id);

      console.log(`\n=== Processing column ${columnId} ===`);
      console.log('Raw column data:', {
        meta: JSON.stringify(column.meta, null, 2),
        accessorKey: column.accessorKey,
        id: column.id,
        fullColumn: JSON.stringify(column, null, 2)
      });
      
      // Special case for created_at
      if (columnId === 'created_at') {
        const result = {
          ...column,
          id: columnId,
          enableColumnFilter: true,
          filterFn: dateRangeFilter,
          filter: { type: 'dateRange' as const }
        };
        return result;
      }
        
      // For custom columns, the columnId starts with 'customValues.' followed by the column ID
      const isCustomColumn = columnId.startsWith('customValues.');
      const customColumnId = isCustomColumn ? columnId.split('.')[1] : null;

      console.log('Custom column check:', {
        isCustomColumn,
        customColumnId,
        hasMetadata: !!column.meta,
        metaType: column.meta?.type,
        metaOptions: column.meta?.options,
        customColumnData: column.meta?.customColumn
      });

      // Determine filter type based on column metadata
      let filterType: FilterType = 'text';
      let options: string[] = [];

      // Check meta.type first, regardless of whether it's a custom column
      if (column.meta?.type) {
        filterType = column.meta.type as FilterType;
        options = column.meta.options || [];
      }

      // For custom columns, we might need additional processing
      if (isCustomColumn && customColumnId && column.meta) {
        // Get options from the meta object if not already set
        if (!options.length) {
          if (column.meta.customColumn?.options) {
            // If we have the full custom column data, use it
            options = [...column.meta.customColumn.options];
            console.log('Using options from customColumn:', {
              source: 'customColumn',
              options,
              customColumn: column.meta.customColumn
            });
          } else if (Array.isArray(column.meta.options)) {
            // Fallback to direct options if available
            options = [...column.meta.options];
            console.log('Using options from direct meta:', {
              source: 'meta.options',
              options,
              metaOptions: column.meta.options
            });
          } else {
            // Try to find the custom column data from the API response
            const customColumn = customColumns.find((col: CustomColumnData) => col.id === customColumnId);
            if (customColumn) {
              options = [...(customColumn.options || [])];
              // Update the meta to include the full custom column data
              column.meta.customColumn = customColumn;
              console.log('Found options from API data:', {
                source: 'api',
                options,
                customColumn
              });
            } else {
              console.log('No valid options found:', {
                metaType: typeof column.meta.options,
                metaOptions: column.meta.options,
                fullMeta: column.meta
              });
            }
          }
        }

        console.log('Column metadata:', {
          originalType: column.meta.type,
          resolvedFilterType: filterType,
          hasCustomColumn: !!column.meta.customColumn,
          hasDirectOptions: Array.isArray(column.meta.options),
          metaContent: JSON.stringify(column.meta, null, 2)
        });
      }

      const result = {
        ...column,
        id: columnId,
        enableColumnFilter: true,
        filterFn: filterType === 'multi-select' ? multiSelectFilter :
                  filterType === 'single-select' ? singleSelectFilter :
                  filterType === 'number' ? numberFilter :
                  filterType === 'boolean' ? booleanFilter :
                  textFilter,
        filter: {
          type: filterType,
          options: options
        },
        meta: {
          ...column.meta,
          type: filterType,
          options: options,
          customColumn: column.meta?.customColumn
        }
      };

      console.log('Final column configuration:', {
        id: result.id,
        filterType,
        optionsLength: options.length,
        options,
        metaType: result.meta.type,
        metaOptions: result.meta.options,
        filterOptions: result.filter.options,
        hasCustomColumn: !!result.meta.customColumn
      });

      return result;
    });
  }, [columns, customColumns]);

  // When processing data for the table
  const processedData = useMemo(() => {
    return data.map(record => ({
      ...record,
      custom_values_cache: (record as any).custom_values_cache || {}
    })) as T[];
  }, [data]);

  const table = useReactTable({
    data: processedData,
    columns: columnsWithFilters,
    state: {
      sorting: sortState,
      columnSizing,
      columnFilters,
      globalFilter: searchQuery,
      pagination: {
        pageIndex: page - 1,
        pageSize: recordsPerPage
      }
    },
    columnResizeMode,
    onSortingChange: onSortChange,
    onColumnSizingChange: setColumnSizing,
    onColumnFiltersChange: (updater) => {
      const newFilters = typeof updater === 'function' 
        ? updater(columnFilters)
        : updater;
      
      console.log('Filter change:', newFilters);
      setColumnFilters(newFilters);
      
      if (onColumnFiltersChange) {
        onColumnFiltersChange(newFilters);
      }
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    pageCount: Math.ceil(data.length / recordsPerPage),
    manualPagination: false,
    enableColumnFilters: true,
    manualFiltering: false,
    filterFns: {
      text: textFilter,
      dateRange: dateRangeFilter,
      'multi-select': multiSelectFilter,
      number: numberFilter,
      singleSelect: singleSelectFilter,
      boolean: booleanFilter
    } as Record<string, FilterFn<T>>,
    defaultColumn: {
      minSize: 50,
      size: 150,
      maxSize: 1000,
      enableColumnFilter: true,
      enableSorting: true
    }
  });

  // Get all filtered and sorted rows
  const allFilteredRows = table.getFilteredRowModel().rows;
  const totalRecords = allFilteredRows.length;

  // Get paginated rows using TanStack Table's pagination
  const paginatedRows = table.getPaginationRowModel().rows;

  console.log('Table state:', {
    totalRecords,
    currentPage: page,
    recordsPerPage,
    startIndex: 0,
    endIndex: totalRecords,
    paginatedRowsCount: paginatedRows.length,
    allFilteredRowsCount: allFilteredRows.length,
    filters: columnFilters
  });

  const handleFilterChange = (columnId: string, value: any) => {
    console.log('handleFilterChange called:', {
      columnId,
      value,
      currentFilters: columnFilters
    });

    // Reset to page 1 before updating filters
    onPageChange(1);

    setColumnFilters((prev: ColumnFiltersState) => {
      const existing = prev.filter((filter: { id: string }) => filter.id !== columnId);
      if (value == null || (typeof value === 'string' && !value)) {
        console.log('Removing filter for column:', columnId);
        return existing;
      }
      const newFilters = [...existing, { id: columnId, value }];
      console.log('New filters state:', newFilters);
      return newFilters;
    });
  };

  const applyLocalFilter = (columnId: string, value: any) => {
    console.log('applyLocalFilter called:', {
      columnId,
      value,
      currentFilters: columnFilters
    });

    // Reset to page 1 before updating filters
    onPageChange(1);

    setColumnFilters((prev: ColumnFiltersState) => {
      const existing = prev.filter((filter: { id: string }) => filter.id !== columnId);
      if (value == null || (typeof value === 'string' && !value)) {
        console.log('Removing filter for column:', columnId);
        return existing;
      }
      const newFilters = [...existing, { id: columnId, value }];
      console.log('New filters state:', newFilters);

      // Notify parent of filter change
      if (onColumnFiltersChange) {
        onColumnFiltersChange(newFilters);
      }

      return newFilters;
    });
  };

  const renderDateRangeFilter = (header: Header<T, unknown>) => {
    const currentFilter = table.getState().columnFilters.find(
      (filter: { id: string; value: unknown }) => filter.id === header.column.id
    );
    const value = (currentFilter?.value as DateRangeValue) || { start: null, end: null };

    return (
      <Group gap="xs">
        <DateInput
          size="xs"
          placeholder="Start date"
          value={value.start}
          onChange={(date: Date | null) => {
            const newValue = { ...value, start: date };
            if (!date && !value.end) {
              applyLocalFilter(header.column.id, undefined);
            } else {
              applyLocalFilter(header.column.id, newValue);
            }
          }}
          leftSection={<IconCalendar size={14} />}
          clearable
          valueFormat="DD/MM/YYYY"
          minDate={dateRangeLimits.minDate}
          maxDate={dateRangeLimits.maxDate}
          styles={{
            root: { flex: 1 },
            input: {
              minHeight: '28px',
              '&::placeholder': {
                color: 'var(--mantine-color-dark-2)'
              }
            },
            calendarHeader: {
              maxWidth: '250px'
            },
            calendarHeaderControl: {
              width: '24px',
              height: '24px',
              '& svg': {
                width: '14px',
                height: '14px'
              }
            }
          }}
        />
        <DateInput
          size="xs"
          placeholder="End date"
          value={value.end}
          onChange={(date: Date | null) => {
            const newValue = { ...value, end: date };
            if (!date && !value.start) {
              applyLocalFilter(header.column.id, undefined);
            } else {
              applyLocalFilter(header.column.id, newValue);
            }
          }}
          leftSection={<IconCalendar size={14} />}
          clearable
          valueFormat="DD/MM/YYYY"
          minDate={dateRangeLimits.minDate}
          maxDate={dateRangeLimits.maxDate}
          styles={{
            root: { flex: 1 },
            input: {
              minHeight: '28px',
              '&::placeholder': {
                color: 'var(--mantine-color-dark-2)'
              }
            },
            calendarHeader: {
              maxWidth: '250px'
            },
            calendarHeaderControl: {
              width: '24px',
              height: '24px',
              '& svg': {
                width: '14px',
                height: '14px'
              }
            }
          }}
        />
      </Group>
    );
  };

  const renderFilterInput = (header: Header<T, unknown>) => {
    if (!header.column.getCanFilter()) return null;

    const column = columnsWithFilters.find(col => col.id === header.column.id);
    if (!column?.filter) return null;

    const currentFilter = table.getState().columnFilters.find(
      (filter: { id: string; value: unknown }) => filter.id === header.column.id
    );

    switch (column.filter.type) {
      case 'number':
        const numberValue = (currentFilter?.value || {}) as { min?: number; max?: number };
        return (
          <Group gap="xs">
            <TextInput
              placeholder="Min"
              type="number"
              value={numberValue.min ?? ''}
              onChange={(e) => {
                const min = e.target.value ? Number(e.target.value) : undefined;
                const max = numberValue.max;
                applyLocalFilter(header.column.id, { min, max });
              }}
              size="xs"
              styles={{
                root: { flex: 1 },
                input: {
                  minHeight: '28px',
                  '&::placeholder': {
                    color: theme.colors.dark[2]
                  }
                }
              }}
            />
            <TextInput
              placeholder="Max"
              type="number"
              value={numberValue.max ?? ''}
              onChange={(e) => {
                const max = e.target.value ? Number(e.target.value) : undefined;
                const min = numberValue.min;
                applyLocalFilter(header.column.id, { min, max });
              }}
              size="xs"
              styles={{
                root: { flex: 1 },
                input: {
                  minHeight: '28px',
                  '&::placeholder': {
                    color: theme.colors.dark[2]
                  }
                }
              }}
            />
          </Group>
        );

      case 'single-select':
        const columnMeta = column.meta;
        // Get the mapping from display labels to raw values
        const labelToValueMap = columnMeta?.labelMap || {};
        // Get the mapping from raw values to display labels
        const valueToLabelMap = Object.entries(labelToValueMap as Record<string, string>).reduce((acc, [label, value]) => {
          acc[value] = label;
          return acc;
        }, {} as Record<string, string>);

        // Create options array with value = raw value, label = display label
        const selectOptions = column.filter.options?.map((displayLabel: string) => ({
          value: labelToValueMap[displayLabel] || displayLabel,  // Use raw value
          label: displayLabel  // Use display label
        })) || [];

        console.log('Single-select setup:', {
          columnId: header.column.id,
          labelToValueMap,
          valueToLabelMap,
          selectOptions,
          currentFilter
        });

        return (
          <Select
            placeholder="Select..."
            value={(currentFilter?.value as string) || null}
            onChange={(value) => handleFilterChange(header.column.id, value)}
            data={selectOptions}
            clearable
            searchable
            size="xs"
            styles={{
              root: { width: '100%' },
              input: {
                minHeight: '28px',
                '&::placeholder': {
                  color: theme.colors.dark[2]
                }
              }
            }}
          />
        );

      case 'multi-select':
        const multiSelectOptions = (column.filter.options || []).map((opt: string) => ({
          value: opt,
          label: opt
        }));
        
        console.log(`Rendering multi-select for ${header.column.id}:`, {
          options: multiSelectOptions,
          currentValue: currentFilter?.value,
          columnFilter: column.filter,
          columnMeta: column.meta
        });
        
        return (
          <MultiSelect
            placeholder="Select options..."
            value={(currentFilter?.value as string[]) || []}
            onChange={(value) => {
              console.log(`Multi-select value changed for ${header.column.id}:`, value);
              handleFilterChange(header.column.id, value);
            }}
            data={multiSelectOptions}
            clearable
            searchable
            hidePickedOptions
            maxDropdownHeight={200}
            size="xs"
            styles={{
              root: { width: '100%' },
              input: {
                minHeight: '28px',
                '&::placeholder': {
                  color: theme.colors.dark[2]
                }
              }
            }}
          />
        );

      case 'boolean':
        return (
          <Select
            placeholder="Select..."
            value={currentFilter?.value === null ? null : String(currentFilter?.value)}
            onChange={(value) => {
              if (value === null) {
                handleFilterChange(header.column.id, null);
              } else {
                handleFilterChange(header.column.id, value === 'true');
              }
            }}
            data={[
              { value: 'true', label: 'Yes' },
              { value: 'false', label: 'No' }
            ]}
            clearable
            size="xs"
            styles={{
              root: { width: '100%' },
              input: {
                minHeight: '28px',
                '&::placeholder': {
                  color: theme.colors.dark[2]
                }
              }
            }}
          />
        );

      case 'dateRange':
        return renderDateRangeFilter(header);

      case 'text':
      default:
        return (
          <TextInput
            placeholder="Filter..."
            value={(currentFilter?.value as string) || ''}
            onChange={(e) => handleFilterChange(header.column.id, e.target.value)}
            size="xs"
            leftSection={<IconSearch size={14} />}
            styles={{
              root: { width: '100%' },
              input: {
                minHeight: '28px',
                '&::placeholder': {
                  color: theme.colors.dark[2]
                }
              }
            }}
          />
        );
    }
  };

  // Add debug logging for filter application
  useEffect(() => {
    console.log('Current filters:', columnFilters);
    console.log('Filtered rows:', table.getFilteredRowModel().rows.length);
  }, [columnFilters, table]);

  const handleClearFilter = (columnId: string) => {
    const newFilters = columnFilters.filter(f => f.id !== columnId);
    setColumnFilters(newFilters);
    if (onColumnFiltersChange) {
      onColumnFiltersChange(newFilters);
    }
  };

  return (
    <Box>
      <ActiveFilters 
        filters={columnFilters}
        columns={columns}
        onClearFilter={handleClearFilter}
      />

      <Box style={{ 
        width: '100%',
        overflowX: 'auto',
        position: 'relative'
      }}>
        <LoadingOverlay visible={loading} zIndex={100} />
        <Table
          striped
          highlightOnHover
          style={{
            width: '100%',
            minWidth: Math.max(table.getCenterTotalSize(), 1200),
            borderCollapse: 'separate',
            borderSpacing: 0
          }}
          styles={{
            table: {
              tableLayout: 'fixed',
              width: '100%'
            },
            thead: {
              backgroundColor: 'var(--mantine-color-dark-7)',
              position: 'sticky',
              top: 0,
              zIndex: 10
            },
            tbody: {
              width: '100%'
            },
            tr: {
              height: `${columnHeaderHeight}px`,
              maxHeight: `${columnHeaderHeight}px`
            },
            td: {
              height: `${columnHeaderHeight}px`,
              maxHeight: `${columnHeaderHeight}px`,
              padding: '4px 8px',
              borderRight: '1px solid var(--mantine-color-dark-4)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              '&:last-child': {
                borderRight: 'none'
              }
            },
            th: {
              height: `${columnHeaderHeight}px`,
              maxHeight: `${columnHeaderHeight}px`,
              padding: '4px 8px',
              borderRight: '1px solid var(--mantine-color-dark-4)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              '&:last-child': {
                borderRight: 'none'
              }
            }
          }}
        >
          <Table.Thead>
            {table.getHeaderGroups().map((headerGroup: HeaderGroup<T>) => (
              <React.Fragment key={headerGroup.id}>
                <Table.Tr
                  style={{
                    position: 'sticky',
                    top: 0,
                    zIndex: 10,
                    backgroundColor: 'var(--mantine-color-dark-7)'
                  }}
                >
                  {headerGroup.headers.map((header: Header<T, unknown>) => (
                    <Table.Th
                      key={header.id}
                      colSpan={header.colSpan}
                      style={{
                        width: header.getSize(),
                        position: 'sticky',
                        top: 0,
                        zIndex: 10,
                        backgroundColor: 'var(--mantine-color-dark-7)',
                        userSelect: 'none',
                        height: `${columnHeaderHeight}px`,
                        maxHeight: `${columnHeaderHeight}px`
                      }}
                    >
                      {header.isPlaceholder ? null : (
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            cursor: header.column.getCanSort() ? 'pointer' : 'default',
                            position: 'relative',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            height: '32px',
                            maxHeight: '32px'
                          }}
                          onClick={header.column.getToggleSortingHandler()}
                        >
                          {flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                          {header.column.getCanSort() && (
                            <Text ml="xs" c="dimmed">
                              {{
                                asc: '↑',
                                desc: '↓'
                              }[header.column.getIsSorted() as string] ?? ''}
                            </Text>
                          )}
                        </div>
                      )}
                      {header.column.getCanResize() && (
                        <div
                          onMouseDown={header.getResizeHandler()}
                          onTouchStart={header.getResizeHandler()}
                          className="resizer"
                          style={{
                            position: 'absolute',
                            right: 0,
                            top: 0,
                            height: '100%',
                            width: '4px',
                            background: 'var(--mantine-color-dark-4)',
                            cursor: 'col-resize',
                            userSelect: 'none',
                            touchAction: 'none',
                            opacity: header.column.getIsResizing() ? 1 : 0,
                            transition: 'opacity 0.2s',
                            zIndex: 3
                          }}
                          onMouseEnter={(e) => {
                            (e.target as HTMLElement).style.opacity = '1';
                            (e.target as HTMLElement).style.background = 'var(--mantine-color-blue-5)';
                          }}
                          onMouseLeave={(e) => {
                            if (!header.column.getIsResizing()) {
                              (e.target as HTMLElement).style.opacity = '0';
                              (e.target as HTMLElement).style.background = 'var(--mantine-color-dark-4)';
                            }
                          }}
                        />
                      )}
                    </Table.Th>
                  ))}
                </Table.Tr>
                <Table.Tr
                  style={{
                    position: 'sticky',
                    top: `${columnHeaderHeight}px`,
                    zIndex: 10,
                    backgroundColor: 'var(--mantine-color-dark-7)'
                  }}
                >
                  {headerGroup.headers.map((header: Header<T, unknown>) => (
                    <Table.Th
                      key={`${header.id}-filter`}
                      colSpan={header.colSpan}
                      style={{
                        width: header.getSize(),
                        position: 'sticky',
                        top: `${columnHeaderHeight}px`,
                        zIndex: 10,
                        backgroundColor: 'var(--mantine-color-dark-7)',
                        padding: '4px 8px',
                        height: `${filterRowHeight}px`,
                        maxHeight: `${filterRowHeight}px`
                      }}
                    >
                      {!header.isPlaceholder && header.column.getCanFilter() && renderFilterInput(header)}
                    </Table.Th>
                  ))}
                </Table.Tr>
              </React.Fragment>
            ))}
          </Table.Thead>
          <Table.Tbody>
            {paginatedRows.map((row: Row<T>) => (
              <Table.Tr key={row.id}>
                {row.getVisibleCells().map((cell: Cell<T, unknown>) => (
                  <Table.Td
                    key={cell.id}
                    style={{
                      width: cell.column.getSize(),
                      maxWidth: cell.column.getSize(),
                      overflow: 'hidden',
                      height: '32px',
                      maxHeight: '32px',
                      padding: '4px 8px'
                    }}
                  >
                    <div style={{ 
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      height: '32px',
                      maxHeight: '32px',
                      display: 'flex',
                      alignItems: 'center'
                    }}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </div>
                  </Table.Td>
                ))}
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Box>

      {table.getFilteredRowModel().rows.length > 0 && (
        <Box
          style={{
            width: '100%',
            display: 'flex',
            justifyContent: 'center',
            backgroundColor: 'var(--mantine-color-dark-8)',
            padding: '20px',
            borderTop: '1px solid var(--mantine-color-dark-4)',
            position: 'sticky',
            left: 0,
            zIndex: 1
          }}
        >
          <MyCustomPagination
            page={page}
            onChange={onPageChange}
            total={Math.ceil(table.getFilteredRowModel().rows.length / recordsPerPage)}
            siblings={0}
            recordsPerPage={recordsPerPage}
            totalRecords={table.getFilteredRowModel().rows.length}
          />
        </Box>
      )}
    </Box>
  );
} 

