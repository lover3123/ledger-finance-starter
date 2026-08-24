import { randomBytes, randomUUID } from "node:crypto";

export function newId() {
  return randomUUID();
}

function shortCode(length: number) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(length);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

export function dateStamp(date = new Date()) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
}

export async function generateUniqueId(prefix: string, codeLength: number, exists: (id: string) => Promise<boolean>) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = `${prefix}-${dateStamp()}-${shortCode(codeLength)}`;
    if (!(await exists(candidate))) return candidate;
  }
  return `${prefix}-${dateStamp()}-${shortCode(codeLength)}${Date.now().toString(36).toUpperCase().slice(-3)}`;
}

export function generateSessionId() {
  return `PAY-${shortCode(8)}`;
}

export function generateTransactionId() {
  return `TXN-${dateStamp()}-${shortCode(8)}`;
}
