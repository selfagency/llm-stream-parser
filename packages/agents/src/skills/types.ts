/**
 * Parse cost range string
 */
export function parseCostRange(cost: string): [number, number] {
  const parts = cost.split('-');
  const min = Number(parts[0]);
  const max = Number(parts[1]);

  if (Number.isNaN(min) || Number.isNaN(max)) {
    throw new Error(`Invalid cost range: ${cost}`);
  }

  return [min, max];
}
