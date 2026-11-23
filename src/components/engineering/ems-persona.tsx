import type { ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const portrait = "/brand/sentinel.webp";

export function ManuQubeEmblem() {
  return (
    <img
      src="/brand/manuqube-emblem.png"
      alt=""
      width={44}
      height={37}
      className="h-9 w-10 shrink-0 object-contain"
    />
  );
}

export function EmsSignInLayout({ children }: { children: ReactNode }) {
  return (
    <main className="ems-sign-in">
      <div className="ems-sign-in-card">
        <aside className="ems-welcome" aria-label="Sentinel, the EMS engineer">
          <div className="ems-wordmark">
            <ManuQubeEmblem />
            <span>ManuQube</span>
          </div>
          <img
            src={portrait}
            width={672}
            height={1010}
            alt="Sentinel, a yellow tracked rover with a raised inspection mast"
            fetchPriority="high"
            className="ems-welcome-portrait"
          />
          <div className="ems-welcome-caption">
            <span>Sentinel</span>
            <p>Engineering Management</p>
          </div>
        </aside>
        <section className="ems-auth-form">
          <header>
            <span className="ems-module-code">ManuQube EMS</span>
            <h1>Engineering Portal</h1>
          </header>
          {children}
        </section>
      </div>
    </main>
  );
}

export function SentinelPresence() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label="Meet Sentinel"
          className="ems-persona-link focus-visible:ring-2 focus-visible:ring-ring group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:border-0 group-data-[collapsible=icon]:p-0"
        >
          <img src={portrait} width={36} height={42} alt="" />
          <span className="min-w-0 flex-1 text-left group-data-[collapsible=icon]:hidden">
            <strong>Sentinel</strong>
            <small>Engineering Management</small>
          </span>
          <ArrowUpRight
            size={16}
            className="group-data-[collapsible=icon]:hidden"
            aria-hidden="true"
          />
        </button>
      </DialogTrigger>
      <DialogContent className="ems-persona-profile">
        <img
          src={portrait}
          width={672}
          height={1010}
          alt="Sentinel's tracked chassis and inspection mast"
        />
        <div className="min-w-0">
          <span className="ems-module-code">ManuQube EMS</span>
          <DialogTitle className="mt-2 text-2xl">Sentinel</DialogTitle>
          <DialogDescription className="mt-3 text-sm leading-relaxed">
            The engineering crew persona follows the dependencies between a line, its stations, and
            the devices and instructions a revision affects.
          </DialogDescription>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function SentinelBrief({
  revision,
  dirty,
  finding,
  hasLines,
}: {
  revision: number;
  dirty: boolean;
  finding?: { object: string; message: string } | undefined;
  hasLines: boolean;
}) {
  return (
    <aside className="ems-brief" aria-label="Sentinel engineering brief">
      <img src={portrait} width={672} height={1010} alt="" />
      <div>
        <div className="ems-brief-heading">
          <strong>Sentinel</strong>
          <span>
            {dirty ? "Edited draft" : revision ? `Engineering r${revision}` : "Engineering draft"}
          </span>
        </div>
        <p>
          {finding ? (
            <>
              <b>{finding.object}</b> · {finding.message}
            </>
          ) : hasLines ? (
            "No open design findings. Review commissioning evidence before release."
          ) : (
            "Define the first line, then add its stations and equipment."
          )}
        </p>
      </div>
    </aside>
  );
}
