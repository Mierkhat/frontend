import { ChevronDown } from "lucide-react";
import { TESTNET_ISSUER, type DeploymentBundle } from "@mierkhat/sdk";
import { t, type CopyKey } from "../copy.js";
import { Identity, PageHeading, icon } from "../components/Shared.js";
export function Contracts({ bundle }: { bundle: DeploymentBundle }) {
  return (
    <main id="main" className="wrap standard-page">
      <PageHeading title={t("contracts.heading")} intro={t("contracts.body")} />
      <div className="contract-grid">
        <section>
          <Identity label={t("contracts.guard")} value={bundle.guard} link />
          <Identity
            label={t("contracts.vault")}
            value={bundle.profile.vault.address}
            link
          />
          {bundle.migration && (
            <Identity
              label={t("migration.destination")}
              value={bundle.migration.destination.address}
              link
            />
          )}
          <Identity
            label={t("contracts.router")}
            value={bundle.profile.router.address}
            link
          />
          <Identity
            label={t("contracts.factory")}
            value={bundle.profile.factory.address}
            link
          />
        </section>
        <section>
          {bundle.tokens.map((token) => (
            <Identity
              key={token.address}
              label={token.symbol}
              value={token.address}
              link
            />
          ))}
          <Identity label={t("contracts.issuer")} value={TESTNET_ISSUER} />
        </section>
      </div>
      <Identity label={t("contracts.profile")} value={bundle.profileHash} />
      <p className="notice">{t("contracts.review_note")}</p>
      <details className="review-details">
        <summary>{t("details.raw")}</summary>
        <pre>{JSON.stringify(bundle, null, 2)}</pre>
      </details>
    </main>
  );
}
export function Help() {
  const questions: [CopyKey, CopyKey][] = [
    ["help.atomic", "help.atomic_body"],
    ["help.settlement", "help.settlement_body"],
    ["app.help_wallet", "app.help_wallet_body"],
    ["help.fees", "app.help_fee_body"],
    ["help.pending", "help.pending_body"],
    ["help.testnet", "help.testnet_body"],
    ["help.preflight", "help.preflight_body"],
  ];
  return (
    <main id="main" className="wrap standard-page help-page">
      <PageHeading title={t("help.title")} intro={t("app.help_intro")} />
      <div className="condition-list">
        {questions.map(([q, a]) => (
          <details key={q}>
            <summary>
              <span>{t(q)}</span>
              <ChevronDown {...icon} />
            </summary>
            <p>{t(a)}</p>
          </details>
        ))}
      </div>
      <p className="fine-print">{t("help.limits")}</p>
      <a className="button" href="/app">
        {t("home.open")}
      </a>
    </main>
  );
}
