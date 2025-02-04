interface PillColorOption {
  value: string;
  label: string;
}

export const PILL_COLORS = {
  default: 'grey',
  options: [
    { value: 'grey', label: 'Grey' },
    { value: 'blue', label: 'Blue' },
    { value: 'green', label: 'Green' },
    { value: 'red', label: 'Red' },
    { value: 'yellow', label: 'Yellow' },
    { value: 'orange', label: 'Orange' },
    { value: 'cyan', label: 'Cyan' },
    { value: 'grape', label: 'Purple' },
    { value: 'pink', label: 'Pink' }
  ] as PillColorOption[]
}; 
