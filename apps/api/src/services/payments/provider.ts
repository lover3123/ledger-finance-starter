import { randomBytes } from "node:crypto";
import { config, isSandbox } from "../../config.js";

export type ProviderSession = {
  upiIntent?: string;
  provider: string;
  providerResponse: Record<string, unknown>;
  providerReference?: string;
  sandbox: boolean;
  appLinks: { name: string; url: string }[];
};

export type ProviderReturn = {
  result: "SUCCESS" | "FAILED" | "CANCELLED" | "PENDING" | "UNKNOWN";
  providerReference?: string;
  authorityVerified: boolean;
  providerResponse: Record<string, unknown>;
};

export interface PaymentProvider {
  readonly name: string;
  readonly sandbox: boolean;
  createSession(input: { amount: number; merchantName: string; merchantUpiId: string; note: string; sessionId: string }): ProviderSession;
  handleReturn(input: { result?: string; upiTransactionReference?: string; providerResponse?: Record<string, unknown> }): ProviderReturn;
  verifyPayment(providerReference: string): Promise<ProviderReturn>;
}

function upiIntentUrl(input: { amount: number; merchantUpiId: string; merchantName: string; note: string; txnRef: string }) {
  const params = new URLSearchParams({
    pa: input.merchantUpiId,
    pn: input.merchantName,
    am: input.amount.toFixed(2),
    cu: "INR",
    tn: input.note,
    tr: input.txnRef
  });
  return `upi://pay?${params.toString()}`;
}

/**
 * Development provider. Produces a real UPI intent deep-link (so the OS can
 * open an installed UPI app) but NEVER reports authoritative verification —
 * sandbox results are explicit simulations driven by the caller.
 */
export class SandboxProvider implements PaymentProvider {
  readonly name = "sandbox";
  readonly sandbox = true;

  createSession(input: { amount: number; merchantName: string; merchantUpiId: string; note: string; sessionId: string }): ProviderSession {
    const reference = `SBX${randomBytes(5).toString("hex").toUpperCase()}`;
    const intent = config.flags.enableUpiIntent
      ? upiIntentUrl({ ...input, txnRef: reference })
      : undefined;
    return {
      upiIntent: intent,
      provider: this.name,
      providerResponse: { simulated: true, reference },
      providerReference: reference,
      sandbox: true,
      appLinks: intent ? [
        { name: "Any UPI app", url: intent },
        { name: "PhonePe", url: `phonepe://pay?${intent.split("?")[1] ?? ""}` },
        { name: "Google Pay", url: `tez://upi/pay?${intent.split("?")[1] ?? ""}` },
        { name: "Paytm", url: `paytmmp://pay?${intent.split("?")[1] ?? ""}` }
      ] : []
    };
  }

  handleReturn(input: { result?: string; upiTransactionReference?: string; providerResponse?: Record<string, unknown> }): ProviderReturn {
    const result = (input.result ?? "UNKNOWN") as ProviderReturn["result"];
    return {
      result,
      providerReference: input.upiTransactionReference,
      // A sandbox simulation is by definition not an authoritative verification.
      authorityVerified: false,
      providerResponse: { simulated: true, ...(input.providerResponse ?? {}) }
    };
  }

  async verifyPayment(): Promise<ProviderReturn> {
    return { result: "UNKNOWN", authorityVerified: false, providerResponse: { simulated: true, reason: "Sandbox provider cannot verify payments with an authority." } };
  }
}

/** Placeholder for a future authorized production integration. */
export class ProductionUPIProvider implements PaymentProvider {
  readonly name = "production-upi";
  readonly sandbox = false;

  createSession(input: { amount: number; merchantName: string; merchantUpiId: string; note: string; sessionId: string }): ProviderSession {
    const reference = `UPI${randomBytes(5).toString("hex").toUpperCase()}`;
    return {
      upiIntent: upiIntentUrl({ ...input, txnRef: reference }),
      provider: this.name,
      providerResponse: { note: "Production provider placeholder — no PSP connected." },
      providerReference: reference,
      sandbox: false,
      appLinks: []
    };
  }

  handleReturn(): ProviderReturn {
    return { result: "PENDING", authorityVerified: false, providerResponse: { reason: "Awaiting PSP webhook integration." } };
  }

  async verifyPayment(): Promise<ProviderReturn> {
    return { result: "PENDING", authorityVerified: false, providerResponse: { reason: "PSP verification not configured." } };
  }
}

export function getProvider(): PaymentProvider {
  return isSandbox && config.flags.enableSandboxProvider ? new SandboxProvider() : new ProductionUPIProvider();
}
