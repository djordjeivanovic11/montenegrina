export function batchValues<T>(values: readonly T[], batchSize: number): T[][] {
  if (!Number.isInteger(batchSize) || batchSize <= 0) {
    throw new Error('INVALID_BATCH_SIZE');
  }

  const batches: T[][] = [];
  for (let offset = 0; offset < values.length; offset += batchSize) {
    batches.push(values.slice(offset, offset + batchSize));
  }
  return batches;
}
