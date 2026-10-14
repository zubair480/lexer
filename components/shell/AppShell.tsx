"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpenCheck,
  FileSpreadsheet,
  LayoutDashboard,
  Scale,
  ShieldCheck,
  UserCheck,
} from "lucide-react";
import { DEMO } from "@/shared/contract";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, match: (p: string) => p === "/" },
  { href: "/rulebooks", label: "Rulebooks", icon: BookOpenCheck, match: (p: string) => p.startsWith("/rulebooks") },
  { href: "/invoices", label: "Invoices", icon: FileSpreadsheet, match: (p: string) => p.startsWith("/invoices") },
  { href: "/review", label: "Review", icon: UserCheck, match: (p: string) => p.startsWith("/review") },
];

export function Logo({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
        <Scale className="h-4 w-4" />
      </div>
      <div className="leading-tight">
        <div className="text-[15px] font-semibold tracking-tight text-slate-900">CounselLint</div>
        <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
          Rulebooks → tested code
        </div>
      </div>
    </div>
  );
}

export function Sidebar() {
  const pathname = usePathname() ?? "/";
  return (
    <aside className="sticky top-0 flex h-screen w-60 shrink-0 flex-col border-r bg-white/80 px-4 py-5 backdrop-blur">
      <Logo className="px-2" />
      <nav className="mt-8 flex flex-col gap-1">
        <div className="px-2 pb-2 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
          Workspace
        </div>
        {NAV.map(({ href, label, icon: Icon, match }) => {
          const active = match(pathname);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
              )}
            >
              <Icon className={cn("h-4 w-4", active ? "opacity-100" : "opacity-70 group-hover:opacity-100")} />
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto rounded-xl border bg-slate-50 p-3 text-xs text-slate-600">
        <div className="flex items-center gap-1.5 font-medium text-slate-800">
          <ShieldCheck className="h-3.5 w-3.5 text-teal-600" />
          Deterministic engine
        </div>
        <p className="mt-1 leading-relaxed">
          AI writes rules and suggests fixes. It never decides compliance.
        </p>
      </div>
    </aside>
  );
}

export function TopBar() {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-white/80 px-8 backdrop-blur">
      <div className="flex items-center gap-3 text-sm">
        <span className="text-muted-foreground">Client</span>
        <span className="flex items-center gap-2 font-medium text-slate-900">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-slate-900 text-[11px] font-semibold text-white">
            AC
          </span>
          {DEMO.clientName}
        </span>
        <span className="text-slate-300">/</span>
        <span className="font-mono text-xs text-slate-600">{DEMO.matterId}</span>
      </div>
      <div className="flex items-center gap-3">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-800">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
          Synthetic data
        </span>
        <div className="flex items-center gap-2 text-sm text-slate-700">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-200 text-[11px] font-semibold text-slate-700">
            JR
          </div>
          <span className="hidden xl:inline">{DEMO.approver}</span>
        </div>
      </div>
    </header>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-[#F7F8FA]">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
