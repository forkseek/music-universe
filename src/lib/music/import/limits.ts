export const IMPORT_LIMITS = Object.freeze({
  maxFileBytes: 2 * 1024 * 1024,
  maxBatchBytes: 10 * 1024 * 1024,
  maxFiles: 10,
  maxTracks: 5_000,
  maxFieldLength: 500,
  maxUrlLength: 2_048,
  maxArtists: 20,
  maxGenres: 20,
  maxDurationMs: 24 * 60 * 60 * 1000,
});
