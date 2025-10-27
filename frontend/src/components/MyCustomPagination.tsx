import { Group, Button, Text, Stack } from '@mantine/core';
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react';

interface MyCustomPaginationProps {
  page: number;
  onChange: (page: number) => void;
  total: number;
  siblings?: number;
  boundaries?: number;
  recordsPerPage: number;
  totalRecords: number;
}

interface PaginationItem {
  type: 'page' | 'ellipsis' | 'first' | 'last';
  value: number;
  active: boolean;
}

function generatePaginationItems({ total, page, siblings = 1, boundaries = 1 }: {
  total: number;
  page: number;
  siblings?: number;
  boundaries?: number;
}): PaginationItem[] {
  const items: PaginationItem[] = [];

  // Add first control
  items.push({ type: 'first', value: 1, active: false });

  // Add pages
  for (let i = 1; i <= total; i++) {
    // Add left boundary pages
    if (i <= boundaries) {
      items.push({ type: 'page', value: i, active: i === page });
      continue;
    }

    // Add right boundary pages
    if (i > total - boundaries) {
      items.push({ type: 'page', value: i, active: i === page });
      continue;
    }

    // Add current page and siblings
    if (i >= page - siblings && i <= page + siblings) {
      items.push({ type: 'page', value: i, active: i === page });
      continue;
    }

    // Add ellipsis
    if (
      (i === boundaries + 1 && i < page - siblings) ||
      (i === total - boundaries && i > page + siblings)
    ) {
      items.push({ type: 'ellipsis', value: i, active: false });
    }
  }

  // Add last control
  items.push({ type: 'last', value: total, active: false });

  return items;
}

export function MyCustomPagination({
  page,
  onChange,
  total,
  siblings = 1,
  boundaries = 1,
  recordsPerPage,
  totalRecords
}: MyCustomPaginationProps) {
  const items = generatePaginationItems({ total, page, siblings, boundaries });

  // Calculate the range of records being shown
  const start = ((page - 1) * recordsPerPage) + 1;
  const end = Math.min(page * recordsPerPage, totalRecords);

  return (
    <Stack align="center" gap={4}>
      <Group gap={4} justify="center">
        <Button
          variant="subtle"
          size="sm"
          px="xs"
          onClick={() => onChange(Math.max(1, page - 1))}
        >
          <IconChevronLeft size={16} />
        </Button>

        {items.map((item: PaginationItem, index: number) => {
          if (item.type === 'ellipsis') {
            return (
              <Text key={index} size="sm" c="dimmed" w={30} ta="center">
                …
              </Text>
            );
          }

          if (item.type === 'page') {
            return (
              <Button
                key={index}
                variant={item.active ? 'light' : 'subtle'}
                color={item.active ? 'blue' : 'gray'}
                size="sm"
                px="xs"
                onClick={() => onChange(item.value)}
              >
                {item.value}
              </Button>
            );
          }

          return null;  // Don't render first/last controls
        })}

        <Button
          variant="subtle"
          size="sm"
          px="xs"
          onClick={() => onChange(Math.min(total, page + 1))}
        >
          <IconChevronRight size={16} />
        </Button>
      </Group>
      <Text size="sm" c="dimmed">
        Showing {start}-{end} of {totalRecords} records
      </Text>
    </Stack>
  );
} 
