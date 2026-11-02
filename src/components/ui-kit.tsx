import type { ReactNode, InputHTMLAttributes, SelectHTMLAttributes, ButtonHTMLAttributes } from "react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useStore, type Status, type Entity } from "@/lib/store";
import { can, type Module } from "@/lib/permissions";
import { Lock, ShieldCheck } from "lucide-react";

export function StatusBadge({ s }: { s: Status }) {
  const cls = { Draft: "bg-muted text-muted-foreground", "Under Review": "bg-warn/20 text-warn", Approved: "bg-info/20 text-info", Active: "bg-ok/20 text-ok" }[s];
  return <span className={cn("rounded-sm px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider", cls)}>{s}</span>;
}
export const VersionBadge = ({ v }: { v: number }) => (
  <span className="rounded-sm border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">v{v}</span>
);
export function Btn({ variant = "default", className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "default" | "primary" | "danger" | "ghost" }) {
  const v = { default: "border border-border bg-card hover:bg-accent", primary: "bg-primary text-primary-foreground hover:opacity-90", danger: "border border-destructive/50 text-destructive hover:bg-destructive/10", ghost: "hover:bg-accent" }[variant];
  return <button {...p} className={cn("inline-flex h-7 items-center gap-1.5 rounded-sm px-2.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-40", v, className)} />;
}
export const Input = (p: InputHTMLAttributes<HTMLInputElement>) => (
  <input {...p} className={cn("h-7 w-full rounded-sm border border-input bg-background px-2 font-mono text-xs outline-none focus:ring-1 focus:ring-ring disabled:opacity-60", p.className)} />
);
export const Select = ({ children, ...p }: SelectHTMLAttributes<HTMLSelectElement>) => (
  <select {...p} className={cn("h-7 w-full rounded-sm border border-input bg-background px-1.5 text-xs outline-none focus:ring-1 focus:ring-ring disabled:opacity-60", p.className)}>{children}</select>
);
export const Field = ({ label, children }: { label: string; children: ReactNode }) => (
  <label className="block space-y-1"><span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>{children}</label>
);
export const Panel = ({ title, actions, children, className }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) => (
  <section className={cn("rounded-sm border border-border bg-card", className)}>
    {title && <header className="flex h-9 items-center justify-between border-b border-border px-3"><h2 className="text-xs font-semibold uppercase tracking-wider">{title}</h2><div className="flex gap-1.5">{actions}</div></header>}
    <div className="p-3">{children}</div>
  </section>
);

export function usePerm(module: Module) {
  const { session } = useStore();
  const r = session?.roles ?? [], p = session?.permissions ?? [];
  return { edit: can(r, p, module, "edit"), submit: can(r, p, module, "submit"), approve: can(r, p, module, "approve") };
}
export const ReadOnlyNote = () => (
  <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><Lock className="h-3 w-3" /> Read-only for your role</div>
);

/** Lifecycle controls: Draft → Under Review → Approved (e-sign) → Active (e-sign). */
export function LifecycleBar({ e, module }: { e: Entity; module: Module }) {
  const { transition, session } = useStore();
  const perm = usePerm(module);
  const [sign, setSign] = useState<null | "Approved" | "Active" | "Draft">(null);
  const [pwd, setPwd] = useState(""); const [note, setNote] = useState("");
  const confirm = () => {
    if (pwd.trim().toLowerCase() !== session?.email.toLowerCase() || !note.trim() || !sign) return;
    transition(e.id, sign, note, `${session.email} @ ${new Date().toLocaleString()}`);
    setSign(null); setPwd(""); setNote("");
  };
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1">
        {(["Draft", "Under Review", "Approved", "Active"] as Status[]).map((s, i) => (
          <div key={s} className="flex items-center gap-1">
            {i > 0 && <span className="h-px w-3 bg-border" />}
            <span className={cn("rounded-sm px-1.5 py-0.5 font-mono text-[10px]", e.status === s ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>{s}</span>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {e.status === "Draft" && <Btn disabled={!perm.submit} onClick={() => transition(e.id, "Under Review")}>Submit for review</Btn>}
        {e.status === "Under Review" && <>
          <Btn variant="primary" disabled={!perm.approve} onClick={() => setSign("Approved")}><ShieldCheck className="h-3 w-3" />Approve (e-sign)</Btn>
          <Btn disabled={!perm.approve} onClick={() => setSign("Draft")}>Reject to draft</Btn></>}
        {e.status === "Approved" && <Btn variant="primary" disabled={!perm.approve} onClick={() => setSign("Active")}><ShieldCheck className="h-3 w-3" />Activate (e-sign)</Btn>}
      </div>
      {sign && (
        <div className="space-y-2 rounded-sm border border-primary/50 bg-primary/5 p-2">
          <p className="text-[11px] font-semibold">Electronic signature — {sign === "Draft" ? "Reject" : sign}</p>
          <Field label="Reason / meaning of signature"><Input value={note} onChange={(x) => setNote(x.target.value)} placeholder="e.g. Reviewed torque limits against spec QS-114" /></Field>
          <Field label={`Re-enter your email to sign (${session?.email})`}><Input value={pwd} onChange={(x) => setPwd(x.target.value)} /></Field>
          <div className="flex gap-1.5"><Btn variant="primary" onClick={confirm} disabled={!note.trim() || pwd.trim().toLowerCase() !== session?.email.toLowerCase()}>Sign</Btn><Btn variant="ghost" onClick={() => setSign(null)}>Cancel</Btn></div>
        </div>
      )}
    </div>
  );
}
