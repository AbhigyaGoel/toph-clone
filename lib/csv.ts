/**
 * CSV generation.
 *
 * Hand-rolled, and small enough to justify: the whole of RFC 4180 that matters
 * here is "wrap a field in quotes if it contains a comma, a quote or a newline,
 * and double any quote inside it". A dependency for that would be more surface
 * than code.
 *
 * The leading-character guard is the part that is easy to miss. Spreadsheets
 * treat a cell beginning `=`, `+`, `-` or `@` as a formula, so a field name
 * typed as `=cmd|...` becomes an executable cell in Excel — a real injection
 * class with a CVE history, and this file's export is user-entered text from end
 * to end. Prefixing a tab neutralises it without changing what the cell reads.
 */

const RISKY_LEAD = /^[=+\-@\t\r]/;

function escapeCell(value: string): string {
  const guarded = RISKY_LEAD.test(value) ? `\t${value}` : value;
  return /[",\n\r]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
}

/** Renders a cell value; null and undefined become empty rather than "null". */
export function cell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  return escapeCell(String(value));
}

/**
 * Joins headers and rows into a CSV document.
 *
 * CRLF line endings and a UTF-8 BOM, because the audience for these files is
 * Excel on a Windows machine in a farm office: without the BOM it renders
 * accented worker names as mojibake, and without CRLF some versions run the
 * whole file onto one line.
 */
export function toCsv(
  headers: readonly string[],
  rows: readonly (readonly (string | number | null | undefined)[])[]
): string {
  const lines = [headers.map(cell).join(','), ...rows.map((row) => row.map(cell).join(','))];
  return `﻿${lines.join('\r\n')}\r\n`;
}

/** `toph-activity-logs-2026-09-17.csv` */
export function exportFilename(kind: string, now: Date = new Date()): string {
  return `toph-${kind}-${now.toISOString().slice(0, 10)}.csv`;
}
