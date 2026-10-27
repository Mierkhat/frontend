import {
  getAddress,
  isConnected,
  getNetworkDetails,
  requestAccess,
  signTransaction,
} from "@stellar/freighter-api";
import type { WalletAdapter } from "@mierkhat/sdk";
import { MierkhatError } from "@mierkhat/sdk";
export const wallet: WalletAdapter = {
  async identity() {
    const [account, network] = await Promise.all([
      getAddress(),
      getNetworkDetails(),
    ]);
    if (account.error || network.error || !account.address)
      throw new MierkhatError("WalletUnavailable", "wallet.unavailable");
    return {
      address: account.address,
      networkPassphrase: network.networkPassphrase,
    };
  },
  async sign(transactionXdr, networkPassphrase, address) {
    const result = await signTransaction(transactionXdr, {
      networkPassphrase,
      address,
    });
    if (result.error)
      throw new MierkhatError("WalletDeclined", "wallet.declined");
    if (result.signerAddress !== address)
      throw new MierkhatError("WalletChanged", "wallet.changed");
    return result.signedTxXdr;
  },
};
export async function connectWallet() {
  const result = await requestAccess();
  if (result.error || !result.address)
    throw new MierkhatError("WalletUnavailable", "wallet.unavailable");
  return wallet.identity();
}

export async function getFreighterAvailability(): Promise<
  "available" | "missing" | "unavailable"
> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      isConnected(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("DetectionTimeout")), 3000);
      }),
    ]);
    return result.error
      ? "unavailable"
      : result.isConnected
        ? "available"
        : "missing";
  } catch {
    return "unavailable";
  } finally {
    clearTimeout(timer);
  }
}
