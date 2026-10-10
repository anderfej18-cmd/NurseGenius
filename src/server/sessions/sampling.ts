/** Uniform random float in [0, 1) from the platform CSPRNG. */
export function secureRandom(): number {
  const buffer = new Uint32Array(2);
  crypto.getRandomValues(buffer);
  // 53 random bits, the precision of a double.
  return (buffer[0] * 2 ** 21 + (buffer[1] >>> 11)) / 2 ** 53;
}

/** Picks `count` distinct items uniformly (partial Fisher-Yates); never mutates the input. */
export function sampleWithoutReplacement<T>(
  items: readonly T[],
  count: number,
  random: () => number,
): T[] {
  const pool = items.slice();
  const take = Math.min(Math.max(count, 0), pool.length);
  for (let i = 0; i < take; i++) {
    const j = i + Math.floor(random() * (pool.length - i));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, take);
}
