/** Format a length value with optional unit label */
export function formatLength(value: number, unit?: string): string {
  const rounded = Math.round(value * 100) / 100
  return unit ? `${rounded} ${unit}` : `${rounded}`
}
