import type { ProviderTrack } from "@/lib/music/providers/types";
import type { NormalizedTrack } from "@/types/music";

export type ImportEncoding = "auto" | "utf-8" | "utf-16le" | "utf-16be" | "gb18030";
export interface ImportFile {
  name: string;
  bytes: Uint8Array;
  encoding?: ImportEncoding;
}
export interface ImportIssue {
  fileName: string;
  row?: number; // Physical CSV/TXT line or 1-based JSON item index.
  code: string;
  message: string;
  field?: string;
}
export interface ParsedFile {
  fileName: string;
  encoding?: string;
  totalRecords: number;
  tracks: ProviderTrack[];
  errors: ImportIssue[];
  warnings: ImportIssue[];
}
export interface ImportStats {
  totalRecords: number;
  validRecords: number;
  invalidRecords: number;
  mergedRecords: number;
  uniqueTracks: number;
}
export interface ImportReport {
  isDemo: boolean;
  tracks: NormalizedTrack[];
  stats: ImportStats;
  files: Omit<ParsedFile, "tracks">[];
  errors: ImportIssue[];
  warnings: ImportIssue[];
}
