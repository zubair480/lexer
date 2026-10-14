import { cn } from "@/lib/utils";

const fmtCache: Record<number, Intl.NumberFormat> = {};
function formatter(decimals: 0 | 2) {
  return (fmtCache[decimals] ??= new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }));
}

export function formatMoney(value: number, decimals: 0 | 2 = 0): string {
  return formatter(decimals).format(Number.isFinite(value) ? value : 0);
}

export function Money({
  value,
  className,
  decimals = 0,
}: {
  value: number;
  className?: string;
  decimals?: 0 | 2;
}) {
  return <span className={cn("tabular-nums", className)}>{formatMoney(value, decimals)}</span>;
}

export default Money;
