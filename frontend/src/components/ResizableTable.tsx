import { useState } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  ColumnDef,
  SortingState,
  ColumnResizeMode,
  Header,
  HeaderGroup,
  Row,
  Cell,
  OnChangeFn
} from '@tanstack/react-table';
import { Table, Box, Text, LoadingOverlay } from '@mantine/core';
import { useLocalStorage } from '@mantine/hooks';

interface ResizableTableProps<T> {
  data: T[];
  columns: ColumnDef<T>[];
  sortState?: SortingState;
  onSortChange?: OnChangeFn<SortingState>;
  tableId: string;  // Unique ID for storing column widths
  loading?: boolean;  // Add loading prop
}

export function ResizableTable<T>({ 
  data, 
  columns, 
  sortState, 
  onSortChange,
  tableId,
  loading = false  // Add loading prop with default value
}: ResizableTableProps<T>) {
  // Store column widths in localStorage
  const [columnSizing, setColumnSizing] = useLocalStorage<Record<string, number>>({
    key: `table-sizing-${tableId}`,
    defaultValue: {}
  });

  const [columnResizeMode] = useState<ColumnResizeMode>('onChange');

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting: sortState,
      columnSizing
    },
    columnResizeMode,
    onSortingChange: onSortChange,
    onColumnSizingChange: setColumnSizing,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    enableColumnResizing: true,
    defaultColumn: {
      minSize: 50,
      size: 150,
      maxSize: 1000
    }
  });

  return (
    <Box style={{ 
      overflow: 'auto',
      width: '100%',
      minWidth: '100%',
      position: 'relative'
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
            height: '32px',
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
              overflow: 'hidden'
            }
          }
        }}
      >
        <Table.Thead>
          {table.getHeaderGroups().map((headerGroup: HeaderGroup<T>) => (
            <Table.Tr key={headerGroup.id}>
              {headerGroup.headers.map((header: Header<T, unknown>) => (
                <Table.Th
                  key={header.id}
                  colSpan={header.colSpan}
                  style={{
                    width: header.getSize(),
                    position: 'relative',
                    userSelect: 'none',
                    height: '32px',
                    maxHeight: '32px'
                  }}
                >
                  {header.isPlaceholder ? null : (
                    <div
                      {...{
                        style: {
                          display: 'flex',
                          alignItems: 'center',
                          cursor: header.column.getCanSort() ? 'pointer' : 'default',
                          height: '32px',
                          maxHeight: '32px',
                          overflow: 'hidden'
                        },
                        onClick: header.column.getToggleSortingHandler()
                      }}
                    >
                      {flexRender(
                        header.column.columnDef.header,
                        header.getContext()
                      )}
                      {header.column.getCanSort() && (
                        <Text ml="xs" c="dimmed" style={{ lineHeight: '32px' }}>
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
    </Box>
  );
} 

