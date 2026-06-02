import { useEffect, useState } from 'react';
import { ActionIcon, Box, Button, Group, Popover, Stack, Text, TextInput } from '@mantine/core';
import { IconCheck, IconX } from '@tabler/icons-react';

export interface EditableDiscogsLinksProps {
  masterUrl: string | null;
  originalReleaseUrl: string | null;
  currentReleaseUrl: string | null;
  recordId: string;
  onUpdate: (recordId: string, updates: { master_url?: string | null; original_release_url?: string | null; current_release_url?: string | null }) => void;
}

export function EditableDiscogsLinks({
  masterUrl,
  originalReleaseUrl,
  currentReleaseUrl,
  recordId,
  onUpdate
}: EditableDiscogsLinksProps) {
  const [opened, setOpened] = useState(false);
  const [localMasterUrl, setLocalMasterUrl] = useState(masterUrl || '');
  const [localOriginalUrl, setLocalOriginalUrl] = useState(originalReleaseUrl || '');
  const [localCurrentUrl, setLocalCurrentUrl] = useState(currentReleaseUrl || '');
  const [masterError, setMasterError] = useState('');
  const [originalError, setOriginalError] = useState('');
  const [currentError, setCurrentError] = useState('');

  useEffect(() => {
    setLocalMasterUrl(masterUrl || '');
    setLocalOriginalUrl(originalReleaseUrl || '');
    setLocalCurrentUrl(currentReleaseUrl || '');
  }, [masterUrl, originalReleaseUrl, currentReleaseUrl]);

  const validateDiscogsUrl = (url: string, type: 'master' | 'release'): boolean => {
    if (!url) return true; // Empty is valid

    const masterPattern = /^https?:\/\/(www\.)?discogs\.com\/master\/\d+/;
    const releasePattern = /^https?:\/\/(www\.)?discogs\.com\/release\/\d+/;

    if (type === 'master') {
      return masterPattern.test(url);
    } else {
      return releasePattern.test(url);
    }
  };

  const hasChanges = localMasterUrl !== (masterUrl || '') ||
                     localOriginalUrl !== (originalReleaseUrl || '') ||
                     localCurrentUrl !== (currentReleaseUrl || '');

  const handleSave = async () => {
    // Validate URLs
    let hasErrors = false;

    if (localMasterUrl && !validateDiscogsUrl(localMasterUrl, 'master')) {
      setMasterError('Must be a valid Discogs master URL (e.g., https://www.discogs.com/master/123456)');
      hasErrors = true;
    } else {
      setMasterError('');
    }

    if (localOriginalUrl && !validateDiscogsUrl(localOriginalUrl, 'release')) {
      setOriginalError('Must be a valid Discogs release URL (e.g., https://www.discogs.com/release/123456)');
      hasErrors = true;
    } else {
      setOriginalError('');
    }

    if (localCurrentUrl && !validateDiscogsUrl(localCurrentUrl, 'release')) {
      setCurrentError('Must be a valid Discogs release URL (e.g., https://www.discogs.com/release/123456)');
      hasErrors = true;
    } else {
      setCurrentError('');
    }

    if (hasErrors || !hasChanges) return;

    const updates: { master_url?: string | null; original_release_url?: string | null; current_release_url?: string | null } = {};

    if (localMasterUrl !== (masterUrl || '')) {
      updates.master_url = localMasterUrl || null;
    }

    if (localOriginalUrl !== (originalReleaseUrl || '')) {
      updates.original_release_url = localOriginalUrl || null;
    }

    if (localCurrentUrl !== (currentReleaseUrl || '')) {
      updates.current_release_url = localCurrentUrl || null;
    }

    onUpdate(recordId, updates);
    setOpened(false);
  };

  const handleCancel = () => {
    setLocalMasterUrl(masterUrl || '');
    setLocalOriginalUrl(originalReleaseUrl || '');
    setLocalCurrentUrl(currentReleaseUrl || '');
    setMasterError('');
    setOriginalError('');
    setCurrentError('');
    setOpened(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (hasChanges && !masterError && !originalError && !currentError) {
        handleSave();
      } else if (!hasChanges) {
        setOpened(false);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleCancel();
    }
  };

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
      <Popover width="min(500px, 90vw)" position="bottom" withArrow shadow="md" opened={opened} onChange={(o) => { setOpened(o); if (!o) handleCancel(); }} withinPortal>
        <Popover.Target>
          <div style={{ width: '100%' }}>
            <Group gap={4} wrap="nowrap">
              {masterUrl && (
                <Button
                  component="a"
                  href={masterUrl}
                  target="_blank"
                  variant="light"
                  size="compact-xs"
                  color="blue"
                  style={{ fontSize: '11px', padding: '2px 8px' }}
                  onClick={(e) => e.stopPropagation()}
                >
                  Master
                </Button>
              )}
              {originalReleaseUrl && (
                <Button
                  component="a"
                  href={originalReleaseUrl}
                  target="_blank"
                  variant="light"
                  size="compact-xs"
                  color="blue"
                  style={{ fontSize: '11px', padding: '2px 8px' }}
                  onClick={(e) => e.stopPropagation()}
                >
                  Original
                </Button>
              )}
              {currentReleaseUrl && (
                <Button
                  component="a"
                  href={currentReleaseUrl}
                  target="_blank"
                  variant="light"
                  size="compact-xs"
                  color="blue"
                  style={{ fontSize: '11px', padding: '2px 8px' }}
                  onClick={(e) => e.stopPropagation()}
                >
                  Current
                </Button>
              )}
              {!masterUrl && !originalReleaseUrl && !currentReleaseUrl && (
                <Text size="sm" c="dimmed">-</Text>
              )}
            </Group>
          </div>
        </Popover.Target>
        <Popover.Dropdown>
          <Stack gap="xs">
            <Group justify="space-between" align="center">
              <Text size="sm" fw={500}>Edit Discogs Links</Text>
              <Group gap="xs">
                {hasChanges && !masterError && !originalError && !currentError && (
                  <ActionIcon size="sm" variant="subtle" color="green" onClick={(e) => { e.stopPropagation(); handleSave(); }}>
                    <IconCheck size={16} />
                  </ActionIcon>
                )}
                <ActionIcon size="sm" variant="subtle" color="red" onClick={(e) => { e.stopPropagation(); handleCancel(); }}>
                  <IconX size={16} />
                </ActionIcon>
              </Group>
            </Group>

            {/* Master URL */}
            <Box>
              <Group gap="xs" align="flex-start">
                <Text size="sm" fw={500} style={{ minWidth: '60px', marginTop: '6px' }}>Master</Text>
                <Box style={{ flex: 1 }}>
                  <TextInput
                    size="sm"
                    value={localMasterUrl}
                    onChange={(e) => {
                      setLocalMasterUrl(e.target.value);
                      if (masterError) setMasterError('');
                    }}
                    placeholder="https://www.discogs.com/master/123456"
                    error={masterError}
                    styles={{
                      input: {
                        fontSize: '12px'
                      }
                    }}
                    onKeyDown={handleKeyDown}
                  />
                </Box>
              </Group>
            </Box>

            {/* Original Release URL */}
            <Box>
              <Group gap="xs" align="flex-start">
                <Text size="sm" fw={500} style={{ minWidth: '60px', marginTop: '6px' }}>Original</Text>
                <Box style={{ flex: 1 }}>
                  <TextInput
                    size="sm"
                    value={localOriginalUrl}
                    onChange={(e) => {
                      setLocalOriginalUrl(e.target.value);
                      if (originalError) setOriginalError('');
                    }}
                    placeholder="https://www.discogs.com/release/123456"
                    error={originalError}
                    styles={{
                      input: {
                        fontSize: '12px'
                      }
                    }}
                    onKeyDown={handleKeyDown}
                  />
                </Box>
              </Group>
            </Box>

            {/* Current Release URL */}
            <Box>
              <Group gap="xs" align="flex-start">
                <Text size="sm" fw={500} style={{ minWidth: '60px', marginTop: '6px' }}>Current</Text>
                <Box style={{ flex: 1 }}>
                  <TextInput
                    size="sm"
                    value={localCurrentUrl}
                    onChange={(e) => {
                      setLocalCurrentUrl(e.target.value);
                      if (currentError) setCurrentError('');
                    }}
                    placeholder="https://www.discogs.com/release/123456"
                    error={currentError}
                    styles={{
                      input: {
                        fontSize: '12px'
                      }
                    }}
                    onKeyDown={handleKeyDown}
                  />
                </Box>
              </Group>
            </Box>
          </Stack>
        </Popover.Dropdown>
      </Popover>
    </Box>
  );
}
