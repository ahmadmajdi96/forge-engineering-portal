/** Quoted cells still execute formulas in spreadsheets; neutralize before CSV quoting. */
export function csvCell(value: string | number): string {
  const source = String(value);
  let index = 0;
  while (index < source.length) {
    const code = source.charCodeAt(index);
    if (code > 32 && code !== 127 && !/\s/u.test(source.charAt(index))) break;
    index++;
  }
  const formula = "=+-@".includes(source.charAt(index)) && index < source.length;
  const safe = formula ? "'" + source : source;
  return `"${safe.replace(/"/g, '""')}"`;
}
