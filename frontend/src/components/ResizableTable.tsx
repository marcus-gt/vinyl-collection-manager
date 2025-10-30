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
import { Table, Box, Text, LoadingOverlay, Group, TextInput, useMantineTheme, Select, Badge, Popover, ActionIcon, Checkbox } from '@mantine/core';
import { DatePicker } from '@mantine/dates';
import { useLocalStorage } from '@mantine/hooks';
import { IconSearch, IconFilter, IconCheck, IconX } from '@tabler/icons-react';
import dayjs from 'dayjs';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore';
import isSameOrAfter from 'dayjs/plugin/isSameOrAfter';
import minMax from 'dayjs/plugin/minMax';
import { MyCustomPagination } from './MyCustomPagination';
import { columnFilters as columnFiltersApi } from '../services/api';
import { ActiveFilters } from './ActiveFilters';
import { PILL_COLORS } from '../constants/colors';

// Helper function to get color styles for badges
const getColorStyles = (colorName: string) => {
  const colorOption = PILL_COLORS.options.find(opt => opt.value === colorName);
  if (colorOption) {
    return {
      backgroundColor: colorOption.background,
      color: colorOption.color,
      border: 'none'
    };
  }
  // Default gray if not found
  const defaultColor = PILL_COLORS.options.find(opt => opt.value === 'gray');
  return {
    backgroundColor: defaultColor?.background || 'rgba(120, 119, 116, 0.2)',
    color: defaultColor?.color || 'rgba(120, 119, 116, 1)',
    border: 'none'
  };
};

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
  columnVisibility?: Record<string, boolean>;
  columnOrder?: string[];
  onColumnOrderChange?: (order: string[]) => void;
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
  searchQuery = '',
  columnVisibility = {},
  columnOrder: externalColumnOrder,
  onColumnOrderChange: externalOnColumnOrderChange
}: ResizableTableProps<T>) {
  const theme = useMantineTheme();
  const [columnSizing, setColumnSizing] = useLocalStorage<Record<string, number>>({
    key: `table-sizing-${tableId}`,
    defaultValue: {}
  });

  const [columnResizeMode] = useState<ColumnResizeMode>('onChange');
    const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
    const columnHeaderHeight = 32;

  // Column reordering state
  // Use external columnOrder if provided, otherwise fall back to localStorage
  const [localColumnOrder, setLocalColumnOrder] = useLocalStorage<string[]>({
    key: `table-column-order-${tableId}`,
    defaultValue: []
  });
  
  const columnOrder = externalColumnOrder !== undefined ? externalColumnOrder : localColumnOrder;
  
  // Wrap setColumnOrder to handle both direct values and updater functions
  const setColumnOrder = (updaterOrValue: string[] | ((old: string[]) => string[])) => {
    if (externalOnColumnOrderChange) {
      const newOrder = typeof updaterOrValue === 'function' 
        ? updaterOrValue(columnOrder)
        : updaterOrValue;
      externalOnColumnOrderChange(newOrder);
    } else {
      setLocalColumnOrder(updaterOrValue);
    }
  };
  const [draggedColumn, setDraggedColumn] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);

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

  const textFilter: FilterFn<T> = (row: Row<T>, columnId: string, value: any): boolean => {
    const cellValue = row.getValue(columnId);
    if (!cellValue) return false;
    
    // Handle array of filter terms (pills)
    if (Array.isArray(value)) {
      if (value.length === 0) return true;
      
      // If cellValue is an array (like genres: ['Jazz', 'Electronic'])
      if (Array.isArray(cellValue)) {
        // Convert all cell values to lowercase for comparison
        const cellValuesLower = cellValue.map((v: any) => String(v).toLowerCase());
        // Return true if ANY filter term matches ANY cell value
        return value.some(term => 
          cellValuesLower.some(cellVal => cellVal.includes(term.toLowerCase()))
        );
      }
      
      // If cellValue is a string
      const cellValueLower = String(cellValue).toLowerCase();
      return value.some(term => cellValueLower.includes(term.toLowerCase()));
    }
    
    // Handle single string filter value (legacy)
    if (Array.isArray(cellValue)) {
      return cellValue.some(item => 
        String(item).toLowerCase().includes(String(value).toLowerCase())
      );
    }
    
    return String(cellValue).toLowerCase().includes(String(value).toLowerCase());
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
    value: { min?: number; max?: number; includeEmpty?: boolean }
  ): boolean => {
    if (!value || (value.min === undefined && value.max === undefined)) return true;
    const rawValue = row.getValue(columnId);
    const includeEmpty = value.includeEmpty ?? true; // Default to true if not specified
    
    // Check if value is empty (null, undefined, empty string, or 0)
    const isEmpty = rawValue === null || rawValue === undefined || rawValue === '' || rawValue === 0;
    
    // If the value is empty and we should include empty values, pass the filter
    if (isEmpty && includeEmpty) {
      return true;
    }
    
    // If the value is empty and we should NOT include empty values, exclude it
    if (isEmpty && !includeEmpty) {
      return false;
    }
    
    const cellValue = Number(rawValue);
    if (isNaN(cellValue)) {
      return false;
    }
    
    if (value.min !== undefined && cellValue < value.min) {
      return false;
    }
    if (value.max !== undefined && cellValue > value.max) {
      return false;
    }
    
    return true;
  };

  const singleSelectFilter: FilterFn<T> = (
    row: Row<T>,
    columnId: string,
    filterValue: string | string[]
  ): boolean => {
    // If no filter value, show all rows
    if (!filterValue || (Array.isArray(filterValue) && filterValue.length === 0)) return true;
    
    const cellValue = row.getValue(columnId);
    
    // Convert filterValue to array if it's not already
    const filterArray = Array.isArray(filterValue) ? filterValue : [filterValue];
    
    // For the Source column, we need to compare raw values
    if (columnId === 'added_from') {
      console.log('Single-select filter comparison:', {
        columnId,
        cellValue,
        filterValue: filterArray,
        matches: filterArray.includes(cellValue as string)
      });
    }
    
    // Check if the cell value is in the filter array
    return filterArray.includes(cellValue as string);
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
    filterValue: { start: Date | null; end: Date | null } | [Date | null, Date | null]
  ): boolean => {
    // Handle both object and array formats
    let start: Date | null;
    let end: Date | null;
    
    if (Array.isArray(filterValue)) {
      [start, end] = filterValue;
    } else if (filterValue && typeof filterValue === 'object') {
      start = filterValue.start;
      end = filterValue.end;
    } else {
      return true;
    }
    
    // If no filter value is set, show all rows
    if (!start && !end) {
      return true;
    }

    const cellValue = row.getValue(columnId);
    // If cell has no value, don't show it when filtering
    if (!cellValue) {
      return false;
    }

    const cellDate = new Date(cellValue as string | number | Date);

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
        enableColumnFilter: column.enableColumnFilter !== false, // Respect original setting
        // Respect existing filterFn if provided, otherwise use filterType-based logic
        filterFn: column.filterFn || (
                  filterType === 'multi-select' ? multiSelectFilter :
                  filterType === 'single-select' ? singleSelectFilter :
                  filterType === 'number' ? numberFilter :
                  filterType === 'boolean' ? booleanFilter :
                  textFilter
                ),
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
      columnOrder,
      columnVisibility,
      pagination: {
        pageIndex: page - 1,
        pageSize: recordsPerPage
      }
    },
    columnResizeMode,
    onSortingChange: onSortChange,
    onColumnSizingChange: setColumnSizing,
    onColumnOrderChange: setColumnOrder,
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
      boolean: booleanFilter,
      textMultiTermContains: (row, columnId, filterValue) => {
        const cellValue = row.getValue(columnId);
        
        console.log(`🔍 [textMultiTermContains] columnId: ${columnId}, filterValue:`, filterValue, 'cellValue:', cellValue);
        
        // Handle new format: { terms: string[], mode: 'AND' | 'OR' }
        // or old format: string[]
              let filterTerms: string[];
              let filterMode: 'AND' | 'OR' = 'OR'; // Default to OR
        
        if (filterValue && typeof filterValue === 'object' && 'terms' in filterValue) {
          // New format with mode
          filterTerms = filterValue.terms;
          filterMode = filterValue.mode || 'OR';
        } else if (Array.isArray(filterValue)) {
          // Old format (just array) - use OR logic by default
          filterTerms = filterValue;
        } else {
          // No valid filter
          return true;
        }
        
        if (filterTerms.length === 0) {
          return true; // No filter, show all rows
        }
        
        // If cell value is null/undefined, don't match
        if (cellValue === null || cellValue === undefined) {
          console.log(`   ❌ Cell value is null/undefined`);
          return false;
        }
        
        // Convert filter terms to lowercase for case-insensitive matching
        const filterTermsLower = filterTerms.map((term: string) => term.toLowerCase());
        console.log(`   📋 Filter terms (lowercase):`, filterTermsLower, `Mode: ${filterMode}`);
        
        // Handle array values (like genres)
        if (Array.isArray(cellValue)) {
          const cellValuesLower = cellValue.map(v => String(v).toLowerCase());
          console.log(`   📚 Cell values (lowercase array):`, cellValuesLower);
          
          let matches: boolean;
          if (filterMode === 'AND') {
            // Check if ALL filter terms match at least one value in the cell's array
            matches = filterTermsLower.every(filterTerm => 
              cellValuesLower.some(cellVal => cellVal.includes(filterTerm))
            );
            console.log(`   ${matches ? '✅' : '❌'} Array match result (AND): ${matches}`);
          } else {
            // Check if ANY filter term matches at least one value in the cell's array
            matches = filterTermsLower.some(filterTerm => 
              cellValuesLower.some(cellVal => cellVal.includes(filterTerm))
            );
            console.log(`   ${matches ? '✅' : '❌'} Array match result (OR): ${matches}`);
          }
          return matches;
        }
        
        // Handle string/number values
        const cellStr = String(cellValue).toLowerCase();
        console.log(`   📝 Cell value (lowercase string): "${cellStr}"`);
        
        let matches: boolean;
        if (filterMode === 'AND') {
          // Check if ALL filter terms are contained in the cell value
          matches = filterTermsLower.every(filterTerm => cellStr.includes(filterTerm));
          console.log(`   ${matches ? '✅' : '❌'} String match result (AND): ${matches}`);
        } else {
          // Check if ANY filter term is contained in the cell value
          matches = filterTermsLower.some(filterTerm => cellStr.includes(filterTerm));
          console.log(`   ${matches ? '✅' : '❌'} String match result (OR): ${matches}`);
        }
        return matches;
      }
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

  const handleFilterChange = React.useCallback((columnId: string, value: any) => {
    console.log('handleFilterChange called:', {
      columnId,
      value
    });

    // Reset to page 1 before updating filters
    onPageChange(1);

    setColumnFilters((prev: ColumnFiltersState) => {
      console.log('  Previous filters:', prev);
      const existing = prev.filter((filter: { id: string }) => filter.id !== columnId);
      if (value == null || (typeof value === 'string' && !value)) {
        console.log('  Removing filter for column:', columnId);
        return existing;
      }
      const newFilters = [...existing, { id: columnId, value }];
      console.log('  New filters state:', newFilters);
      return newFilters;
    });
  }, [onPageChange]);

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

  const DateRangeFilter = ({ header }: any) => {
    const currentFilter = table.getState().columnFilters.find(
      (filter: { id: string; value: unknown }) => filter.id === header.column.id
    );
    const value = (currentFilter?.value as DateRangeValue) || { start: null, end: null };
    
    // Local state for the date range before confirming
    const [localValue, setLocalValue] = React.useState<[Date | null, Date | null]>([value.start, value.end]);
    
    // Update local value when filter changes externally
    React.useEffect(() => {
      setLocalValue([value.start, value.end]);
    }, [value.start, value.end]);

    const handleConfirm = () => {
      if (!localValue[0] && !localValue[1]) {
        applyLocalFilter(header.column.id, undefined);
      } else {
        applyLocalFilter(header.column.id, { start: localValue[0], end: localValue[1] });
      }
    };

    const handleCancel = () => {
      setLocalValue([value.start, value.end]); // Reset to current filter value
    };

    const handleClear = () => {
      setLocalValue([null, null]);
      applyLocalFilter(header.column.id, undefined);
    };

    const formatDateForDisplay = (date: Date | null) => {
      if (!date) return '';
      return date.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
    };

    const parseDateFromInput = (input: string): Date | null => {
      if (!input) return null;
      // Try to parse DD/MM/YYYY format
      const parts = input.split('/');
      if (parts.length === 3) {
        const day = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1; // Months are 0-indexed
        const year = parseInt(parts[2], 10);
        const date = new Date(year, month, day);
        // Validate the date
        if (!isNaN(date.getTime()) && 
            date.getDate() === day && 
            date.getMonth() === month && 
            date.getFullYear() === year) {
          return date;
        }
      }
      return null;
    };

    const [startText, setStartText] = React.useState(formatDateForDisplay(localValue[0]));
    const [endText, setEndText] = React.useState(formatDateForDisplay(localValue[1]));

    // Update text when localValue changes (from calendar clicks)
    React.useEffect(() => {
      setStartText(formatDateForDisplay(localValue[0]));
      setEndText(formatDateForDisplay(localValue[1]));
    }, [localValue[0], localValue[1]]);

    const handleStartTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const text = e.target.value;
      setStartText(text);
      const parsedDate = parseDateFromInput(text);
      if (parsedDate) {
        setLocalValue([parsedDate, localValue[1]]);
      } else if (!text) {
        setLocalValue([null, localValue[1]]);
      }
    };

    const handleEndTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const text = e.target.value;
      setEndText(text);
      const parsedDate = parseDateFromInput(text);
      if (parsedDate) {
        setLocalValue([localValue[0], parsedDate]);
      } else if (!text) {
        setLocalValue([localValue[0], null]);
      }
    };

    return (
      <Box>
        <Group gap="xs" mb="xs">
          <TextInput
            size="sm"
            placeholder="DD/MM/YYYY"
            value={startText}
            onChange={handleStartTextChange}
            styles={{
              root: { flex: 1 },
              input: {
                fontSize: '13px',
                fontWeight: 500
              }
            }}
          />
          <TextInput
            size="sm"
            placeholder="DD/MM/YYYY"
            value={endText}
            onChange={handleEndTextChange}
            styles={{
              root: { flex: 1 },
              input: {
                fontSize: '13px',
                fontWeight: 500
              }
            }}
          />
        </Group>
        <DatePicker
          type="range"
          value={localValue}
          onChange={(dates: [Date | null, Date | null] | null) => {
            setLocalValue(dates || [null, null]);
          }}
          defaultDate={localValue[0] || new Date()}
          minDate={dateRangeLimits.minDate}
          maxDate={dateRangeLimits.maxDate}
          numberOfColumns={1}
          allowSingleDateInRange
          styles={{
            calendarHeaderControl: {
              width: '24px',
              height: '24px',
              minWidth: '24px',
              minHeight: '24px',
              '& svg': {
                width: '14px',
                height: '14px'
              }
            }
          }}
        />
        <Group gap={4} mt="xs" justify="space-between">
          <ActionIcon
            size="sm"
            variant="subtle"
            color="gray"
            onClick={handleClear}
            title="Clear"
          >
            <IconX size={16} />
          </ActionIcon>
          <Group gap={4}>
            <ActionIcon
              size="sm"
              variant="subtle"
              color="red"
              onClick={handleCancel}
              title="Cancel"
            >
              <IconX size={16} />
            </ActionIcon>
            <ActionIcon
              size="sm"
              variant="subtle"
              color="green"
              onClick={handleConfirm}
              title="Apply"
            >
              <IconCheck size={16} />
            </ActionIcon>
          </Group>
        </Group>
      </Box>
    );
  };

  const renderDateRangeFilter = (header: Header<T, unknown>) => {
    return <DateRangeFilter header={header} />;
  };

  // Component for single-select filter with hooks
  const SingleSelectFilter = ({ header, selectOptions, singleSelectOptionColors, singleSelectValues }: any) => {
    const [searchQuery, setSearchQuery] = React.useState('');
    const filteredSelectOptions = selectOptions.filter((opt: any) => 
      opt.label.toLowerCase().includes(searchQuery.toLowerCase()) && !singleSelectValues.includes(opt.value)
    );

    return (
      <Box>
        {/* Selected options at the top */}
        {singleSelectValues.length > 0 && (
          <Box mb="xs" pb="xs" style={{ borderBottom: '1px solid var(--mantine-color-dark-4)' }}>
            <Text size="xs" fw={500} mb={6} c="dimmed">Selected</Text>
            <Group gap={4}>
              {singleSelectValues.map((value: string) => {
                const option = selectOptions.find((opt: any) => opt.value === value);
                if (!option) return null;
                return (
                  <Badge
                    key={value}
                    size="sm"
                    radius="md"
                    style={{
                      cursor: 'pointer',
                      ...getColorStyles(singleSelectOptionColors[option.label] || PILL_COLORS.default)
                    }}
                    styles={{
                      root: {
                        textTransform: 'none',
                        padding: '2.5px 5px',
                        fontSize: '10.5px'
                      }
                    }}
                    onClick={() => {
                      const newValues = singleSelectValues.filter((v: string) => v !== value);
                      handleFilterChange(header.column.id, newValues.length > 0 ? newValues : null);
                    }}
                  >
                    {option.label}
                  </Badge>
                );
              })}
            </Group>
          </Box>
        )}

        <TextInput
          placeholder="Search options..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          size="xs"
          mb="xs"
          leftSection={<IconSearch size={14} />}
          styles={{
            input: {
              minHeight: '28px'
            }
          }}
        />
        
        <Box style={{ maxHeight: '250px', overflowY: 'auto' }}>
          {filteredSelectOptions.map((option: any) => {
            const isSelected = singleSelectValues.includes(option.value);
            return (
              <Box key={option.value} mb={2}>
                <Badge
                  size="sm"
                  radius="md"
                  style={{
                    cursor: 'pointer',
                    opacity: isSelected ? 1 : 0.7,
                    ...getColorStyles(singleSelectOptionColors[option.label] || PILL_COLORS.default)
                  }}
                  styles={{
                    root: {
                      textTransform: 'none',
                      padding: '2.5px 5px',
                      fontSize: '10.5px',
                      transition: 'opacity 0.1s ease'
                    }
                  }}
                  onClick={() => {
                    const newValues = isSelected
                      ? singleSelectValues.filter((v: string) => v !== option.value)
                      : [...singleSelectValues, option.value];
                    handleFilterChange(header.column.id, newValues.length > 0 ? newValues : null);
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.opacity = '1';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.opacity = isSelected ? '1' : '0.7';
                  }}
                >
                  {option.label}
                </Badge>
              </Box>
            );
          })}
        </Box>
      </Box>
    );
  };

  // Component for text filter with multi-term support
  const TextFilter = ({ header, currentFilterValue }: any) => {
    const columnId = header.column.id;
    
      // Columns that support AND/OR toggle
      const supportsAndOr = ['genres', 'styles', 'musicians'].includes(columnId);
      
      // Filter mode state (AND or OR) - default to OR
      const [filterMode, setFilterMode] = React.useState<'AND' | 'OR'>('OR');
    
    // Initialize pills from saved filter (can be array or object with mode)
    const [filterTerms, setFilterTerms] = React.useState<string[]>(() => {
      if (currentFilterValue) {
        // New format: { terms: string[], mode: 'AND' | 'OR' }
        if (typeof currentFilterValue === 'object' && 'terms' in currentFilterValue) {
          console.log('🔄 Initializing filterTerms from saved filters (with mode):', currentFilterValue);
          setFilterMode(currentFilterValue.mode || 'OR');
          return currentFilterValue.terms || [];
        }
        // Old format: string[]
        if (Array.isArray(currentFilterValue) && currentFilterValue.length > 0) {
          console.log('🔄 Initializing filterTerms from saved filters (array):', currentFilterValue);
          return currentFilterValue;
        }
      }
      return [];
    });
    
    // Local input for typing - does NOT trigger table filter
    const [inputValue, setInputValue] = React.useState('');

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      setInputValue(e.target.value);
      // NO filter update here - only when Enter/checkmark is pressed
    };

    const handleAddTerm = () => {
      if (inputValue.trim() && !filterTerms.includes(inputValue.trim())) {
        console.log('✅ Adding term to pills:', inputValue.trim());
        const newTerms = [...filterTerms, inputValue.trim()];
        console.log('📋 All filter terms:', newTerms);
        setFilterTerms(newTerms);
        setInputValue('');
        // Update table filter with all pills and mode (if applicable)
        if (supportsAndOr) {
          handleFilterChange(columnId, { terms: newTerms, mode: filterMode });
        } else {
          handleFilterChange(columnId, newTerms);
        }
      }
    };

    const handleRemoveTerm = (term: string) => {
      console.log('❌ Removing term from pills:', term);
      const newTerms = filterTerms.filter(t => t !== term);
      setFilterTerms(newTerms);
      // Update table filter
      if (newTerms.length > 0) {
        if (supportsAndOr) {
          handleFilterChange(columnId, { terms: newTerms, mode: filterMode });
        } else {
          handleFilterChange(columnId, newTerms);
        }
      } else {
        handleFilterChange(columnId, undefined);
      }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleAddTerm();
      }
    };

    return (
      <Box>
        {/* Stored filter terms (pills) at the top */}
        {filterTerms.length > 0 && (
          <Box mb="xs" pb="xs" style={{ borderBottom: '1px solid var(--mantine-color-dark-4)' }}>
            <Group gap={4}>
              {filterTerms.map((term) => (
                <Badge
                  key={term}
                  size="sm"
                  radius="md"
                  style={{
                    cursor: 'pointer',
                    backgroundColor: 'rgba(55, 123, 206, 0.15)',
                    color: 'rgb(91, 169, 255)',
                    border: 'none'
                  }}
                  styles={{
                    root: {
                      textTransform: 'none',
                      padding: '2.5px 5px',
                      fontSize: '10.5px'
                    }
                  }}
                  onClick={() => handleRemoveTerm(term)}
                >
                  {term}
                </Badge>
              ))}
            </Group>
          </Box>
        )}

        <Group gap={4} align="center" wrap="nowrap">
          <TextInput
            placeholder="Filter..."
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            size="xs"
            leftSection={<IconSearch size={14} />}
            styles={{
              root: { flex: 1 },
              input: {
                minHeight: '28px'
              }
            }}
          />
          {inputValue.trim() && (
            <ActionIcon
              size="sm"
              variant="subtle"
              color="green"
              onClick={handleAddTerm}
              style={{ flexShrink: 0 }}
            >
              <IconCheck size={16} />
            </ActionIcon>
          )}
          {supportsAndOr && filterTerms.length > 0 && (
            <Box
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '1px',
                flexShrink: 0,
                width: '32px',
                height: '28px'
              }}
            >
              <Badge
                size="sm"
                radius="sm"
                style={{
                  cursor: 'pointer',
                  backgroundColor: filterMode === 'AND' ? 'rgba(68, 131, 97, 0.25)' : 'rgba(128, 128, 128, 0.15)',
                  color: filterMode === 'AND' ? 'rgb(115, 184, 148)' : 'rgb(160, 160, 160)',
                  border: `1px solid ${filterMode === 'AND' ? 'rgba(68, 131, 97, 0.5)' : 'rgba(128, 128, 128, 0.2)'}`,
                  transition: 'all 0.15s ease',
                  width: '100%',
                  height: '13px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
                styles={{
                  root: {
                    textTransform: 'none',
                    padding: '0',
                    fontSize: '8px',
                    fontWeight: filterMode === 'AND' ? 700 : 500,
                    letterSpacing: '0.5px',
                    lineHeight: '1'
                  }
                }}
                onClick={() => {
                  if (filterMode !== 'AND') {
                    setFilterMode('AND');
                    if (filterTerms.length > 0) {
                      handleFilterChange(columnId, { terms: filterTerms, mode: 'AND' });
                    }
                  }
                }}
                onMouseEnter={(e) => {
                  if (filterMode !== 'AND') {
                    e.currentTarget.style.backgroundColor = 'rgba(128, 128, 128, 0.25)';
                    e.currentTarget.style.borderColor = 'rgba(128, 128, 128, 0.35)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (filterMode !== 'AND') {
                    e.currentTarget.style.backgroundColor = 'rgba(128, 128, 128, 0.15)';
                    e.currentTarget.style.borderColor = 'rgba(128, 128, 128, 0.2)';
                  }
                }}
              >
                AND
              </Badge>
              <Badge
                size="sm"
                radius="sm"
                style={{
                  cursor: 'pointer',
                  backgroundColor: filterMode === 'OR' ? 'rgba(217, 115, 13, 0.25)' : 'rgba(128, 128, 128, 0.15)',
                  color: filterMode === 'OR' ? 'rgb(255, 169, 91)' : 'rgb(160, 160, 160)',
                  border: `1px solid ${filterMode === 'OR' ? 'rgba(217, 115, 13, 0.5)' : 'rgba(128, 128, 128, 0.2)'}`,
                  transition: 'all 0.15s ease',
                  width: '100%',
                  height: '13px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
                styles={{
                  root: {
                    textTransform: 'none',
                    padding: '0',
                    fontSize: '8px',
                    fontWeight: filterMode === 'OR' ? 700 : 500,
                    letterSpacing: '0.5px',
                    lineHeight: '1'
                  }
                }}
                onClick={() => {
                  if (filterMode !== 'OR') {
                    setFilterMode('OR');
                    if (filterTerms.length > 0) {
                      handleFilterChange(columnId, { terms: filterTerms, mode: 'OR' });
                    }
                  }
                }}
                onMouseEnter={(e) => {
                  if (filterMode !== 'OR') {
                    e.currentTarget.style.backgroundColor = 'rgba(128, 128, 128, 0.25)';
                    e.currentTarget.style.borderColor = 'rgba(128, 128, 128, 0.35)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (filterMode !== 'OR') {
                    e.currentTarget.style.backgroundColor = 'rgba(128, 128, 128, 0.15)';
                    e.currentTarget.style.borderColor = 'rgba(128, 128, 128, 0.2)';
                  }
                }}
              >
                OR
              </Badge>
            </Box>
          )}
        </Group>
      </Box>
    );
  };

  // Component for multi-select filter with hooks
  const MultiSelectFilter = ({ header, multiSelectOptions, optionColors, selectedMultiValues }: any) => {
    const [multiSearchQuery, setMultiSearchQuery] = React.useState('');
    const filteredMultiOptions = multiSelectOptions.filter((opt: any) => 
      opt.label.toLowerCase().includes(multiSearchQuery.toLowerCase()) && !selectedMultiValues.includes(opt.value)
    );

    return (
      <Box>
        {/* Selected options at the top */}
        {selectedMultiValues.length > 0 && (
          <Box mb="xs" pb="xs" style={{ borderBottom: '1px solid var(--mantine-color-dark-4)' }}>
            <Text size="xs" fw={500} mb={6} c="dimmed">Selected</Text>
            <Group gap={4}>
              {selectedMultiValues.map((value: string) => {
                const option = multiSelectOptions.find((opt: any) => opt.value === value);
                if (!option) return null;
                return (
                  <Badge
                    key={value}
                    size="sm"
                    radius="md"
                    style={{
                      cursor: 'pointer',
                      ...getColorStyles(optionColors[value] || PILL_COLORS.default)
                    }}
                    styles={{
                      root: {
                        textTransform: 'none',
                        padding: '2.5px 5px',
                        fontSize: '10.5px'
                      }
                    }}
                    onClick={() => {
                      const newValues = selectedMultiValues.filter((v: string) => v !== value);
                      handleFilterChange(header.column.id, newValues.length > 0 ? newValues : null);
                    }}
                  >
                    {option.label}
                  </Badge>
                );
              })}
            </Group>
          </Box>
        )}

        <TextInput
          placeholder="Search options..."
          value={multiSearchQuery}
          onChange={(e) => setMultiSearchQuery(e.target.value)}
          size="xs"
          mb="xs"
          leftSection={<IconSearch size={14} />}
          styles={{
            input: {
              minHeight: '28px'
            }
          }}
        />
        
        <Box style={{ maxHeight: '250px', overflowY: 'auto' }}>
          {filteredMultiOptions.map((option: any) => {
            const isSelected = selectedMultiValues.includes(option.value);
            return (
              <Box key={option.value} mb={2}>
                <Badge
                  size="sm"
                  radius="md"
                  style={{
                    cursor: 'pointer',
                    opacity: isSelected ? 1 : 0.7,
                    ...getColorStyles(optionColors[option.value] || PILL_COLORS.default)
                  }}
                  styles={{
                    root: {
                      textTransform: 'none',
                      padding: '2.5px 5px',
                      fontSize: '10.5px',
                      transition: 'opacity 0.1s ease'
                    }
                  }}
                  onClick={() => {
                    const newValues = isSelected
                      ? selectedMultiValues.filter((v: string) => v !== option.value)
                      : [...selectedMultiValues, option.value];
                    handleFilterChange(header.column.id, newValues.length > 0 ? newValues : null);
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.opacity = '1';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.opacity = isSelected ? '1' : '0.7';
                  }}
                >
                  {option.label}
                </Badge>
              </Box>
            );
          })}
        </Box>
      </Box>
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
        const numberValue = (currentFilter?.value || {}) as { min?: number; max?: number; includeEmpty?: boolean };
        const includeEmpty = numberValue.includeEmpty ?? true; // Default to true (checked)
        return (
          <Box>
            <Group gap="xs" mb="xs">
              <TextInput
                placeholder="Min"
                type="number"
                value={numberValue.min ?? ''}
                onChange={(e) => {
                  const min = e.target.value ? Number(e.target.value) : undefined;
                  const max = numberValue.max;
                  applyLocalFilter(header.column.id, { min, max, includeEmpty });
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
                  applyLocalFilter(header.column.id, { min, max, includeEmpty });
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
            <Checkbox
              label="Include empty values"
              size="xs"
              checked={includeEmpty}
              onChange={(e) => {
                const newIncludeEmpty = e.currentTarget.checked;
                applyLocalFilter(header.column.id, { 
                  min: numberValue.min, 
                  max: numberValue.max, 
                  includeEmpty: newIncludeEmpty 
                });
              }}
              styles={{
                label: { fontSize: '11px', cursor: 'pointer' }
              }}
            />
          </Box>
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

        // Get option colors from column meta if available
        const singleSelectOptionColors = (header.column.columnDef.meta as any)?.option_colors || {};

        console.log('Single-select setup:', {
          columnId: header.column.id,
          labelToValueMap,
          valueToLabelMap,
          selectOptions,
          currentFilter,
          singleSelectOptionColors
        });

        const singleSelectValues = Array.isArray(currentFilter?.value) 
          ? currentFilter.value 
          : (currentFilter?.value ? [currentFilter.value as string] : []);

        return (
          <SingleSelectFilter
            header={header}
            selectOptions={selectOptions}
            singleSelectOptionColors={singleSelectOptionColors}
            singleSelectValues={singleSelectValues}
          />
        );

      case 'multi-select':
        const multiSelectOptions = (column.filter.options || []).map((opt: string) => ({
          value: opt,
          label: opt
        }));
        
        // Get option colors from column meta if available
        const optionColors = (header.column.columnDef.meta as any)?.option_colors || {};
        const selectedMultiValues = (currentFilter?.value as string[]) || [];
        
        console.log(`Rendering multi-select for ${header.column.id}:`, {
          options: multiSelectOptions,
          currentValue: currentFilter?.value,
          columnFilter: column.filter,
          columnMeta: column.meta,
          optionColors
        });
        
        return (
          <MultiSelectFilter
            header={header}
            multiSelectOptions={multiSelectOptions}
            optionColors={optionColors}
            selectedMultiValues={selectedMultiValues}
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
          <TextFilter
            key={`text-filter-${header.column.id}`}
            header={header}
            currentFilterValue={currentFilter?.value}
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
                      data-column-id={header.column.id}
                      style={{
                        width: header.getSize(),
                        position: 'sticky',
                        top: 0,
                        zIndex: 10,
                        backgroundColor: draggedColumn === header.column.id 
                          ? 'var(--mantine-color-dark-5)' 
                          : 'var(--mantine-color-dark-7)',
                        userSelect: 'none',
                        height: `${columnHeaderHeight}px`,
                        maxHeight: `${columnHeaderHeight}px`,
                        opacity: draggedColumn === header.column.id ? 0.5 : 1,
                        transition: 'background-color 0.2s, opacity 0.2s',
                        boxShadow: dragOverColumn === header.column.id && draggedColumn !== header.column.id
                          ? 'inset 0 0 0 2px var(--mantine-color-blue-5)'
                          : 'none'
                      }}
                    >
                      {header.isPlaceholder ? null : (
                        <div
                          draggable
                          onDragStart={(e) => {
                            // Only start drag if not clicking on resize handle
                            const target = e.target as HTMLElement;
                            if (target.classList.contains('resizer') || target.closest('.resizer')) {
                              e.preventDefault();
                              return;
                            }
                            setDraggedColumn(header.column.id);
                          }}
                          onDragOver={(e) => {
                            e.preventDefault();
                            setDragOverColumn(header.column.id);
                          }}
                          onDragLeave={() => {
                            setDragOverColumn(null);
                          }}
                          onDrop={() => {
                            if (draggedColumn && draggedColumn !== header.column.id) {
                              const newOrder = [...table.getAllLeafColumns().map(c => c.id)];
                              const draggedIdx = newOrder.indexOf(draggedColumn);
                              const targetIdx = newOrder.indexOf(header.column.id);
                              
                              // Remove dragged column and insert at target position
                              newOrder.splice(draggedIdx, 1);
                              newOrder.splice(targetIdx, 0, draggedColumn);
                              
                              setColumnOrder(newOrder);
                            }
                            setDraggedColumn(null);
                            setDragOverColumn(null);
                          }}
                          onDragEnd={() => {
                            setDraggedColumn(null);
                            setDragOverColumn(null);
                          }}
                          onTouchStart={(e) => {
                            // Only start drag if not touching resize handle, filter button, or popover
                            const target = e.target as HTMLElement;
                            if (target.classList.contains('resizer') || target.closest('.resizer') || 
                                target.closest('[data-filter-button]') || target.closest('[role="button"]') ||
                                target.closest('.mantine-ActionIcon-root') || target.closest('.mantine-Popover-target')) {
                              return;
                            }
                            setDraggedColumn(header.column.id);
                          }}
                          onTouchMove={(e) => {
                            if (!draggedColumn) return;
                            // Only prevent default when actively dragging
                            e.preventDefault();
                            const touch = e.touches[0];
                            const element = document.elementFromPoint(touch.clientX, touch.clientY);
                            const headerCell = element?.closest('[data-column-id]');
                            if (headerCell) {
                              const columnId = headerCell.getAttribute('data-column-id');
                              if (columnId && columnId !== draggedColumn) {
                                setDragOverColumn(columnId);
                              }
                            }
                          }}
                          onTouchEnd={() => {
                            if (draggedColumn && dragOverColumn && draggedColumn !== dragOverColumn) {
                              const newOrder = [...table.getAllLeafColumns().map(c => c.id)];
                              const draggedIdx = newOrder.indexOf(draggedColumn);
                              const targetIdx = newOrder.indexOf(dragOverColumn);
                              
                              // Remove dragged column and insert at target position
                              newOrder.splice(draggedIdx, 1);
                              newOrder.splice(targetIdx, 0, draggedColumn);
                              
                              setColumnOrder(newOrder);
                            }
                            setDraggedColumn(null);
                            setDragOverColumn(null);
                          }}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            cursor: header.column.getCanSort() ? 'pointer' : 'move',
                            position: 'relative',
                            width: '100%',
                            height: '32px',
                            maxHeight: '32px'
                          }}
                          onClick={header.column.getToggleSortingHandler()}
                        >
                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            flex: 1,
                            minWidth: 0
                          }}>
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
                          {header.column.getCanFilter() && (
                            <Box
                              data-filter-button="true"
                              onClick={(e) => {
                                e.stopPropagation();
                              }}
                              style={{ 
                                display: 'flex',
                                alignItems: 'center',
                                marginLeft: '8px',
                                flexShrink: 0
                              }}
                            >
                              <Popover width="min(280px, 90vw)" position="bottom" shadow="md" withinPortal closeOnClickOutside>
                                <Popover.Target>
                                  <ActionIcon
                                    size="xs"
                                    variant="subtle"
                                    color={table.getState().columnFilters.find(f => f.id === header.column.id) ? 'blue' : 'gray'}
                                    data-filter-button="true"
                                  >
                                    <IconFilter size={14} />
                                  </ActionIcon>
                                </Popover.Target>
                                <Popover.Dropdown p={10}>
                                  {renderFilterInput(header)}
                                </Popover.Dropdown>
                              </Popover>
                            </Box>
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

