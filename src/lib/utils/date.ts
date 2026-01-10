/**
 * Unified timestamp generator for app-wide consistency
 */
export function getCurrentTimestamp(): string {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const HH = String(d.getHours()).padStart(2, "0");
    const MM = String(d.getMinutes()).padStart(2, "0");
    const SS = String(d.getSeconds()).padStart(2, "0");
    return `${yyyy}${mm}${dd} / ${HH}${MM}${SS}`;
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
