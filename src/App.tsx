import { WalletDialog } from "./components/WalletDialog.js";
import { SubmissionRecovery } from "./components/SubmissionRecovery.js";
import { useCallback, useEffect, useState, useRef } from "react";
import {
  ExitController,
  MierkhatError,
  loadDeployment,
  reviewLedger,
  verifyReview,
  rememberPending,
  type NetworkState,
  type Review,
  type RecoveryRecord,
  type SignedAttempt,
} from "@mierkhat/sdk";
import { api, bundles, reader } from "./api.js";
import { connectWallet, wallet } from "./wallet.js";
import { t } from "./copy.js";
import { usePageMotion } from "./motion.js";
import {
  Header,
  Footer,
  ErrorNotice,
  PageHeading,
  Busy,
} from "./components/Shared.js";
import { ReviewPanel } from "./components/Review.js";
import { Home } from "./pages/Home.js";
import { Workspace, type WalletIdentity } from "./pages/Workspace.js";
import { Activity, ReceiptPage } from "./pages/Activity.js";
import { Contracts, Help } from "./pages/Information.js";
export { ReviewPanel } from "./components/Review.js";
export { ThemeMenu } from "./components/Shared.js";
const bundle = bundles.find((b) => b.environment === "testnet");
export function App() {
  const [network, setNetwork] = useState<NetworkState>(),
    [networkError, setNetworkError] = useState<unknown>(),
    [identity, setIdentity] = useState<WalletIdentity>(),
    [walletError, setWalletError] = useState<unknown>(),
    [walletPicker, setWalletPicker] = useState(false),
    [connecting, setConnecting] = useState(false);
  const walletOpener = useRef<HTMLElement | null>(null);
  const connectionGeneration = useRef(0),
    connectionRequest = useRef<Promise<WalletIdentity> | undefined>(undefined);
  const path = location.pathname;
  usePageMotion(path);
  useEffect(() => {
    if (path === "/" && location.hash === "#conditions")
      document.getElementById("conditions")?.scrollIntoView({ block: "start" });
  }, [path]);
  const refresh = useCallback(async () => {
    try {
      setNetwork(await api.network());
      setNetworkError(undefined);
    } catch (e) {
      setNetworkError(e);
      setNetwork(undefined);
    }
  }, []);
  useEffect(() => {
    if (path !== "/") return;
    void refresh();
    const timer = setInterval(() => void refresh(), 15000);
    return () => clearInterval(timer);
  }, [refresh, path]);
  useEffect(() => {
    let alive = true;
    try {
      if (localStorage.getItem("mierkhat.connected") === "freighter")
        void wallet
          .identity()
          .then((i) => {
            if (alive) setIdentity(i);
          })
          .catch(() => {});
    } catch {}
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    if (!identity) return;
    let alive = true;
    const timer = setInterval(() => {
      void wallet
        .identity()
        .then((i) => {
          if (
            alive &&
            (i.address !== identity.address ||
              i.networkPassphrase !== identity.networkPassphrase)
          )
            setIdentity(i);
        })
        .catch(() => {
          if (alive) setIdentity(undefined);
        });
    }, 2000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [identity?.address, identity?.networkPassphrase]);
  async function connect() {
    walletOpener.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setWalletError(undefined);
    setWalletPicker(true);
  }
  function closeWalletPicker() {
    connectionGeneration.current++;
    const opener = walletOpener.current;
    requestAnimationFrame(() => {
      if (opener?.isConnected) opener.focus();
    });
    setWalletPicker(false);
    setConnecting(false);
    setWalletError(undefined);
  }
  async function selectFreighter() {
    if (connectionRequest.current) {
      setWalletError(
        new MierkhatError("WalletRequestOpen", "wallet.request_open"),
      );
      return;
    }
    const generation = ++connectionGeneration.current;
    setConnecting(true);
    setWalletError(undefined);
    const request = connectWallet();
    connectionRequest.current = request;
    void request.then(
      () => {
        if (connectionRequest.current === request)
          connectionRequest.current = undefined;
      },
      () => {
        if (connectionRequest.current === request)
          connectionRequest.current = undefined;
      },
    );
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const identity = await Promise.race([
        request,
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new MierkhatError("WalletTimeout", "wallet.timeout")),
            30000,
          );
        }),
      ]);
      if (generation !== connectionGeneration.current) return;
      if (identity.networkPassphrase !== bundle?.networkPassphrase)
        throw new MierkhatError("Network", "network.wrong");
      setIdentity(identity);
      try {
        localStorage.setItem("mierkhat.connected", "freighter");
      } catch {}
      setWalletPicker(false);
    } catch (error) {
      if (generation === connectionGeneration.current) setWalletError(error);
    } finally {
      clearTimeout(timer);
      if (generation === connectionGeneration.current) setConnecting(false);
    }
  }
  function disconnect() {
    setIdentity(undefined);
    try {
      localStorage.removeItem("mierkhat.connected");
    } catch {}
  }
  useEffect(() => {
    document.title = t(
      path === "/app"
        ? "title.workspace"
        : path.startsWith("/review/")
          ? "title.review"
          : path.startsWith("/receipt/")
            ? "title.receipt"
            : path === "/activity"
              ? "title.activity"
              : path === "/help"
                ? "title.help"
                : path === "/contracts"
                  ? "title.contracts"
                  : path === "/"
                    ? "title.home"
                    : "title.not_found",
    );
    document
      .querySelector('meta[property="og:title"]')
      ?.setAttribute("content", document.title);
  }, [path]);
  let content;
  if (!bundle)
    content = (
      <main id="main" className="wrap standard-page">
        <h1>{t("app.no_deployment")}</h1>
      </main>
    );
  else if (path === "/")
    content = (
      <Home
        bundle={bundle}
        network={network}
        error={networkError}
        refresh={() => void refresh()}
      />
    );
  else if (path === "/app")
    content = (
      <Workspace
        key={(identity?.address ?? "") + (identity?.networkPassphrase ?? "")}
        bundle={bundle}
        identity={
          identity?.networkPassphrase === bundle.networkPassphrase
            ? identity
            : undefined
        }
        connect={connect}
        disconnect={disconnect}
      />
    );
  else if (path === "/activity") content = <Activity />;
  else if (path.startsWith("/receipt/"))
    content = (
      <ReceiptPage bundle={bundle} hash={path.slice("/receipt/".length)} />
    );
  else if (path === "/contracts") content = <Contracts bundle={bundle} />;
  else if (path === "/help") content = <Help />;
  else if (path.startsWith("/review/"))
    content = (
      <SharedReview
        key={(identity?.address ?? "") + (identity?.networkPassphrase ?? "")}
        id={path.slice(8)}
        identity={identity}
        connect={connect}
      />
    );
  else
    content = (
      <main id="main" className="wrap standard-page">
        <h1>{t("app.not_found")}</h1>
        <a className="button" href="/app">
          {t("home.open")}
        </a>
      </main>
    );
  return (
    <>
      <Header currentPath={path} />
      {walletPicker && (
        <WalletDialog
          connecting={connecting}
          error={walletError}
          onSelect={selectFreighter}
          onClose={closeWalletPicker}
        />
      )}
      {content}
      <Footer />
    </>
  );
}
function SharedReview({
  id,
  identity,
  connect,
}: {
  id: string;
  identity?: WalletIdentity;
  connect: () => Promise<void>;
}) {
  const controller = useRef(new ExitController());
  useEffect(
    () => () => controller.current.invalidate(),
    [id, identity?.address, identity?.networkPassphrase],
  );
  const [review, setReview] = useState<Review>(),
    [error, setError] = useState<unknown>(),
    [confirmed, setConfirmed] = useState(false),
    [signing, setSigning] = useState(false),
    [unsent, setUnsent] = useState<{
      attempt: SignedAttempt;
      saved: boolean;
    }>();
  useEffect(() => {
    let active = true;
    void api
      .review(id)
      .then((r) => {
        if (active) setReview(r);
      })
      .catch((e) => {
        if (active) setError(e);
      });
    return () => {
      active = false;
    };
  }, [id]);
  async function sign() {
    if (!review || !bundle || signing) return;
    setSigning(true);
    try {
      const c = controller.current;
      c.setDraft(review.draft);
      verifyReview(
        review,
        review.draft,
        bundle,
        await reviewLedger(reader, review.draft.intent.owner),
      );
      const a = await c.signExit(
        review,
        bundle,
        wallet,
        () => reviewLedger(reader, review.draft.intent.owner),
        () => loadDeployment(bundle, reader, review.draft.intent.owner),
      );
      if (a) {
        const record: RecoveryRecord = {
          environment: "testnet",
          epoch: bundle.epoch,
          hash: a.txHash,
          intentHash: review.intentHash,
          kind: "exit",
          owner: review.draft.intent.owner,
          createdAt: new Date().toISOString(),
        };
        let saved = false;
        try {
          saved = rememberPending(record, localStorage);
        } catch {}
        if (!saved) {
          setUnsent({ attempt: a, saved: false });
          return;
        }
        try {
          await api.submit(a);
          location.assign("/receipt/" + a.txHash);
        } catch {
          setUnsent({ attempt: a, saved: true });
        }
      }
    } catch (e) {
      setError(e);
    } finally {
      setSigning(false);
    }
  }
  return (
    <main id="main" className="wrap standard-page shared-review">
      <PageHeading title={t("review.shared")} intro={t("review.share_note")} />
      <ErrorNotice error={error} />
      {!review && !error && <Busy />}
      {unsent && (
        <SubmissionRecovery
          hash={unsent.attempt.txHash}
          saved={unsent.saved}
          retry={async () => {
            await api.submit(unsent.attempt);
            location.assign("/receipt/" + unsent.attempt.txHash);
          }}
        />
      )}
      {!unsent &&
        review &&
        bundle &&
        (identity?.address === review.draft.intent.owner ? (
          <ReviewPanel
            review={review}
            bundle={bundle}
            onEdit={() => location.assign("/app")}
            onSign={() => void sign()}
            signing={signing}
            confirmed={confirmed}
            onConfirm={() => setConfirmed(!confirmed)}
          />
        ) : (
          <>
            <p>{t("app.review_other_owner")}</p>
            <button className="button" onClick={() => void connect()}>
              {t("wallet.connect")}
            </button>
          </>
        ))}
    </main>
  );
}
