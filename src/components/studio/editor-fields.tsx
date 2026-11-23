import type { ReactNode } from "react";

export const editorInput =
  "min-h-9 min-w-0 rounded-md border border-input bg-background px-2.5 py-1.5 text-sm text-foreground";

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="grid min-w-0 gap-1 text-xs font-medium text-foreground">
      <span>{label}</span>
      {children}
      {hint && <span className="font-normal text-muted-foreground">{hint}</span>}
    </label>
  );
}

export function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step = "any",
}: {
  label: string;
  value: number | null;
  onChange: (next: number | null) => void;
  min?: number;
  max?: number;
  step?: number | "any";
}) {
  return (
    <Field label={label}>
      <input
        type="number"
        className={editorInput}
        value={value ?? ""}
        min={min}
        max={max}
        step={step}
        onChange={(event) => {
          const next = event.target.value === "" ? null : event.target.valueAsNumber;
          if (next === null || Number.isFinite(next)) onChange(next);
        }}
      />
    </Field>
  );
}
