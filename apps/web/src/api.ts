import type {
  AuthResponse, BalanceAdjustment, Budget, BudgetInput, Category, Dashboard,
  FinancialSetup, LoginInput, RegisterInput, Transaction, TransactionInput, User,
  FriendDTO, RelationshipDTO, PaymentRequestDTO, PayTransactionDTO, PaySummaryDTO,
  SettlementDTO, ExpenseSplitDTO, NotificationDTO, AuditEventDTO, EvidenceDTO,
  SplitParticipantDTO, PayUserDTO
} from "@ledger/shared";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem("ledger_token");
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {})
    }
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.message ?? `Request failed (${response.status})`);
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

async function upload<T>(path: string, formData: FormData): Promise<T> {
  const token = localStorage.getItem("ledger_token");
  const response = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: formData
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.message ?? `Upload failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}

// ---------- Auth & Personal Finance ----------

export const api = {
  login: (body: LoginInput) => request<AuthResponse>("/api/auth/login", { method: "POST", body: JSON.stringify(body) }),
  register: (body: RegisterInput) => request<AuthResponse>("/api/auth/register", { method: "POST", body: JSON.stringify(body) }),
  me: () => request<User>("/api/auth/me"),
  dashboard: (month?: string) => request<Dashboard>(`/api/dashboard${month ? `?month=${encodeURIComponent(month)}` : ""}`),
  transactions: (filters?: { type?: string; category?: string; month?: string }) => {
    const query = new URLSearchParams();
    if (filters?.type) query.set("type", filters.type);
    if (filters?.category) query.set("category", filters.category);
    if (filters?.month) query.set("month", filters.month);
    const suffix = query.toString() ? `?${query.toString()}` : "";
    return request<Transaction[]>(`/api/transactions${suffix}`);
  },
  addTransaction: (body: TransactionInput) => request<Transaction>("/api/transactions", { method: "POST", body: JSON.stringify(body) }),
  updateTransaction: (id: string, body: Partial<TransactionInput>) => request<Transaction>(`/api/transactions/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteTransaction: (id: string) => request<void>(`/api/transactions/${id}`, { method: "DELETE" }),
  budgets: (month?: string) => request<Budget[]>(`/api/budgets${month ? `?month=${encodeURIComponent(month)}` : ""}`),
  addBudget: (body: BudgetInput) => request<Budget>("/api/budgets", { method: "POST", body: JSON.stringify(body) }),
  updateBudget: (id: string, body: Partial<BudgetInput>) => request<Budget>(`/api/budgets/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteBudget: (id: string) => request<void>(`/api/budgets/${id}`, { method: "DELETE" }),
  categories: () => request<Category[]>("/api/categories"),
  addCategory: (name: string) => request<Category>("/api/categories", { method: "POST", body: JSON.stringify({ name }) }),
  updateCategory: (id: string, body: { name?: string; archived?: boolean }) => request<Category>(`/api/categories/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  archiveCategory: (id: string) => request<Category>(`/api/categories/${id}/archive`, { method: "PATCH" }),
  deleteCategory: (id: string) => request<void>(`/api/categories/${id}`, { method: "DELETE" }),
  getFinancialSetup: (month?: string) => request<FinancialSetup>(`/api/settings/financial${month ? `?month=${encodeURIComponent(month)}` : ""}`),
  updateFinancialSetup: (body: { startingBalance?: number; startingBalanceDate?: string }) => request<FinancialSetup>("/api/settings/financial", { method: "PATCH", body: JSON.stringify(body) }),
  balanceAdjustments: (month?: string) => request<BalanceAdjustment[]>(`/api/balance-adjustments${month ? `?month=${encodeURIComponent(month)}` : ""}`),
  addBalanceAdjustment: (body: { amount: number; reason: string }) => request<BalanceAdjustment>("/api/balance-adjustments", { method: "POST", body: JSON.stringify(body) }),
  deleteAccount: (password: string) => request<{ message: string }>("/api/auth/account", { method: "DELETE", body: JSON.stringify({ confirmation: "DELETE", password }) }),

  // ---------- People / Friends ----------
  searchUsers: (q: string) => request<{ id: string; name: string; email: string; connectionStatus: string; direction: string }[]>(`/api/users/search?q=${encodeURIComponent(q)}`),
  sendFriendRequest: (userId: string) => request<{ message: string }>("/api/friends", { method: "POST", body: JSON.stringify({ userId }) }),
  getFriends: () => request<FriendDTO[]>("/api/friends"),
  acceptFriend: (friendshipId: string) => request<{ message: string }>(`/api/friends/${friendshipId}/accept`, { method: "PATCH" }),
  rejectFriend: (friendshipId: string) => request<{ message: string }>(`/api/friends/${friendshipId}/reject`, { method: "PATCH" }),
  removeFriend: (friendshipId: string) => request<void>(`/api/friends/${friendshipId}`, { method: "DELETE" }),

  // ---------- Relationships ----------
  getRelationships: () => request<RelationshipDTO[]>("/api/relationships"),
  getRelationship: (id: string) => request<RelationshipDTO & { recentActivity: { transactionId: string; merchantName: string; amount: number; type: string; status: string; createdAt: string }[] }>(`/api/relationships/${id}`),
  updateRelationshipLimits: (id: string, body: { monthlyLimit?: number; maxTransaction?: number; maxOutstanding?: number }) => request<RelationshipDTO>(`/api/relationships/${id}/limits`, { method: "PATCH", body: JSON.stringify(body) }),

  // ---------- Payment Requests ----------
  createPaymentRequest: (body: { counterpartyId: string; amount: number; type: string; reason: string; description?: string; dueDate?: string; upiIntent?: { merchantName: string; merchantUpiId: string } }) =>
    request<PaymentRequestDTO & { senderName: string; message: string }>("/api/payment-requests", { method: "POST", body: JSON.stringify(body) }),
  getPaymentRequests: (box?: string) => request<PaymentRequestDTO[]>(`/api/payment-requests${box ? `?box=${box}` : ""}`),
  getPaymentRequest: (id: string) => request<PaymentRequestDTO>(`/api/payment-requests/${id}`),
  acceptPaymentRequest: (id: string) => request<PaymentRequestDTO>(`/api/payment-requests/${id}/accept`, { method: "PATCH" }),
  rejectPaymentRequest: (id: string) => request<PaymentRequestDTO>(`/api/payment-requests/${id}/reject`, { method: "PATCH" }),
  cancelPaymentRequest: (id: string) => request<PaymentRequestDTO>(`/api/payment-requests/${id}/cancel`, { method: "PATCH" }),

  // ---------- Payment Sessions ----------
  createPaymentSession: (body: { requestId: string; merchantName: string; merchantUpiId: string }, idempotencyKey?: string) =>
    request<{ id: string; sessionId: string; transactionId?: string; requestId?: string; merchantName: string; merchantUpiId: string; amount: number; upiIntent?: string; provider: string; status: string; appLinks: { name: string; url: string }[]; sandbox: boolean; sandboxResult?: string; duplicate?: boolean }>("/api/payment-sessions", {
      method: "POST",
      body: JSON.stringify(body),
      headers: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}
    }),
  getPaymentSession: (id: string) => request<{
    id: string; sessionId: string; requestId?: string; transactionId?: string;
    merchantName: string; merchantUpiId: string; amount: number; upiIntent?: string;
    provider: string; status: string; appLinks: { name: string; url: string }[];
    sandbox: boolean; sandboxResult?: string;
  }>(`/api/payment-sessions/${id}`),
  returnPaymentSession: (id: string, body: { result: string; upiTransactionReference?: string; providerResponse?: Record<string, unknown> }) =>
    request<{ session: { sessionId: string }; transactionStatus: string; verification: Record<string, string>; message: string; canSubmitEvidence?: boolean }>(`/api/payment-sessions/${id}/return`, { method: "POST", body: JSON.stringify(body) }),
  sandboxSimulate: (sessionId: string, result: string) =>
    request<{ ok: boolean; result: string; upiTransactionReference: string }>(`/api/payment-sessions/${sessionId}/sandbox`, { method: "POST", body: JSON.stringify({ result }) }),

  // ---------- Pay Transactions ----------
  getPayTransactions: (status?: string) => request<PayTransactionDTO[]>(`/api/pay/transactions${status ? `?status=${status}` : ""}`),
  getPaySummary: () => request<PaySummaryDTO>("/api/pay/summary"),
  getPayTransaction: (id: string) => request<PayTransactionDTO>(`/api/pay/transactions/${id}`),
  submitEvidence: (transactionId: string, formData: FormData) => upload<PayTransactionDTO>(`/api/pay/transactions/${transactionId}/evidence`, formData),
  confirmPayment: (transactionId: string, idempotencyKey?: string) =>
    request<PayTransactionDTO>(`/api/pay/transactions/${transactionId}/confirm`, {
      method: "POST",
      body: JSON.stringify({}),
      headers: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}
    }),
  disputePayment: (transactionId: string, reason: string) =>
    request<PayTransactionDTO>(`/api/pay/transactions/${transactionId}/dispute`, { method: "POST", body: JSON.stringify({ reason }) }),

  // ---------- Settlements ----------
  createSettlement: (relationshipId: string, amount: number) =>
    request<{ id: string; balance: { owedToMe: number; iOwe: number; net: number }; message: string }>(`/api/relationships/${relationshipId}/settlements`, { method: "POST", body: JSON.stringify({ amount }) }),
  getSettlements: () => request<SettlementDTO[]>("/api/settlements"),

  // ---------- Expense Splits ----------
  createSplit: (body: { merchant: string; note?: string; totalAmount: number; splitType: string; participants: { userId: string; share: number }[] }) =>
    request<ExpenseSplitDTO>("/api/splits", { method: "POST", body: JSON.stringify(body) }),
  getSplits: () => request<ExpenseSplitDTO[]>("/api/splits"),
  getSplit: (id: string) => request<ExpenseSplitDTO>(`/api/splits/${id}`),

  // ---------- Notifications ----------
  getNotifications: () => request<{ unread: number; notifications: NotificationDTO[] }>("/api/notifications"),
  markNotificationRead: (id: string) => request<{ ok: boolean }>(`/api/notifications/${id}/read`, { method: "PATCH" }),
  markAllNotificationsRead: () => request<{ ok: boolean }>("/api/notifications/read-all", { method: "PATCH" }),

  // ---------- Audit ----------
  getAuditLog: (entityType: string, entityId: string) => request<AuditEventDTO[]>(`/api/audit/${entityType}/${entityId}`),
};
