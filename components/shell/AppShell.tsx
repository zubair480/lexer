"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpenCheck, FileText, LayoutGrid, ScanSearch } from "lucide-react";
import { DEMO } from "@/shared/contract";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Overview", icon: LayoutGrid, match: (p: string) => p === "/" },
  { href: "/rulebooks", label: "Rulebooks", icon: BookOpenCheck, match: (p: string) => p.startsWith("/rulebooks") },
  { href: "/invoices", label: "Invoices", icon: FileText, match: (p: string) => p.startsWith("/invoices") },
  { href: "/review", label: "Review", icon: ScanSearch, match: (p: string) => p.startsWith("/review") },
];

export function Logo({ className }: { className?: string }) {
  return (
    <Link href="/" className={cn("group flex items-center gap-3", className)}>
      <span className="lg lg-green flex h-9 w-9 items-center justify-center rounded-[11px] text-[19px] font-semibold leading-none text-white">
        §
      </span>
      <span className="leading-none">
        <span className="block text-[19px] font-semibold tracking-[-0.04em] text-white">Lexer</span>
        <span className="mt-1 block font-mono text-[9.5px] uppercase tracking-[0.18em] text-white/45">Rulebooks → code</span>
      </span>
    </Link>
  );
}

export function Sidebar() {
  const pathname = usePathname() ?? "/";
  return (
    <aside className="sticky top-0 z-10 flex h-screen w-[232px] shrink-0 flex-col p-4">
      <div className="glass flex h-full flex-col !rounded-[22px] p-4">
        <Logo className="px-1 pt-1" />
        <nav className="mt-9 flex flex-col gap-1">
          {NAV.map(({ href, label, icon: Icon, match }, i) => {
            const active = match(pathname);
            return (
              <Link
                key={href}
                href={href}
                style={{ animationDelay: `${80 + i * 60}ms` }}
                className={cn(
                  "rise press group relative flex items-center gap-3 rounded-[12px] px-3 py-2.5 text-[14px] transition-colors duration-300",
                  active ? "bg-white/[0.09] text-white" : "text-white/55 hover:bg-white/[0.05] hover:text-white",
                )}
              >
                {active ? <span className="neon-dot absolute -left-1 h-1.5 w-1.5 rounded-full bg-[#34e27f]" /> : null}
                <Icon className="h-[17px] w-[17px] transition-transform duration-300 group-hover:scale-110" strokeWidth={1.6} />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="glass mt-auto !rounded-[16px] p-3.5">
          <div className="flex items-center gap-2 text-[12px] font-medium text-white">
            <span className="neon-dot pulse-soft h-1.5 w-1.5 rounded-full bg-[#34e27f]" />
            Deterministic engine
          </div>
          <p className="mt-1.5 text-[11.5px] leading-relaxed text-white/50">
            The model drafts the rules. Tested code decides compliance.
          </p>
        </div>
      </div>
    </aside>
  );
}

export function TopBar() {
  return (
    <header className="sticky top-0 z-30 px-6 pt-4">
      <div className="glass flex h-12 items-center justify-between !rounded-[16px] px-5">
        <div className="flex items-center gap-2.5 text-[13px]">
          <span className="lg flex h-7 w-7 items-center justify-center rounded-[9px] text-[10.5px] font-semibold tracking-[-0.02em] text-white">AC</span>
          <span className="text-white">{DEMO.clientName}</span>
          <span className="text-white/25">/</span>
          <span className="font-mono text-[11.5px] text-white/50">{DEMO.matterId}</span>
        </div>
        <div className="flex items-center gap-4 text-[12px]">
          <span className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-white/60">
            <span className="h-1.5 w-1.5 rounded-full bg-[#f5c451]" />
            Synthetic data
          </span>
          <span className="flex items-center gap-2 text-white/80">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-white/30 to-white/5 text-[10px] font-semibold text-white ring-1 ring-white/20">
              JR
            </span>
            {DEMO.approver}
          </span>
        </div>
      </div>
    </header>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="dot-grid relative flex min-h-screen text-white">
      <div className="aurora" aria-hidden>
        <span className="a1" />
        <span className="a2" />
        <span className="a3" />
        <span className="a4" />
      </div>
      <div className="grain" aria-hidden />
      <Sidebar />
      <div className="relative z-10 flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
