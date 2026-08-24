import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";

const BASE = "http://localhost:4000";

function req(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
    const opts: http.RequestOptions = {
      hostname: url.hostname,
      port: url.port,
      method,
      path: url.pathname + url.search,
      headers: { "Content-Type": "application/json", ...headers }
    };
    const r = http.request(opts, (res) => {
      let d = "";
      res.on("data", (c) => (d += c));
      res.on("end", () => {
        let parsed: any;
        try { parsed = JSON.parse(d); } catch { parsed = d; }
        resolve({ status: res.statusCode || 0, body: parsed });
      });
    });
    r.on("error", reject);
    if (body) r.write(JSON.stringify(body));
    r.end();
  });
}

let token = "";
let userId = "";

beforeAll(async () => {
  // Login with seed user
  const login = await req("POST", "/api/auth/login", { email: "demo@ledger.local", password: "Demo@12345" });
  if (login.status === 200 && login.body.token) {
    token = login.body.token;
    userId = login.body.user.id;
  }
});

function auth() { return { Authorization: `Bearer ${token}` }; }

// ── Health ───────────────────────────────────────────────────────────────────

describe("Health", () => {
  it("GET /health returns ok", async () => {
    const r = await req("GET", "/health");
    expect(r.status).toBe(200);
    expect(r.body.status).toBe("ok");
  });
});

// ── Auth ─────────────────────────────────────────────────────────────────────

describe("Auth", () => {
  it("POST /api/auth/login with valid credentials returns token", async () => {
    const r = await req("POST", "/api/auth/login", { email: "demo@ledger.local", password: "Demo@12345" });
    expect(r.status).toBe(200);
    expect(r.body.token).toBeDefined();
    expect(r.body.user).toBeDefined();
  });

  it("POST /api/auth/login with wrong password returns 401", async () => {
    const r = await req("POST", "/api/auth/login", { email: "demo@ledger.local", password: "wrongpassword" });
    expect(r.status).toBe(401);
  });

  it("GET /api/auth/me with valid token returns user", async () => {
    const r = await req("GET", "/api/auth/me", undefined, auth());
    expect(r.status).toBe(200);
    expect(r.body.id).toBe(userId);
  });

  it("GET /api/auth/me without token returns 401", async () => {
    const r = await req("GET", "/api/auth/me");
    expect(r.status).toBe(401);
  });

  it("GET /api/auth/me with invalid token returns 401", async () => {
    const r = await req("GET", "/api/auth/me", undefined, { Authorization: "Bearer invalid" });
    expect(r.status).toBe(401);
  });
});

// ── Friends ──────────────────────────────────────────────────────────────────

describe("Friends", () => {
  it("GET /api/friends returns friend list", async () => {
    const r = await req("GET", "/api/friends", undefined, auth());
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body)).toBe(true);
  });

  it("GET /api/users/search?q=rahul returns results", async () => {
    const r = await req("GET", "/api/users/search?q=rahul", undefined, auth());
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body)).toBe(true);
  });

  it("GET /api/users/search with short query returns empty", async () => {
    const r = await req("GET", "/api/users/search?q=a", undefined, auth());
    expect(r.status).toBe(200);
    expect(r.body).toEqual([]);
  });
});

// ── Relationships ────────────────────────────────────────────────────────────

describe("Relationships", () => {
  it("GET /api/relationships returns relationship list", async () => {
    const r = await req("GET", "/api/relationships", undefined, auth());
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body)).toBe(true);
  });
});

// ── Payment Requests ─────────────────────────────────────────────────────────

describe("Payment Requests", () => {
  it("GET /api/payment-requests returns request list", async () => {
    const r = await req("GET", "/api/payment-requests", undefined, auth());
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body)).toBe(true);
  });

  it("GET /api/payment-requests?box=incoming returns incoming", async () => {
    const r = await req("GET", "/api/payment-requests?box=incoming", undefined, auth());
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body)).toBe(true);
  });

  it("GET /api/payment-requests/:id by requestId returns request", async () => {
    const r = await req("GET", "/api/payment-requests/REQ-20260824-DEMO3", undefined, auth());
    expect(r.status).toBe(200);
    expect(r.body.requestId).toBe("REQ-20260824-DEMO3");
  });

  it("GET /api/payment-requests/nonexistent returns 404", async () => {
    const r = await req("GET", "/api/payment-requests/REQ-NONEXISTENT", undefined, auth());
    expect(r.status).toBe(404);
  });
});

// ── Payment Sessions ─────────────────────────────────────────────────────────

describe("Payment Sessions", () => {
  it("GET /api/payment-sessions/:id for nonexistent returns 404", async () => {
    const r = await req("GET", "/api/payment-sessions/PAY-NONEXISTENT", undefined, auth());
    expect(r.status).toBe(404);
  });

  it("POST /api/payment-sessions with invalid requestId returns error", async () => {
    const r = await req("POST", "/api/payment-sessions", {
      requestId: "REQ-NONEXISTENT",
      merchantName: "Test",
      merchantUpiId: "test@upi"
    }, auth());
    expect(r.status).toBe(404);
  });
});

// ── Pay Transactions ─────────────────────────────────────────────────────────

describe("Pay Transactions", () => {
  it("GET /api/pay/transactions returns list", async () => {
    const r = await req("GET", "/api/pay/transactions", undefined, auth());
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body)).toBe(true);
  });

  it("GET /api/pay/summary returns summary", async () => {
    const r = await req("GET", "/api/pay/summary", undefined, auth());
    expect(r.status).toBe(200);
    expect(typeof r.body.owedToMe).toBe("number");
    expect(typeof r.body.iOwe).toBe("number");
    expect(typeof r.body.net).toBe("number");
  });
});

// ── Notifications ────────────────────────────────────────────────────────────

describe("Notifications", () => {
  it("GET /api/notifications returns list", async () => {
    const r = await req("GET", "/api/notifications", undefined, auth());
    expect(r.status).toBe(200);
    expect(typeof r.body.unread).toBe("number");
    expect(Array.isArray(r.body.notifications)).toBe(true);
  });
});

// ── Dashboard ────────────────────────────────────────────────────────────────

describe("Dashboard", () => {
  it("GET /api/dashboard returns financial data", async () => {
    const r = await req("GET", "/api/dashboard", undefined, auth());
    expect(r.status).toBe(200);
    expect(typeof r.body.balance).toBe("number");
    expect(typeof r.body.income).toBe("number");
    expect(typeof r.body.expenses).toBe("number");
    expect(Array.isArray(r.body.spendingByCategory)).toBe(true);
  });
});

// ── Security ─────────────────────────────────────────────────────────────────

describe("Security", () => {
  it("Returns security headers", async () => {
    const r = await req("GET", "/health");
    expect(r.status).toBe(200);
  });

  it("404 returns JSON not HTML", async () => {
    const r = await req("GET", "/api/nonexistent-endpoint");
    expect(r.status).toBe(404);
    expect(typeof r.body.message).toBe("string");
  });

  it("Invalid JSON body returns 400", async () => {
    const r = await new Promise<{ status: number; body: any }>((resolve) => {
      const url = new URL("/api/auth/login", BASE);
      const httpReq = http.request({
        hostname: url.hostname,
        port: url.port,
        method: "POST",
        path: url.pathname,
        headers: { "Content-Type": "application/json" }
      }, (res) => {
        let d = "";
        res.on("data", (c) => (d += c));
        res.on("end", () => {
          let parsed: any;
          try { parsed = JSON.parse(d); } catch { parsed = d; }
          resolve({ status: res.statusCode || 0, body: parsed });
        });
      });
      httpReq.write("not json");
      httpReq.end();
    });
    expect(r.status).toBe(400);
  });
});

// ── Settlements ──────────────────────────────────────────────────────────────

describe("Settlements", () => {
  it("GET /api/settlements returns list", async () => {
    const r = await req("GET", "/api/settlements", undefined, auth());
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body)).toBe(true);
  });
});

// ── Expense Splits ───────────────────────────────────────────────────────────

describe("Expense Splits", () => {
  it("GET /api/splits returns list", async () => {
    const r = await req("GET", "/api/splits", undefined, auth());
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body)).toBe(true);
  });
});
