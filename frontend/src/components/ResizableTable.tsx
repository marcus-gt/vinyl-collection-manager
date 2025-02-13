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
import { Table, Box, Text, LoadingOverlay, Group, Pagination, TextInput } from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { useLocalStorage } from '@mantine/hooks';
import { IconSearch, IconCalendar } from '@tabler/icons-react';
import dayjs from 'dayjs';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore';
import isSameOrAfter from 'dayjs/plugin/isSameOrAfter';
import minMax from 'dayjs/plugin/minMax';
import type { DateValue } from '@mantine/dates';

// Initialize dayjs plugins
dayjs.extend(isSameOrBefore);
dayjs.extend(isSameOrAfter);
dayjs.extend(minMax);

// Define filter types
type FilterType = 'text' | 'dateRange';

interface ColumnFilter {
  type: FilterType;
}

// Extend ColumnDef to include our custom properties
type ExtendedColumnDef<T> = ColumnDef<T> & {
  filter?: ColumnFilter;
  accessorKey?: string;
};

interface DateRange {
  start: string;
  end: string;
}

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
  const [columnSizing, setColumnSizing] = useLocalStorage<Record<string, number>>({
    key: `table-sizing-${tableId}`,
    defaultValue: {}
  });

  const [columnResizeMode] = useState<ColumnResizeMode>('onChange');
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);

  const textFilter: FilterFn<T> = (row: Row<T>, columnId: string, value: any, _meta: any): boolean => {
    const cellValue = row.getValue(columnId);
    if (Array.isArray(cellValue)) {
      // For array values, check if any element includes the search text
      return cellValue.some(item => 
        String(item).toLowerCase().includes(String(value).toLowerCase())
      );
    }
    // For all other values, do a simple text search
    return String(cellValue).toLowerCase().includes(String(value).toLowerCase());
  };

  const dateFilter: FilterFn<T> = (row: Row<T>, columnId: string, value: any, _meta: any): boolean => {
    const cellValue = row.getValue(columnId);
    if (!cellValue || !value || !value.start || !value.end) return true;
    
    try {
      // Convert cell value to date at start of day
      const cellDate = dayjs(String(cellValue)).startOf('day');
      if (!cellDate.isValid()) return false;
      
      // Convert filter values to dates at start/end of day
      const startDate = dayjs(value.start).startOf('day');
      const endDate = dayjs(value.end).endOf('day');
      
      if (!startDate.isValid() || !endDate.isValid()) return false;
      
      // Check if cell date is within range (inclusive)
      return cellDate.isSameOrAfter(startDate) && cellDate.isSameOrBefore(endDate);
    } catch (e) {
      console.error('Error comparing dates:', e);
      return false;
    }
  };

  // Get min and max dates from the data for the date range limits
  const getDateRangeLimits = useMemo(() => {
    const dates = data
      .map(row => row.created_at)
      .filter(Boolean)
      .map(date => dayjs(date));
    
    if (dates.length === 0) return { minDate: null, maxDate: null };
    
    const minDate = dayjs.min(dates);
    const maxDate = dayjs.max(dates);
    
    if (!minDate || !maxDate || !minDate.isValid() || !maxDate.isValid()) {
      return { minDate: null, maxDate: null };
    }
    
    return {
      minDate: minDate.toDate(),
      maxDate: maxDate.toDate()
    };
  }, [data]);

  // Determine filter types for columns
  const columnsWithFilters = useMemo(() => {
    return columns.map(column => {
      // Get the column ID consistently
      const columnId = String(column.accessorKey || column.id);
      console.log('Adding filter to column:', columnId);
      
      // Use date range filter for the "added" column
      if (columnId === 'created_at') {
        return {
          ...column,
          id: columnId,
          enableColumnFilter: true,
          filterFn: dateFilter,
          filter: { type: 'dateRange' as const }
        };
      }
      
      // Default text filter for other columns
      return {
        ...column,
        id: columnId,
        enableColumnFilter: true,
        filterFn: textFilter,
        filter: { type: 'text' as const }
      };
    });
  }, [columns]);

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
      date: dateFilter
    } as Record<string, FilterFn<T>>,
    defaultColumn: {
      minSize: 50,
      size: 150,
      maxSize: 1000,
      enableColumnFilter: true,
      enableSorting: true
    }
  });

  const handleFilterChange = (columnId: string, value: string | DateRange) => {
    console.log('Filter change:', { columnId, value });
    
    setColumnFilters((prev: ColumnFiltersState) => {
      console.log('Previous filters:', prev);
      const existing = prev.filter((filter: { id: string }) => filter.id !== columnId);
      if (!value || (typeof value === 'string' && !value.length)) {
        console.log('Clearing filter for column:', columnId);
        return existing;
      }
      const newFilters = [...existing, { id: columnId, value }];
      console.log('New filters:', newFilters);
      return newFilters;
    });
  };

  const renderFilterInput = (header: Header<T, unknown>) => {
    const columnId = header.column.id;
    console.log('Rendering filter input for header:', columnId);

    // Check if filtering is enabled for this column
    if (!header.column.getCanFilter()) {
      console.log('Filtering disabled for column:', columnId);
      return null;
    }

    const currentFilter = table.getState().columnFilters.find(
      (filter: { id: string; value: any }) => filter.id === columnId
    );
    const currentValue = currentFilter?.value as string | DateRange;
    console.log('Current filter value:', { columnId, value: currentValue });

    // Find column configuration
    const column = columnsWithFilters.find(col => col.id === columnId);
    if (!column?.filter) return null;

    return (
      <Box 
        onClick={(e) => {
          console.log('Filter box clicked');
          e.stopPropagation();
        }}
        style={{ 
          position: 'relative',
          zIndex: 100,
          width: '100%'
        }}
      >
        {column.filter.type === 'dateRange' ? (
          <DatePickerInput
            type="range"
            placeholder="Filter by date range..."
            value={currentValue && typeof currentValue === 'object' ? [
              currentValue.start ? new Date(currentValue.start) : null,
              currentValue.end ? new Date(currentValue.end) : null
            ] : [null, null]}
            onChange={(dates: [Date | null, Date | null]) => {
              console.log('Date range filter change:', dates);
              handleFilterChange(columnId, dates?.[0] && dates?.[1] ? {
                start: dates[0].toISOString(),
                end: dates[1].toISOString()
              } : '');
            }}
            minDate={getDateRangeLimits.minDate || undefined}
            maxDate={getDateRangeLimits.maxDate || undefined}
            size="xs"
            leftSection={<IconCalendar size={14} />}
            clearable
            valueFormat="YYYY-MM-DD"
            allowSingleDateInRange={false}
            styles={{
              root: {
                width: '100%',
                position: 'relative',
                zIndex: 100
              },
              wrapper: {
                width: '100%'
              },
              input: {
                minHeight: '28px',
                width: '100%',
                '&::placeholder': {
                  color: 'var(--mantine-color-dark-2)'
                },
                '&:focus': {
                  zIndex: 101
                }
              }
            }}
          />
        ) : (
          <TextInput
            placeholder="Filter..."
            value={currentValue as string}
            onChange={(e) => {
              console.log('Filter input change:', e.target.value);
              handleFilterChange(columnId, e.target.value);
            }}
            onClick={(e) => {
              console.log('Filter input clicked');
              e.stopPropagation();
            }}
            size="xs"
            leftSection={<IconSearch size={14} />}
            styles={{
              root: {
                width: '100%',
                position: 'relative',
                zIndex: 100
              },
              wrapper: {
                width: '100%'
              },
              input: {
                minHeight: '28px',
                width: '100%',
                '&::placeholder': {
                  color: 'var(--mantine-color-dark-2)'
                },
                '&:focus': {
                  zIndex: 101
                }
              }
            }}
          />
        )}
      </Box>
    );
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

