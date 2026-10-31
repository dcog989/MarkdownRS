function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Local ISO date (`YYYY-MM-DD`), e.g. for frontmatter `date:` fields. */
export function getCurrentDate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Local 24-hour time (`HH:MM`), e.g. for template `{{time}}` placeholders. */
export function getCurrentTime(): string {
  const d = new Date();
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/**
 * Unified timestamp generator for app-wide consistency
 */
export function getCurrentTimestamp(): string {
  const d = new Date();
  const date = `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`;
  const time = `${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`;
  return `${date} / ${time}`;
}

/**
 * Formats internal timestamp (YYYYMMDD / HHMMSS) to display format (YYYYMMDD, HH:MM:SS)
 */
export function formatTimestampForDisplay(timestamp: string): string {
  if (!timestamp) return "";
  if (timestamp.includes(" / ")) {
    const [datePart, timePart] = timestamp.split(" / ");
    // Format HHMMSS -> HH:MM:SS
    const formattedTimePart = timePart.replace(/(\d{2})(\d{2})(\d{2})/, "$1:$2:$3");
    return `${datePart}, ${formattedTimePart}`;
  }
  return timestamp;
}

/**
 * `YYYYMMDD / HHMMSS` -> `YYYY-MM-DD`. Returns null for a string in any other
 * shape (imported data may carry one), so callers can fall back to the raw text
 * instead of slicing it into `2026-0-1-`.
 */
export function formatTimestampAsDate(timestamp: string): string | null {
  const match = /^(\d{4})(\d{2})(\d{2}) \//.exec(timestamp);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}
