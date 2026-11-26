import { expect, it } from "vitest";
import { csvCell } from "@/components/engineering/report-export";
it("preserves CSV values and neutralizes formulas in text fields", () => {
  expect(csvCell('Line "A", north')).toBe('"Line ""A"", north"');
  for (const formula of ["=1+2", "\t+1", " @example", "\n-1+2"]) {
    expect(csvCell(formula)).toBe(`"'${formula}"`);
  }
});
