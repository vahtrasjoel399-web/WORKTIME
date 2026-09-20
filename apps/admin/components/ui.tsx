import type { ReactNode } from "react";
import { Icon, type IconName } from "./Icon";

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}
export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
}: {
  title: string;
  description?: ReactNode;
  eyebrow?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow mb-1.5">{eyebrow}</p>}
        <h1 className="page-title">{title}</h1>
        {description && <div className="page-description">{description}</div>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function MetricStrip({
  items,
}: {
  items: Array<{ label: string; value: ReactNode; detail?: ReactNode; tone?: "default" | "primary" | "live" | "signal" }>;
}) {
  return (
    <dl className="panel grid divide-y divide-border sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="min-w-0 px-4 py-3.5 sm:px-5">
          <dt className="text-xs font-medium text-muted">{item.label}</dt>
          <dd className={cx("tabular mt-1 text-xl font-semibold tracking-tight", item.tone === "primary" && "text-primary", item.tone === "live" && "text-live", item.tone === "signal" && "text-signal")}>{item.value}</dd>
          {item.detail && <div className="mt-0.5 truncate text-xs text-muted">{item.detail}</div>}
        </div>
      ))}
    </dl>
  );
}

export function StatusBadge({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "live" | "signal" | "alert" | "primary";
  children: ReactNode;
}) {
  const toneClass = {
    neutral: "bg-bg text-muted",
    live: "bg-live/10 text-live",
    signal: "bg-signal/10 text-signal",
    alert: "bg-alert/10 text-alert",
    primary: "bg-primary/10 text-primary",
  }[tone];
  return <span className={cx("status-badge", toneClass)}>{children}</span>;
}

export function EmptyState({
  title,
  description,
  action,
  icon = "empty",
}: {
  title: string;
  description: string;
  action?: ReactNode;
  icon?: IconName;
}) {
  return (
    <div className="panel flex flex-col items-center border-dashed px-6 py-10 text-center">
      <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-bg text-muted">
        <Icon name={icon} className="h-5 w-5" />
      </span>
      <h2 className="section-title">{title}</h2>
      <p className="mt-1 max-w-md text-sm leading-6 text-muted">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="field-label">{label}</span>
      {children}
      {error ? <span role="alert" className="mt-1.5 block text-xs text-alert">{error}</span> : hint ? <span className="field-hint block">{hint}</span> : null}
    </label>
  );
}
