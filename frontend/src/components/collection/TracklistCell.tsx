import { useState } from 'react';
import { ActionIcon, Box, Group, Popover, Stack, Text } from '@mantine/core';
import { IconX } from '@tabler/icons-react';

// Tracklist cell with a popover (matches the Contributors column pattern).
export const TracklistCell = ({ tracklist }: { tracklist: any }) => {
  const [opened, setOpened] = useState(false);

  // Parse tracklist if it's a string (JSONB from database)
  let parsedTracklist = tracklist;
  if (typeof tracklist === 'string') {
    try {
      parsedTracklist = JSON.parse(tracklist);
    } catch (e) {
      parsedTracklist = [];
    }
  }

  // Format tracks for inline display: "A1: Title - Duration"
  const formatTrackInline = (t: any) => {
    const pos = t.position || '';
    const title = t.title || '';
    const duration = t.duration || '';
    return `${pos}${pos && title ? ': ' : ''}${title}${duration ? ` - ${duration}` : ''}`;
  };

  // Filter to only include tracks with positions (exclude section titles without positions)
  const tracks = Array.isArray(parsedTracklist)
    ? parsedTracklist.filter((t: any) => t.position && t.position.trim() && t.title)
    : [];
  const trackStrings = tracks.map(formatTrackInline);

  // Display value: show all tracks inline, let cell truncate naturally
  const displayValue = trackStrings.length > 0
    ? trackStrings.join(', ')
    : '-';

  // Group tracks by side (A, B, C, D, etc.)
  const groupedBySide = tracks.reduce((acc: any, track: any) => {
    const position = track.position || '';
    // Extract the letter from position (e.g., "A1" -> "A")
    const sideMatch = position.match(/^([A-Z])/);
    const side = sideMatch ? sideMatch[1] : 'Other';

    if (!acc[side]) {
      acc[side] = [];
    }
    acc[side].push(track);
    return acc;
  }, {});

  // Sort sides alphabetically
  const sortedSides = Object.keys(groupedBySide).sort();

  // Create structured display
  const structuredDisplay = sortedSides.length > 0 ? (
    <Stack gap="md">
      {sortedSides.map((side, sideIdx) => (
        <Box key={sideIdx}>
          <Text size="sm" fw={600} mb={6}>{side}-side</Text>
          <Stack gap={4}>
            {groupedBySide[side].map((track: any, trackIdx: number) => (
              <Text key={trackIdx} size="sm" ml="md">
                {formatTrackInline(track)}
              </Text>
            ))}
          </Stack>
        </Box>
      ))}
    </Stack>
  ) : null;

  return (
    <Box
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center'
      }}
      onClick={() => setOpened(true)}
    >
      <Popover width="min(500px, 90vw)" position="bottom" withArrow shadow="md" opened={opened} onChange={setOpened} withinPortal>
        <Popover.Target>
          <div style={{ width: '100%' }}>
            <Text size="sm" lineClamp={2} style={{ maxWidth: '90vw' }}>
              {displayValue}
            </Text>
          </div>
        </Popover.Target>
        <Popover.Dropdown>
          <Stack gap="xs">
            <Group justify="space-between" align="center">
              <Text size="sm" fw={500}>Tracklist</Text>
              <ActionIcon size="sm" variant="subtle" onClick={(e) => { e.stopPropagation(); setOpened(false); }}>
                <IconX size={16} />
              </ActionIcon>
            </Group>
            <Box style={{ maxHeight: '500px', overflowY: 'auto' }}>
              {structuredDisplay || <Text size="sm">{displayValue}</Text>}
            </Box>
          </Stack>
        </Popover.Dropdown>
      </Popover>
    </Box>
  );
};
