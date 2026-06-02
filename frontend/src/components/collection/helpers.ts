import { PILL_COLORS } from '../../constants/colors';

export const PAGE_SIZE = 40;

// Get color styles for badges based on a named pill color.
export const getColorStyles = (colorName: string) => {
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

// Format the musicians field (supports both the legacy array and the new
// categorized object format).
export const formatMusicians = (musicians: any): string => {
  if (!musicians) return '-';

  // If it's an array (legacy format), join with commas
  if (Array.isArray(musicians)) {
    return musicians.join(', ') || '-';
  }

  // If it's an object (new categorized format), flatten all credits
  if (typeof musicians === 'object') {
    const allCredits: string[] = [];

    for (const heading in musicians) {
      if (heading === '_role_index') continue; // Skip the index

      const subheadings = musicians[heading];
      for (const subheading in subheadings) {
        const credits = subheadings[subheading];
        if (Array.isArray(credits)) {
          allCredits.push(...credits);
        }
      }
    }

    return allCredits.length > 0 ? allCredits.join(', ') : '-';
  }

  return '-';
};

// Extract the primary format from a full format string.
// E.g., "Vinyl, LP, Album, Reissue" -> "Vinyl"
export const extractPrimaryFormat = (formatString: string | null | undefined): string => {
  if (!formatString) return '-';

  const parts = formatString.split(',').map(p => p.trim());
  return parts[0] || '-';
};
