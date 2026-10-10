/**
 * Splits `total` over the weights in whole numbers that add up to `total` (largest remainder; ties
 * go to the earlier weight). With no positive weight to go on, the split is even. An empty list
 * gets an empty result.
 */
export function allocate(total: number, weights: readonly number[]): number[] {
  if (weights.length === 0) return [];
  const weightSum = weights.reduce((sum, weight) => sum + weight, 0);
  const exact = weights.map((weight) =>
    weightSum > 0 ? (total * weight) / weightSum : total / weights.length,
  );
  const sizes = exact.map(Math.floor);
  const order = exact
    .map((value, index) => ({ index, remainder: value - Math.floor(value) }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (
    let spare = total - sizes.reduce((sum, size) => sum + size, 0), i = 0;
    spare > 0;
    spare -= 1, i += 1
  ) {
    sizes[order[i].index] += 1;
  }
  return sizes;
}
