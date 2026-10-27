import { useEffect, useState, type ReactNode } from "react";
import {
  ArrowUpRight,
  Check,
  Copy,
  ExternalLink,
  Menu,
  Monitor,
  Moon,
  Sun,
  X,
  LoaderCircle,
  CircleAlert,
} from "lucide-react";
import { MierkhatError, type NetworkState } from "@mierkhat/sdk";
import { t, type CopyKey } from "../copy.js";
export const icon = {
  size: 19,
  strokeWidth: 1.6,
  "aria-hidden": true as const,
};
export const shorten = (s: string) => s.slice(0, 7) + "…" + s.slice(-7);
export function ErrorNotice({ error }: { error: unknown }) {
  if (!error) return null;
  const key =
    error instanceof MierkhatError ? error.copyKey : "service.unavailable";
  let message: string;
  try {
    message = t(key as CopyKey, { decimals: 7 });
  } catch {
    message = t("service.unavailable");
  }
  return (
    <div className="notice error" role="alert">
      <CircleAlert {...icon} />
      <div>
        <p>{message}</p>
        {error instanceof MierkhatError && (
          <small>{t("error.code", { code: error.code })}</small>
        )}
      </div>
    </div>
  );
}
export function Busy() {
  return (
    <span className="busy">
      <LoaderCircle {...icon} />
      {t("common.checking")}
    </span>
  );
}
export function Identity({
  label,
  value,
  link = false,
}: {
  label: string;
  value: string;
  link?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="identity">
      <span>{label}</span>
      <code>{value}</code>
      <div className="identity-tools">
        <button
          className="text-button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value);
              setCopied(true);
            } catch {
              setCopied(false);
            }
          }}
          aria-label={t("app.copy_identity")}
        >
          {copied ? <Check {...icon} /> : <Copy {...icon} />}
          <span>{t(copied ? "details.copied" : "details.copy")}</span>
        </button>
        {link && (
          <a
            className="text-button"
            href={"https://stellar.expert/explorer/testnet/contract/" + value}
            target="_blank"
            rel="noreferrer"
          >
            {t("common.view")}
            <ExternalLink {...icon} />
          </a>
        )}
      </div>
    </div>
  );
}
export function ThemeMenu() {
  const [choice, setChoice] = useState(() => {
    try {
      const v = localStorage.getItem("mierkhat.theme");
      return v === "dark" || v === "light" ? v : "system";
    } catch {
      return "system";
    }
  });
  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)");
    const update = () => {
      const theme =
        choice === "system" ? (media.matches ? "dark" : "light") : choice;
      document.documentElement.dataset.theme = theme;
      document.documentElement.style.colorScheme = theme;
      document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute("content", theme === "dark" ? "#101C17" : "#F5F3EB");
    };
    update();
    media.addEventListener("change", update);
    try {
      localStorage.setItem("mierkhat.theme", choice);
    } catch {}
    return () => media.removeEventListener("change", update);
  }, [choice]);
  const I = choice === "dark" ? Moon : choice === "light" ? Sun : Monitor;
  return (
    <label className="theme-control">
      <I {...icon} />
      <span className="sr-only">{t("theme.label")}</span>
      <select
        value={choice}
        onChange={(e) => setChoice(e.target.value)}
        aria-label={t("theme.label")}
      >
        <option value="light">{t("theme.light")}</option>
        <option value="dark">{t("theme.dark")}</option>
        <option value="system">{t("theme.system")}</option>
      </select>
    </label>
  );
}
export function Header({ network }: { network?: NetworkState }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <a className="skip" href="#main">
        {t("nav.skip")}
      </a>
      <header className="site-header">
        <a href="/" aria-label={t("nav.home")} className="brand">
          <img
            className="logo-light"
            src="/brand/mierkhat-logo-light.svg"
            alt={t("brand.alt")}
          />
          <img
            className="logo-dark"
            src="/brand/mierkhat-logo-dark.svg"
            alt={t("brand.alt")}
          />
        </a>
        <button
          className="nav-toggle"
          aria-label={t(open ? "nav.close" : "nav.menu")}
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {open ? <X {...icon} /> : <Menu {...icon} />}
        </button>
        <nav
          className={open ? "nav open" : "nav"}
          aria-label={t("app.window_menu")}
        >
          <a href="/#conditions" onClick={() => setOpen(false)}>
            {t("nav.conditions")}
          </a>
          <a href="/activity">{t("nav.activity")}</a>
          <a href="/contracts">{t("nav.contracts")}</a>
          <ThemeMenu />
          <a className="button small" href="/app">
            {t("home.open")}
            <ArrowUpRight {...icon} />
          </a>
        </nav>
      </header>
      <div className="network-strip">
        <span className={network ? "status-dot live" : "status-dot"} />
        <span>{t("home.network")}</span>
        <span className="network-ledger">
          {network
            ? t("network.live_ledger", { ledger: network.ledger })
            : t("common.loading")}
        </span>
      </div>
    </>
  );
}
export function Footer() {
  return (
    <footer className="site-footer">
      <a href="/" className="footer-brand">
        <img src="/brand/mierkhat-mark-light.svg" alt={t("brand.alt")} />
        <span>{t("footer.note")}</span>
      </a>
      <div>
        <a href="/help">{t("nav.help")}</a>
        <a href="/contracts">{t("nav.contracts")}</a>
        <span>{t("footer.network")}</span>
      </div>
    </footer>
  );
}
export function PageHeading({
  title,
  intro,
  children,
}: {
  title: string;
  intro: string;
  children?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <h1>{title}</h1>
        <p>{intro}</p>
      </div>
      {children}
    </div>
  );
}
