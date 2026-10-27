import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, LoaderCircle, RefreshCw, Wallet, X } from "lucide-react";
import { getFreighterAvailability } from "../wallet.js";
import { t } from "../copy.js";
import { ErrorNotice, icon } from "./Shared.js";
export function WalletDialog({
  connecting,
  error,
  onSelect,
  onClose,
}: {
  connecting: boolean;
  error: unknown;
  onSelect: () => Promise<void>;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    generation = useRef(0);
  const [availability, setAvailability] = useState<
    "checking" | "available" | "missing" | "unavailable"
  >("checking");
  async function detect() {
    const current = ++generation.current;
    setAvailability("checking");
    const result = await getFreighterAvailability();
    if (current === generation.current) setAvailability(result);
  }
  useEffect(() => {
    const element = dialog.current!;
    element.showModal();
    void detect();
    return () => {
      generation.current++;
      element.close();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className="wallet-dialog"
      aria-labelledby="wallet-dialog-title"
      aria-describedby="wallet-dialog-description"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          const box = e.currentTarget.getBoundingClientRect();
          if (
            e.clientX < box.left ||
            e.clientX > box.right ||
            e.clientY < box.top ||
            e.clientY > box.bottom
          )
            onClose();
        }
      }}
    >
      <div className="wallet-dialog-heading">
        <span className="wallet-dialog-icon">
          <Wallet size={26} strokeWidth={1.4} aria-hidden="true" />
        </span>
        <button
          className="dialog-close"
          autoFocus
          aria-label={t("wallet.close")}
          onClick={onClose}
        >
          <X {...icon} />
        </button>
      </div>
      <h2 id="wallet-dialog-title">{t("wallet.choose")}</h2>
      <p id="wallet-dialog-description">{t("wallet.choose_intro")}</p>
      <ErrorNotice error={error} />
      {availability === "missing" ? (
        <a
          className="wallet-option"
          href="https://www.freighter.app/"
          target="_blank"
          rel="noreferrer"
        >
          <span className="wallet-option-icon">
            <Wallet {...icon} />
          </span>
          <span>
            <strong>{t("wallet.freighter")}</strong>
            <small>{t("wallet.missing")}</small>
          </span>
          <ArrowUpRight {...icon} />
        </a>
      ) : (
        <button
          className="wallet-option"
          disabled={availability !== "available" || connecting}
          onClick={() => void onSelect()}
        >
          <span className="wallet-option-icon">
            <Wallet {...icon} />
          </span>
          <span>
            <strong>{t("wallet.freighter")}</strong>
            <small>
              {t(
                availability === "checking"
                  ? "wallet.detecting"
                  : availability === "unavailable"
                    ? "wallet.detection_failed"
                    : connecting
                      ? "wallet.connecting"
                      : "wallet.available",
              )}
            </small>
          </span>
          {connecting || availability === "checking" ? (
            <LoaderCircle {...icon} className="wallet-spinner" />
          ) : (
            <ArrowUpRight {...icon} />
          )}
        </button>
      )}
      <div className="wallet-dialog-status" role="status">
        {connecting ? (
          <>
            <span className="wallet-progress">
              <LoaderCircle {...icon} />
              {t("wallet.connecting")}
            </span>
            <p>{t("wallet.connecting_note")}</p>
          </>
        ) : availability === "missing" || availability === "unavailable" ? (
          <button className="text-button" onClick={() => void detect()}>
            <RefreshCw {...icon} />
            {t("wallet.check_again")}
          </button>
        ) : null}
      </div>
      <p className="wallet-dialog-note">{t("wallet.supported")}</p>
    </dialog>
  );
}
