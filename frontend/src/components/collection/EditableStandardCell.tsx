import { useEffect, useState } from 'react';
import { ActionIcon, Box, Group, Popover, Stack, Text, Textarea, TextInput } from '@mantine/core';
import { IconCheck, IconPencil, IconX } from '@tabler/icons-react';
import { recordFieldsService } from './services';

export interface EditableStandardCellProps {
  value: any;
  displayValue?: string;
  fieldName: string;
  fieldLabel: string;
  recordId: string;
  inputType: 'text' | 'number' | 'textarea' | 'array';
  requirePencilClick?: boolean; // If true, shows pencil icon for two-step edit (default: true for standard columns)
  noTruncate?: boolean; // If true, shows full content without lineClamp
  onUpdate: (recordId: string, fieldName: string, newValue: any) => void;
}

export function EditableStandardCell({
  value,
  displayValue,
  fieldName,
  fieldLabel,
  recordId,
  inputType,
  requirePencilClick = true,
  noTruncate = false,
  onUpdate
}: EditableStandardCellProps) {
  const [localValue, setLocalValue] = useState(value);
  const [opened, setOpened] = useState(false);
  const [isEditing, setIsEditing] = useState(!requirePencilClick); // Auto-edit if no pencil required

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  // Reset editing state when opening if pencil is not required
  useEffect(() => {
    if (opened && !requirePencilClick) {
      setIsEditing(true);
    }
  }, [opened, requirePencilClick]);

  // For array types, check if arrays are equal
  const hasChanges = inputType === 'array'
    ? JSON.stringify(localValue) !== JSON.stringify(value)
    : localValue !== value;

  const handleSave = async () => {
    if (!recordId || !hasChanges) return;

    try {
      const response = await recordFieldsService.update(recordId, { [fieldName]: localValue });
      if (response.success) {
        onUpdate(recordId, fieldName, localValue);
        setIsEditing(!requirePencilClick); // Keep editing mode if no pencil required
        setOpened(false);
      }
    } catch (error) {
      console.error(`Error updating ${fieldName}:`, error);
    }
  };

  const handleCancel = () => {
    setLocalValue(value);
    setIsEditing(!requirePencilClick); // Keep editing mode if no pencil required
    setOpened(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      handleCancel();
    } else if (inputType === 'textarea' || inputType === 'array') {
      // For textarea: Enter saves (or closes if no changes), Shift+Enter creates new line
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (hasChanges) {
          handleSave();
        } else {
          setOpened(false);
        }
      }
    } else {
      // For text/number inputs: Enter saves (or closes if no changes)
      if (e.key === 'Enter') {
        e.preventDefault();
        if (hasChanges) {
          handleSave();
        } else {
          setOpened(false);
        }
      }
    }
  };

  // Render display value (for arrays, join with comma)
  const renderDisplayValue = () => {
    if (displayValue !== undefined) return displayValue;
    if (inputType === 'array') {
      return Array.isArray(value) && value.length > 0 ? value.join(', ') : '-';
    }
    return value || '-';
  };

  // Render input field based on type
  const renderInput = () => {
    if (inputType === 'textarea' || inputType === 'array') {
      const textValue = inputType === 'array'
        ? (Array.isArray(localValue) ? localValue.join(', ') : '')
        : localValue;

      return (
        <Textarea
          size="sm"
          value={textValue}
          onChange={(e) => {
            const newValue = inputType === 'array'
              ? e.target.value.split(',').map(s => s.trim()).filter(s => s)
              : e.target.value;
            setLocalValue(newValue);
          }}
          placeholder={`Enter ${fieldLabel.toLowerCase()}`}
          autosize
          minRows={2}
          maxRows={6}
          styles={{ root: { maxWidth: '90vw' } }}
          onKeyDown={handleKeyDown}
          autoFocus
        />
      );
    }

    if (inputType === 'number') {
      return (
        <TextInput
          size="sm"
          type="number"
          value={localValue}
          onChange={(e) => setLocalValue(e.target.value ? parseInt(e.target.value) : '')}
          placeholder={`Enter ${fieldLabel.toLowerCase()}`}
          styles={{ input: { minHeight: '36px' }, root: { maxWidth: '90vw' } }}
          onKeyDown={handleKeyDown}
          autoFocus
        />
      );
    }

    // Default: text input
    return (
      <Textarea
        size="sm"
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        placeholder={`Enter ${fieldLabel.toLowerCase()}`}
        autosize
        minRows={2}
        maxRows={6}
        styles={{ root: { maxWidth: '90vw' } }}
        onKeyDown={handleKeyDown}
        autoFocus
      />
    );
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
      <Popover width="min(400px, 90vw)" position="bottom" withArrow shadow="md" opened={opened} onChange={(o) => { setOpened(o); if (!o) handleCancel(); }} withinPortal>
        <Popover.Target>
          <div style={{ width: '100%' }}>
            <Text
              size="sm"
              {...(noTruncate ? {} : { lineClamp: 1 })}
              style={{
                ...(noTruncate ? { wordBreak: 'break-word', whiteSpace: 'pre-wrap' } : { maxWidth: '90vw' })
              }}
            >
              {renderDisplayValue()}
            </Text>
          </div>
        </Popover.Target>
        <Popover.Dropdown>
          <Stack gap="xs">
            <Group justify="space-between" align="center">
              <Text size="sm" fw={500}>{fieldLabel}</Text>
              <Group gap={4}>
                {requirePencilClick && !isEditing ? (
                  // View mode (with pencil): show pencil and X
                  <>
                    <ActionIcon size="sm" variant="subtle" onClick={(e) => { e.stopPropagation(); setIsEditing(true); }}>
                      <IconPencil size={16} />
                    </ActionIcon>
                    <ActionIcon size="sm" variant="subtle" onClick={(e) => { e.stopPropagation(); handleCancel(); }}>
                      <IconX size={16} />
                    </ActionIcon>
                  </>
                ) : (
                  // Edit mode (or no pencil required): show checkmark (if changes) and X
                  <>
                    {hasChanges && (
                      <ActionIcon size="sm" variant="subtle" color="green" onClick={(e) => { e.stopPropagation(); handleSave(); }}>
                        <IconCheck size={16} />
                      </ActionIcon>
                    )}
                    <ActionIcon size="sm" variant="subtle" color="red" onClick={(e) => { e.stopPropagation(); handleCancel(); }}>
                      <IconX size={16} />
                    </ActionIcon>
                  </>
                )}
              </Group>
            </Group>
            {(requirePencilClick && !isEditing) ? (
              <Text size="sm" style={{ whiteSpace: 'pre-wrap', userSelect: 'text' }}>
                {renderDisplayValue()}
              </Text>
            ) : (
              renderInput()
            )}
          </Stack>
        </Popover.Dropdown>
      </Popover>
    </Box>
  );
}
