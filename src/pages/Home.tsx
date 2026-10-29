import {
  ArrowUpRight,
  Check,
  Layers,
  ShieldCheck,
  Wallet,
  RefreshCw,
  ChevronDown,
} from "lucide-react";
import {
  formatAmount,
  type NetworkState,
  type DeploymentBundle,
} from "@mierkhat/sdk";
import { t, type CopyKey } from "../copy.js";
import { icon } from "../components/Shared.js";
export function Home({
  network,
  bundle,
  error,
  refresh,
}: {
  network?: NetworkState;
  bundle: DeploymentBundle;
  error: unknown;
  refresh: () => void;
}) {
  const conditions: [
    (
      | "home.condition_spend"
      | "home.condition_receive"
      | "home.condition_balance"
      | "home.condition_expiry"
    ),
    CopyKey,
  ][] = [
    ["home.condition_spend", "home.condition_spend_body"],
    ["home.condition_receive", "home.condition_receive_body"],
    ["home.condition_balance", "home.condition_balance_body"],
    ["home.condition_expiry", "home.condition_expiry_body"],
  ];
  return (
    <main id="main" className="home-page">
      <section className="hero wrap">
        <div className="hero-main">
          <h1>
            {t("home.headline_a")}
            <br />
            <span className="highlight">{t("home.headline_b")}</span>
          </h1>
          <div className="hero-bottom">
            <p>{t("home.intro")}</p>
            <a className="button" href="/app">
              {t("home.open")}
              <ArrowUpRight {...icon} />
            </a>
          </div>
        </div>
        <svg
          className="hero-flow"
          viewBox="0 0 360 360"
          fill="none"
          aria-hidden="true"
        >
          <path
            className="flow-track"
            d="M18 25C180 25 64 180 183 180S324 264 342 335"
          />
          <path
            className="flow-track"
            d="M342 25C180 25 296 180 183 180S42 264 18 335"
          />
          <path
            className="flow-stream"
            d="M18 25C180 25 64 180 183 180S324 264 342 335"
          />
          <path
            className="flow-stream"
            d="M342 25C180 25 296 180 183 180S42 264 18 335"
          />
          <circle cx="183" cy="180" r="42" className="flow-pool" />
          <path d="m169 180 9 9 19-19" className="flow-check" />
        </svg>
      </section>
      <section className="route-band">
        <svg
          className="section-shore shore-top"
          viewBox="0 0 1440 100"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path d="M0 100V42C240 118 380-30 740 30S1170 103 1440 0V100Z" />
        </svg>
        <div className="wrap route-composition">
          <div className="route-visual">
            <div className="route-visual-top">
              <span>{t("home.live")}</span>
              <button
                className="text-button"
                aria-label={t("workspace.refresh")}
                onClick={refresh}
              >
                <RefreshCw {...icon} />
              </button>
            </div>
            <div className="route-vault">
              <Layers size={32} strokeWidth={1.35} aria-hidden="true" />
              <span>{bundle.vaultName}</span>
              <strong>
                {network
                  ? formatAmount(network.totalSharesRaw, bundle.shareDecimals)
                  : t(error ? "common.unavailable" : "common.loading")}
              </strong>
              <small>{t("home.total_shares")}</small>
            </div>
            <div className="route-lines" aria-hidden="true">
              <span />
              <span />
            </div>
            <div className="route-tokens">
              {bundle.profile.assets.map((a) => {
                const token = bundle.tokens.find((v) => v.address === a.asset)!;
                const amount = network?.assets.find(
                  (v) => v.address === a.asset,
                )?.balanceRaw;
                return (
                  <div className="route-token" key={a.asset}>
                    <span className="token-monogram">
                      {token.symbol.slice(-1)}
                    </span>
                    <div>
                      <b>{token.symbol}</b>
                      <span>
                        {amount
                          ? formatAmount(amount, token.decimals)
                          : t(error ? "common.unavailable" : "common.loading")}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="route-connector" aria-hidden="true" />
            <div className="route-check">
              <ShieldCheck {...icon} />
              <span>{t("home.flow_guard")}</span>
              <Check {...icon} />
            </div>
            <div className="route-caption">
              <span>{t("home.flow_wallet")}</span>
              <Wallet {...icon} />
            </div>
          </div>
          <div className="route-story">
            <span className="small-symbol" aria-hidden="true">
              <ShieldCheck size={36} strokeWidth={1.1} />
            </span>
            <h2>{t("home.route_title")}</h2>
            <p>{t("home.route_note")}</p>
            <a href="/#conditions" className="text-link light">
              {t("home.explore")}
              <ArrowUpRight {...icon} />
            </a>
            <div className="live-ledger">
              <span className="status-dot live" />
              <span>{t("home.ledger")}</span>
              <strong>
                {network?.ledger ??
                  t(error ? "common.unavailable" : "common.loading")}
              </strong>
            </div>
          </div>
        </div>
        <svg
          className="section-shore shore-bottom"
          viewBox="0 0 1440 100"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path d="M0 0H1440V50C1090-28 1020 120 630 64S230-4 0 100Z" />
        </svg>
      </section>
      <section className="conditions wrap" id="conditions">
        <div className="section-intro">
          <h2>
            {t("home.promise_a")}
            <br />
            <span className="serif-italic">{t("home.promise_b")}</span>
          </h2>
          <p>{t("home.promise_intro")}</p>
        </div>
        <div className="condition-list">
          {conditions.map(([title, body]) => (
            <details key={title}>
              <summary>
                <span>{t(title)}</span>
                <ChevronDown {...icon} />
              </summary>
              <p>{t(body)}</p>
            </details>
          ))}
        </div>
      </section>
      <section className="start-band">
        <div className="wrap start-inner">
          <div>
            <h2>{t("home.start_title")}</h2>
            <p>{t("home.start_body")}</p>
            <a className="button accent" href="/app">
              {t("home.open")}
              <ArrowUpRight {...icon} />
            </a>
          </div>
          <aside>
            <img src="/brand/mierkhat-mark-dark.svg" alt="" />
            <p>{t("home.testnet_note")}</p>
            <a className="text-link light" href="/contracts">
              {t("nav.contracts")}
              <ArrowUpRight {...icon} />
            </a>
          </aside>
        </div>
      </section>
    </main>
  );
}
