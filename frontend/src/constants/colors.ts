interface PillColorOption {
  value: string;
  label: string;
  background: string;
  color: string;
}

export const PILL_COLORS = {
  default: 'gray',
  options: [
    { 
      value: 'gray', 
      label: 'Gray',
      background: 'rgba(112, 120, 117, 0.6)',
      color: 'rgb(255, 255, 255)'
    },
    { 
      value: 'brown', 
      label: 'Brown',
      background: 'rgba(140, 109, 82, 0.6)',
      color: 'rgb(255, 255, 255)'
    },
    { 
      value: 'orange', 
      label: 'Orange',
      background: 'rgba(217, 115, 13, 0.6)',
      color: 'rgb(255, 255, 255)'
    },
    { 
      value: 'yellow', 
      label: 'Yellow',
      background: 'rgba(203, 145, 47, 0.6)',
      color: 'rgb(255, 255, 255)'
    },
    { 
      value: 'green', 
      label: 'Green',
      background: 'rgba(68, 131, 97, 0.6)',
      color: 'rgb(255, 255, 255)'
    },
    { 
      value: 'blue', 
      label: 'Blue',
      background: 'rgba(55, 123, 206, 0.6)',
      color: 'rgb(255, 255, 255)'
    },
    { 
      value: 'purple', 
      label: 'Purple',
      background: 'rgba(144, 101, 176, 0.6)',
      color: 'rgb(255, 255, 255)'
    },
    { 
      value: 'pink', 
      label: 'Pink',
      background: 'rgba(193, 76, 138, 0.6)',
      color: 'rgb(255, 255, 255)'
    },
    { 
      value: 'red', 
      label: 'Red',
      background: 'rgba(234, 42, 36, 0.4)',
      color: 'rgb(255, 255, 255)'
    }
  ] as PillColorOption[]
}; 
