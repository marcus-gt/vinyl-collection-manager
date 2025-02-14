import React, { useState, useMemo } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
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
import { Table, Box, Text, LoadingOverlay, Group, Pagination, TextInput, useMantineTheme, MultiSelect, Select } from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { useLocalStorage } from '@mantine/hooks';
import { IconSearch, IconCalendar } from '@tabler/icons-react';
import dayjs from 'dayjs';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore';
import isSameOrAfter from 'dayjs/plugin/isSameOrAfter';
import minMax from 'dayjs/plugin/minMax';

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

// Extend ColumnDef to include our custom properties
type ExtendedColumnDef<T> = ColumnDef<T> & {
  filter?: ColumnFilter;
  accessorKey?: string;
  meta?: {
    type?: 'text' | 'number' | 'single-select' | 'multi-select' | 'boolean';
    options?: string[];
  };
};

// Extend RowData to include created_at
interface BaseRowData {
  created_at?: string;
}

interface ResizableTableProps<T extends RowData & BaseRowData> {
  data: T[];
  columns: ExtendedColumnDef<T>[];
  sortState?: SortingState;
  onSortChange?: OnChangeFn<SortingState>;
  tableId: string;
  loading?: boolean;
  totalRecords: number;
  recordsPerPage: number;
  page: number;
  onPageChange: (page: number) => void;
}

export function ResizableTable<T extends RowData & BaseRowData>({ 
  data, 
  columns, 
  sortState, 
  onSortChange,
  tableId,
  loading = false,
  totalRecords,
  recordsPerPage,
  page,
  onPageChange
}: ResizableTableProps<T>) {
  const theme = useMantineTheme();
  const [columnSizing, setColumnSizing] = useLocalStorage<Record<string, number>>({
    key: `table-sizing-${tableId}`,
    defaultValue: {}
  });

  const [columnResizeMode] = useState<ColumnResizeMode>('onChange');
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);

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
    return columns.map(column => {
      const columnId = String(column.accessorKey || column.id);
      
      // Special case for created_at
      if (columnId === 'created_at') {
        return {
          ...column,
          id: columnId,
          enableColumnFilter: true,
          filterFn: dateRangeFilter,
          filter: { type: 'dateRange' as const }
        };
      }

      // Determine filter type based on column metadata
      let filterType: FilterType = 'text'; // Default to text
      if (column.meta?.type) {
        switch (column.meta.type) {
          case 'number':
            filterType = 'number';
            break;
          case 'single-select':
            filterType = 'single-select';
            break;
          case 'multi-select':
            filterType = 'multi-select';
            break;
          case 'boolean':
            filterType = 'boolean';
            break;
          default:
            filterType = 'text';
        }
      }

      // Get all unique values for select types
      let options: string[] = [];
      if (filterType === 'single-select' || filterType === 'multi-select') {
        const uniqueValues = new Set<string>();
        data.forEach(row => {
          const value = row[columnId as keyof T];
          if (Array.isArray(value)) {
            value.forEach((v: unknown) => uniqueValues.add(String(v)));
          } else if (value !== undefined && value !== null) {
            uniqueValues.add(String(value));
          }
        });
        options = Array.from(uniqueValues).sort();
      }

      return {
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
          options: options.length > 0 ? options : undefined
        }
      };
    });
  }, [columns, data]);

  const multiSelectFilter: FilterFn<T> = (
    row: Row<T>,
    columnId: string,
    value: string[]
  ): boolean => {
    if (!value || value.length === 0) return true;
    const cellValue = row.getValue(columnId);
    if (!cellValue) return false;
    
    // Handle array values
    if (Array.isArray(cellValue)) {
      return value.some(filterValue => cellValue.includes(filterValue));
    }
    // Handle single values
    return value.includes(String(cellValue));
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
    value: string
  ): boolean => {
    if (!value) return true;
    const cellValue = row.getValue(columnId);
    return String(cellValue) === value;
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

  const table = useReactTable({
    data,
    columns: columnsWithFilters,
    state: {
      sorting: sortState,
      columnSizing,
      columnFilters
    },
    columnResizeMode,
    onSortingChange: onSortChange,
    onColumnSizingChange: setColumnSizing,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    enableColumnFilters: true,
    manualFiltering: false,
    filterFns: {
      text: textFilter,
      dateRange: dateRangeFilter,
      'multi-select': multiSelectFilter
    } as Record<string, FilterFn<T>>,
    defaultColumn: {
      minSize: 50,
      size: 150,
      maxSize: 1000,
      enableColumnFilter: true,
      enableSorting: true
    }
  });

  const handleFilterChange = (columnId: string, value: any) => {
    setColumnFilters((prev: ColumnFiltersState) => {
      const existing = prev.filter((filter: { id: string }) => filter.id !== columnId);
      if (value == null || (typeof value === 'string' && !value)) {
        return existing;
      }
      return [...existing, { id: columnId, value }];
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
              handleFilterChange(header.column.id, undefined);
            } else {
              handleFilterChange(header.column.id, newValue);
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
              handleFilterChange(header.column.id, undefined);
            } else {
              handleFilterChange(header.column.id, newValue);
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
                handleFilterChange(header.column.id, { min, max });
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
                handleFilterChange(header.column.id, { min, max });
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
        return (
          <Select
            placeholder="Select..."
            value={(currentFilter?.value as string) || null}
            onChange={(value) => handleFilterChange(header.column.id, value)}
            data={column.filter.options?.map((opt: string) => ({ value: opt, label: opt })) || []}
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
        return (
          <MultiSelect
            placeholder="Select options..."
            value={(currentFilter?.value as string[]) || []}
            onChange={(value) => handleFilterChange(header.column.id, value)}
            data={column.filter.options?.map((opt: string) => ({ value: opt, label: opt })) || []}
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

  return (
    <Box style={{ 
      overflow: 'auto',
      width: '100%',
      minWidth: '100%',
      position: 'relative',
      display: 'flex',
      flexDirection: 'column',
      gap: '1rem'
    }}>
      <LoadingOverlay visible={loading} />
      <Table
        striped
        highlightOnHover
        style={{
          width: '100%',
          minWidth: Math.max(table.getCenterTotalSize(), 1200),
          borderCollapse: 'separate',
          borderSpacing: 0,
          lineHeight: '32px',
          position: 'relative'
        }}
        styles={{
          table: {
            tableLayout: 'fixed',
            width: '100%',
            minWidth: '100%'
          },
          thead: {
            height: 'auto',
            width: '100%',
            position: 'relative',
            zIndex: 10
          },
          tbody: {
            width: '100%',
            position: 'relative',
            zIndex: 1
          },
          tr: {
            height: '32px',
            position: 'relative'
          },
          td: {
            height: '32px',
            maxHeight: '32px',
            padding: '0 8px',
            borderRight: '1px solid var(--mantine-color-dark-4)',
            '&:last-child': {
              borderRight: 'none'
            }
          },
          th: {
            padding: '8px',
            borderRight: '1px solid var(--mantine-color-dark-4)',
            position: 'relative',
            '&:last-child': {
              borderRight: 'none'
            }
          }
        }}
      >
        <Table.Thead>
          {table.getHeaderGroups().map((headerGroup: HeaderGroup<T>) => (
            <React.Fragment key={headerGroup.id}>
              <Table.Tr>
                {headerGroup.headers.map((header: Header<T, unknown>) => (
                  <Table.Th
                    key={header.id}
                    colSpan={header.colSpan}
                    style={{
                      width: header.getSize(),
                      position: 'relative',
                      userSelect: 'none'
                    }}
                  >
                    {header.isPlaceholder ? null : (
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          cursor: header.column.getCanSort() ? 'pointer' : 'default',
                          position: 'relative'
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
              <Table.Tr>
                {headerGroup.headers.map((header: Header<T, unknown>) => (
                  <Table.Th
                    key={`${header.id}-filter`}
                    colSpan={header.colSpan}
                    style={{
                      width: header.getSize(),
                      padding: '4px 8px',
                      position: 'relative'
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
          {table.getRowModel().rows.map((row: Row<T>) => (
            <Table.Tr key={row.id}>
              {row.getVisibleCells().map((cell: Cell<T, unknown>) => (
                <Table.Td
                  key={cell.id}
                  style={{
                    width: cell.column.getSize(),
                    maxWidth: cell.column.getSize(),
                    overflow: 'hidden'
                  }}
                >
                  <div style={{ 
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </div>
                </Table.Td>
              ))}
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
      {totalRecords > recordsPerPage && (
        <Group justify="center" mt="md">
          <Pagination
            value={page}
            onChange={onPageChange}
            total={Math.ceil(totalRecords / recordsPerPage)}
            siblings={0}
            boundaries={0}
            withEdges
            getControlProps={(control) => {
              if (control === 'first' || control === 'last') {
                return {
                  style: {
                    '@media (max-width: 600px)': {
                      display: 'none'
                    }
                  }
                };
              }
              return {};
            }}
            styles={{
              control: {
                '@media (max-width: 600px)': {
                  minWidth: '32px',
                  height: '32px',
                  padding: 0
                }
              }
            }}
          />
        </Group>
      )}
    </Box>
  );
} 

