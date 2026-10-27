import { useState } from "react";
import { t } from "../copy.js";
import { Busy, Identity } from "./Shared.js";
export function SubmissionRecovery({
  hash,
  saved,
  retry,
}: {
  hash: string;
  saved: boolean;
  retry: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false),
    [failed, setFailed] = useState(false);
  return (
    <section className="notice storage-recovery" aria-live="polite">
      <p>
        {t(saved ? "receipt.submission_unknown" : "app.storage_before_send")}
      </p>
      <Identity label={t("receipt.hash")} value={hash} />
      <a href={"/receipt/" + hash} target="_blank" rel="noreferrer">
        {t("pending.recovery_link")}
      </a>
      {failed && <p role="alert">{t("receipt.submission_unknown")}</p>}
      <button
        className="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setFailed(false);
          try {
            await retry();
          } catch {
            setFailed(true);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? (
          <Busy />
        ) : (
          t(saved ? "receipt.retry_submit" : "app.storage_continue")
        )}
      </button>
    </section>
  );
}
