import { useState, useMemo } from 'react';
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
  FilterFn
} from '@tanstack/react-table';
import { Table, Box, Text, LoadingOverlay, Group, Pagination, TextInput, Select, MultiSelect } from '@mantine/core';
import { useLocalStorage } from '@mantine/hooks';
import { IconSearch } from '@tabler/icons-react';

// Define filter types
type FilterType = 'text' | 'select' | 'multi';

interface ColumnFilter {
  type: FilterType;
  options?: string[];
}

interface ResizableTableProps<T> {
  data: T[];
  columns: (ColumnDef<T> & { filter?: ColumnFilter })[];
  sortState?: SortingState;
  onSortChange?: OnChangeFn<SortingState>;
  tableId: string;
  loading?: boolean;
  totalRecords: number;
  recordsPerPage: number;
  page: number;
  onPageChange: (page: number) => void;
}

// Custom filter function that handles arrays and different filter types
const arrayFilter: FilterFn<any> = (
  row: { getValue: (columnId: string) => any },
  columnId: string,
  filterValue: string | string[]
) => {
  const value = row.getValue(columnId);
  if (!filterValue || (Array.isArray(filterValue) && filterValue.length === 0)) return true;
  
  // Handle array values (like genres, styles, musicians)
  if (Array.isArray(value)) {
    if (Array.isArray(filterValue)) {
      // Multi-select: check if any selected values match
      return filterValue.some(filter => 
        value.some(item => String(item).toLowerCase().includes(filter.toLowerCase()))
      );
    }
    return value.some(item => 
      String(item).toLowerCase().includes(String(filterValue).toLowerCase())
    );
  }
  
  // Handle single values
  if (Array.isArray(filterValue)) {
    return filterValue.some(filter => 
      String(value).toLowerCase().includes(filter.toLowerCase())
    );
  }
  return String(value).toLowerCase().includes(String(filterValue).toLowerCase());
};

export function ResizableTable<T>({ 
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
  const [columnFilters, setColumnFilters] = useState<Record<string, string | string[]>>({});

  // Generate unique filter options for select filters
  const filterOptions = useMemo(() => {
    const options: Record<string, Set<string>> = {};
    
    columns.forEach(column => {
      if (column.filter?.type === 'select' || column.filter?.type === 'multi') {
        const columnId = String(column.accessorKey || column.id);
        options[columnId] = new Set<string>();
        
        data.forEach(row => {
          const value = row[columnId as keyof T];
          if (Array.isArray(value)) {
            value.forEach(v => options[columnId].add(String(v)));
          } else if (value) {
            options[columnId].add(String(value));
          }
        });
      }
    });
    
    return Object.fromEntries(
      Object.entries(options).map(([key, set]) => [
        key,
        Array.from(set).sort().map(value => ({ value, label: value }))
      ])
    );
  }, [data, columns]);

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting: sortState,
      columnSizing,
      columnFilters: Object.entries(columnFilters).map(([id, value]) => ({
        id,
        value: value || ''
      }))
    },
    columnResizeMode,
    onSortingChange: onSortChange,
    onColumnSizingChange: setColumnSizing,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    filterFns: {
      array: arrayFilter
    },
    defaultColumn: {
      minSize: 50,
      size: 150,
      maxSize: 1000,
      filterFn: 'array'
    }
  });

  const handleFilterChange = (columnId: string, value: string | string[]) => {
    setColumnFilters(prev => ({
      ...prev,
      [columnId]: value
    }));
  };

  const renderFilterInput = (header: Header<T, unknown>) => {
    const column = columns.find(col => 
      String(col.accessorKey || col.id) === header.column.id
    );
    
    if (!column?.filter) return null;

    const currentValue = columnFilters[header.column.id];
    
    switch (column.filter.type) {
      case 'select':
        return (
          <Select
            placeholder="Filter..."
            value={currentValue as string || ''}
            onChange={(value) => handleFilterChange(header.column.id, value || '')}
            data={filterOptions[header.column.id] || []}
            clearable
            size="xs"
            styles={{
              input: {
                minHeight: '28px'
              }
            }}
          />
        );
      case 'multi':
        return (
          <MultiSelect
            placeholder="Filter..."
            value={Array.isArray(currentValue) ? currentValue : []}
            onChange={(value) => handleFilterChange(header.column.id, value)}
            data={filterOptions[header.column.id] || []}
            clearable
            size="xs"
            styles={{
              input: {
                minHeight: '28px'
              }
            }}
          />
        );
      default:
        return (
          <TextInput
            placeholder="Filter..."
            value={currentValue as string || ''}
            onChange={(e) => handleFilterChange(header.column.id, e.target.value)}
            size="xs"
            leftSection={<IconSearch size={14} />}
            styles={{
              input: {
                minHeight: '28px',
                '&::placeholder': {
                  color: 'var(--mantine-color-dark-2)'
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
          lineHeight: '32px'
        }}
        styles={{
          table: {
            tableLayout: 'fixed',
            width: '100%',
            minWidth: '100%'
          },
          thead: {
            height: 'auto',
            width: '100%'
          },
          tbody: {
            width: '100%',
            '& tr': {
              height: '32px',
              width: '100%'
            }
          },
          tr: {
            height: '32px',
            '&:hover': {
              height: '32px'
            }
          },
          td: {
            height: '32px',
            maxHeight: '32px',
            padding: '0 8px',
            borderRight: '1px solid var(--mantine-color-dark-4)',
            '&:last-child': {
              borderRight: 'none'
            },
            '& > div': {
              height: '32px',
              maxHeight: '32px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              display: 'flex',
              alignItems: 'center'
            }
          },
          th: {
            padding: '8px',
            borderRight: '1px solid var(--mantine-color-dark-4)',
            '&:last-child': {
              borderRight: 'none'
            }
          }
        }}
      >
        <Table.Thead>
          {table.getHeaderGroups().map((headerGroup: HeaderGroup<T>) => (
            <>
              <Table.Tr key={`${headerGroup.id}-headers`}>
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
                        {...{
                          style: {
                            display: 'flex',
                            alignItems: 'center',
                            cursor: header.column.getCanSort() ? 'pointer' : 'default'
                          },
                          onClick: header.column.getToggleSortingHandler()
                        }}
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
                          transition: 'opacity 0.2s'
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
              <Table.Tr key={`${headerGroup.id}-filters`}>
                {headerGroup.headers.map((header: Header<T, unknown>) => (
                  <Table.Th
                    key={`${header.id}-filter`}
                    colSpan={header.colSpan}
                    style={{
                      width: header.getSize(),
                      padding: '4px 8px'
                    }}
                  >
                    {!header.isPlaceholder && header.column.getCanFilter() && renderFilterInput(header)}
                  </Table.Th>
                ))}
              </Table.Tr>
            </>
          ))}
        </Table.Thead>
        <Table.Tbody>
          {table.getRowModel().rows.map((row: Row<T>) => (
            <Table.Tr key={row.id} style={{ height: '32px', maxHeight: '32px' }}>
              {row.getVisibleCells().map((cell: Cell<T, unknown>) => (
                <Table.Td
                  key={cell.id}
                  style={{
                    width: cell.column.getSize(),
                    maxWidth: cell.column.getSize(),
                    height: '32px',
                    maxHeight: '32px',
                    overflow: 'hidden'
                  }}
                >
                  <div style={{ 
                    height: '32px', 
                    maxHeight: '32px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    display: 'flex',
                    alignItems: 'center',
                    pointerEvents: 'none'
                  }}>
                    <div style={{ pointerEvents: 'auto' }}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </div>
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

