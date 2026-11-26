export const semanticColors = {
  success: '#2f8f73',
  warning: '#fb923c',
  danger: '#c94b4b',
  info: '#3b82c4',
  neutral: '#78848a',
} as const;

const responseDefaults = {
  fast: ['#16715d', semanticColors.success],
  normal: ['#a86606', semanticColors.warning],
  late: ['#c2413c', semanticColors.danger],
} as const;

// Translate only built-in defaults; custom color selections stay unchanged.
export function responseColor(kind: keyof typeof responseDefaults, color?: string) {
  const [legacy, current] = responseDefaults[kind];
  return !color || color.toLowerCase() === legacy ? current : color;
}

const optionDefaults = {
  status: {
    OPEN: ['#2f8f73', semanticColors.success],
    PENDING: ['#d49a2a', semanticColors.warning],
    IN_PROGRESS: ['#3b82c4', semanticColors.info],
    RESOLVED: ['#398571', semanticColors.success],
    CLOSED: ['#78848a', semanticColors.neutral],
  },
  priority: {
    LOW: ['#3b82c4', semanticColors.info],
    NORMAL: ['#78848a', semanticColors.neutral],
    HIGH: ['#dd7a2d', semanticColors.warning],
    URGENT: ['#c94b4b', semanticColors.danger],
  },
} satisfies Record<string, Record<string, [string, string]>>;

export function optionColor(kind: keyof typeof optionDefaults, code: string, color?: string) {
  const defaults: Record<string, [string, string]> = optionDefaults[kind];
  const pair = defaults[code];
  const fallback = kind === 'status' ? '#398571' : '#64748b';
  if (!color || color.toLowerCase() === fallback || color.toLowerCase() === pair?.[0]) {
    return pair?.[1] ?? (kind === 'status' ? semanticColors.success : semanticColors.neutral);
  }
  return color;
}
