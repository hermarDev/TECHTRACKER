import * as Papa from "papaparse";

type CsvRow = Record<string, unknown>;

function sanitizeCsvCell(value: unknown): unknown {
  if (typeof value !== "string") return value;
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

/** CSV export used by the SuperAdmin overview download. */
export function generateCsv(rows: readonly CsvRow[]): string {
  if (rows.length === 0) return "";
  const safeRows = rows.map((row) =>
    Object.fromEntries(Object.entries(row).map(([k, v]) => [k, sanitizeCsvCell(v)]))
  );
  return Papa.unparse(safeRows);
}
