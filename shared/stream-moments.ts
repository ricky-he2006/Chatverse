export const STREAM_MOMENTS = [
  'Match victory',
  'Match defeat',
  'Clutch play',
  'Major milestone',
] as const;
// Keep old preset clients retry-compatible during a release upgrade.
export const ACCEPTED_MOMENTS = [
  ...STREAM_MOMENTS,
  'A hard-earned victory',
  'A brave attempt',
  'A new personal best',
] as const;
