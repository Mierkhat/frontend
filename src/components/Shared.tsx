import { useEffect, useState, useRef, useId, type ReactNode } from "react";
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
  ChevronDown,
} from "lucide-react";
import { MierkhatError } from "@mierkhat/sdk";
import { t, type CopyKey } from "../copy.js";
export const icon = {
  size: 19,
  strokeWidth: 1.6,
  "aria-hidden": true as const,
};
export const shorten = (s: string) => s.slice(0, 7) + "…" + s.slice(-7);
export function ErrorNotice({
  error,
  focusRequest = 0,
}: {
  error: unknown;
  focusRequest?: number;
}) {
  const notice = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!focusRequest || !notice.current) return;
    notice.current.focus({ preventScroll: true });
    notice.current.scrollIntoView({ block: "nearest", behavior: "instant" });
  }, [focusRequest]);
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
    <div className="notice error" role="alert" ref={notice} tabIndex={-1}>
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
export function Busy({ label }: { label?: string } = {}) {
  return (
    <span className="busy" role="status">
      <LoaderCircle {...icon} />
      {label ?? t("common.checking")}
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
        ?.setAttribute("content", theme === "dark" ? "#000000" : "#DEDEDE");
    };
    update();
    media.addEventListener("change", update);
    try {
      localStorage.setItem("mierkhat.theme", choice);
    } catch {}
    return () => media.removeEventListener("change", update);
  }, [choice]);
  const [open, setOpen] = useState(false),
    wrapper = useRef<HTMLDivElement>(null),
    trigger = useRef<HTMLButtonElement>(null),
    panel = useRef<HTMLDivElement>(null),
    menuId = useId();
  useEffect(() => {
    if (!open) return;
    panel.current
      ?.querySelector<HTMLButtonElement>('[aria-checked="true"]')
      ?.focus();
    const outside = (event: PointerEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  const I = choice === "dark" ? Moon : choice === "light" ? Sun : Monitor;
  function close() {
    setOpen(false);
    trigger.current?.focus();
  }
  return (
    <div className="theme-control" ref={wrapper}>
      <button
        ref={trigger}
        className="theme-trigger"
        aria-label={t("theme.label")}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen(!open)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        <I {...icon} />
        <span>
          {t(
            choice === "dark"
              ? "theme.dark"
              : choice === "light"
                ? "theme.light"
                : "theme.system",
          )}
        </span>
        <ChevronDown {...icon} />
      </button>
      {open && (
        <div
          className="theme-options"
          ref={panel}
          id={menuId}
          role="menu"
          aria-label={t("theme.label")}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              close();
              return;
            }
            if (e.key === "Tab") {
              setOpen(false);
              return;
            }
            const options = Array.from(
                panel.current?.querySelectorAll<HTMLButtonElement>(
                  '[role="menuitemradio"]',
                ) ?? [],
              ),
              index = options.findIndex((el) => el === e.target);
            const next =
              e.key === "ArrowDown"
                ? (index + 1) % options.length
                : e.key === "ArrowUp"
                  ? (index + options.length - 1) % options.length
                  : e.key === "Home"
                    ? 0
                    : e.key === "End"
                      ? options.length - 1
                      : undefined;
            if (next !== undefined) {
              e.preventDefault();
              options[next]?.focus();
            }
          }}
        >
          {(["light", "dark", "system"] as const).map((value) => {
            const Icon =
              value === "light" ? Sun : value === "dark" ? Moon : Monitor;
            return (
              <button
                key={value}
                role="menuitemradio"
                aria-checked={choice === value}
                tabIndex={choice === value ? 0 : -1}
                onClick={() => {
                  setChoice(value);
                  close();
                }}
              >
                <Icon {...icon} />
                <span>
                  {t(
                    value === "light"
                      ? "theme.light"
                      : value === "dark"
                        ? "theme.dark"
                        : "theme.system",
                  )}
                </span>
                {choice === value && <Check {...icon} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
export function Header({ currentPath = "/" }: { currentPath?: string }) {
  const [open, setOpen] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null),
    navigationId = useId();
  useEffect(() => {
    if (!open) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      setOpen(false);
      toggle.current?.focus();
    };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [open]);
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
          ref={toggle}
          className="nav-toggle"
          aria-label={t(open ? "nav.close" : "nav.menu")}
          aria-expanded={open}
          aria-controls={navigationId}
          onClick={() => setOpen(!open)}
        >
          {open ? <X {...icon} /> : <Menu {...icon} />}
        </button>
        <nav
          id={navigationId}
          className={open ? "nav open" : "nav"}
          aria-label={t("app.window_menu")}
        >
          <a href="/#conditions" onClick={() => setOpen(false)}>
            {t("nav.conditions")}
          </a>
          <a
            href="/activity"
            aria-current={currentPath === "/activity" ? "page" : undefined}
          >
            {t("nav.activity")}
          </a>
          <a
            href="/contracts"
            aria-current={currentPath === "/contracts" ? "page" : undefined}
          >
            {t("nav.contracts")}
          </a>
          <ThemeMenu />
          {currentPath === "/app" ? (
            <span className="nav-current" aria-current="page">
              <Check {...icon} />
              {t("nav.workspace")}
            </span>
          ) : (
            <a className="button small" href="/app">
              {t("home.open")}
              <ArrowUpRight {...icon} />
            </a>
          )}
        </nav>
      </header>
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
