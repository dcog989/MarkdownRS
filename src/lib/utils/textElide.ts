export function elideMiddle(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;

  const ellipsis = "…";
  const keep = maxLength - ellipsis.length;
  if (keep <= 0) return text.slice(0, maxLength);

  const headLen = Math.ceil(keep / 2);
  const tailLen = Math.floor(keep / 2);
  return `${text.slice(0, headLen)}${ellipsis}${text.slice(-tailLen)}`;
}
