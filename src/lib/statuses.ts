// Incorporation pipeline. Order matters (used for the progress bar).
export const STATUSES = [
  { code: 'draft', label: 'Draft', hint: 'Intake in progress' },
  { code: 'name_review', label: 'Name review', hint: 'Name search / NUANS ordered' },
  { code: 'ready_to_file', label: 'Ready to file', hint: 'Articles prepared, awaiting filing' },
  { code: 'filed', label: 'Filed', hint: 'Submitted to registry' },
  { code: 'active', label: 'Active', hint: 'Incorporated and maintained' },
  { code: 'dissolved', label: 'Dissolved', hint: 'No longer active' },
] as const;
export type StatusCode = (typeof STATUSES)[number]['code'];
export const STATUS_CODES = STATUSES.map((s) => s.code) as string[];
export function statusLabel(code: string): string {
  return STATUSES.find((s) => s.code === code)?.label ?? code;
}
export function statusIndex(code: string): number {
  return STATUSES.findIndex((s) => s.code === code);
}
