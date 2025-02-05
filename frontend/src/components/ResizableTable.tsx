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
import { Table, Box, Text } from '@mantine/core';
import { useLocalStorage } from '@mantine/hooks';

interface ResizableTableProps<T> {
  data: T[];
  columns: ColumnDef<T>[];
  sortState?: SortingState;
  onSortChange?: OnChangeFn<SortingState>;
  tableId: string;  // Unique ID for storing column widths
}

export function ResizableTable<T>({ 
  data, 
  columns, 
  sortState, 
  onSortChange,
  tableId 
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
    <Box style={{ overflow: 'auto' }}>
      <Table
        striped
        highlightOnHover
        style={{
          width: table.getCenterTotalSize(),
          borderCollapse: 'separate',
          borderSpacing: 0
        }}
        styles={{
          td: {
            borderRight: '1px solid var(--mantine-color-dark-4)',
            '&:last-child': {
              borderRight: 'none'
            }
          },
          th: {
            borderRight: '1px solid var(--mantine-color-dark-4)',
            '&:last-child': {
              borderRight: 'none'
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
                    maxWidth: cell.column.getSize()
                  }}
                >
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </Table.Td>
              ))}
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Box>
  );
} 

