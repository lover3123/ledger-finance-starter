import "dotenv/config";
import express, { type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import helmet from "helmet";
import path from "node:path";
import { z } from "zod";
import { config, isSandbox } from "./config.js";
import { connectMongo } from "./db/mongo.js";
import { ensureIndexes } from "./db/indexes.js";
import { securityHeaders, requestId, requestTimeout, sanitizeInput } from "./middleware/production.js";
import { authRouter } from "./routes/auth.js";
import { personalRouter } from "./routes/personal.js";
import { friendsRouter } from "./routes/friends.js";
import { relationshipsRouter } from "./routes/relationships.js";
import { paymentRequestsRouter } from "./routes/paymentRequests.js";
import { paymentSessionsRouter } from "./routes/paymentSessions.js";
import { payTransactionsRouter } from "./routes/payTransactions.js";
import { settlementsRouter } from "./routes/settlements.js";
import { splitsRouter } from "./routes/splits.js";
import { notificationsRouter } from "./routes/notifications.js";
import { auditRouter } from "./routes/audit.js";
import { settingsRouter } from "./routes/settings.js";

// ── Logging ──────────────────────────────────────────────────────────────────

function log(level: "info" | "warn" | "error", msg: string, meta?: Record<string, unknown>) {
  const entry = { ts: new Date().toISOString(), level, msg, ...meta };
  if (level === "error") console.error(JSON.stringify(entry));
  else console.log(JSON.stringify(entry));
}

// ── Bootstrap ────────────────────────────────────────────────────────────────

await connectMongo();
await ensureIndexes();

const app = express();

// ── Security & middleware ────────────────────────────────────────────────────

app.use(helmet({ contentSecurityPolicy: false }));
app.use(securityHeaders);
app.use(requestId);
app.use(requestTimeout(30_000));
app.use(sanitizeInput);
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (curl, mobile apps, server-to-server)
    if (!origin) return callback(null, true);
    const allowed = config.clientOrigin.split(",").map(s => s.trim());
    if (allowed.includes(origin) || allowed.includes("*")) {
      callback(null, true);
    } else {
      callback(null, true); // In sandbox mode allow all; tighten in production
    }
  },
  methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "Idempotency-Key"],
  credentials: true,
  maxAge: 86400
}));
app.use(express.json({ limit: "1mb" }));
app.use("/api", (_req, res, next) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  next();
});
app.use("/uploads", express.static(path.resolve(config.uploadDir), { maxAge: "1d" }));

// ── Request logging ──────────────────────────────────────────────────────────

app.use((req: Request, _res: Response, next: NextFunction) => {
  const start = Date.now();
  _res.on("finish", () => {
    const ms = Date.now() - start;
    const level = _res.statusCode >= 500 ? "error" : _res.statusCode >= 400 ? "warn" : "info";
    log(level, `${req.method} ${req.path}`, {
      status: _res.statusCode,
      ms,
      requestId: (req as any).requestId,
      ip: req.ip
    });
  });
  next();
});

// ── Health check ─────────────────────────────────────────────────────────────

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    provider: config.paymentProvider,
    sandbox: isSandbox,
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString()
  });
});

// ── Routes ───────────────────────────────────────────────────────────────────

app.use(authRouter);
app.use(personalRouter);
app.use(friendsRouter);
app.use(relationshipsRouter);
app.use(paymentRequestsRouter);
app.use(paymentSessionsRouter);
app.use(payTransactionsRouter);
app.use(settlementsRouter);
app.use(splitsRouter);
app.use(notificationsRouter);
app.use(auditRouter);
app.use(settingsRouter);

// ── 404 handler ──────────────────────────────────────────────────────────────

app.use((req: Request, res: Response) => {
  res.status(404).json({ message: `No route: ${req.method} ${req.path}` });
});

// ── Global error handler ─────────────────────────────────────────────────────

app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  const requestId = (req as any).requestId || "unknown";

  if (err instanceof z.ZodError) {
    log("warn", "Validation failed", { requestId, issues: err.issues });
    return res.status(400).json({ message: "Validation failed", issues: err.issues });
  }

  const error = err as { status?: number; message?: string; limit?: unknown; code?: string | number };

  if (error?.status) {
    log("warn", error.message ?? "Request failed", { requestId, status: error.status });
    return res.status(error.status).json({
      message: error.message ?? "Request failed",
      code: error.code,
      limit: error.limit
    });
  }

  if (error?.code === 11000) {
    log("warn", "Duplicate key", { requestId });
    return res.status(409).json({ message: "This record already exists." });
  }

  // Don't leak internal details in production
  log("error", "Unhandled error", { requestId, error: String(err) });
  res.status(500).json({ message: "Internal server error" });
});

// ── Start server ─────────────────────────────────────────────────────────────

const server = app.listen(config.port, "0.0.0.0", () => {
  log("info", `Ledger API listening`, { port: config.port, host: "0.0.0.0", provider: config.paymentProvider, sandbox: isSandbox });
});

// ── Graceful shutdown ────────────────────────────────────────────────────────

let shuttingDown = false;

function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  log("info", `${signal} received, shutting down gracefully...`);

  server.close(() => {
    log("info", "HTTP server closed");
    // Close MongoDB connection
    import("mongoose").then(({ default: mongoose }) => {
      mongoose.connection.close(false).then(() => {
        log("info", "MongoDB connection closed");
        process.exit(0);
      });
    }).catch(() => process.exit(0));
  });

  // Force exit after 10 seconds
  setTimeout(() => {
    log("error", "Forced shutdown after timeout");
    process.exit(1);
  }, 10_000);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// Handle unhandled rejections
process.on("unhandledRejection", (reason) => {
  log("error", "Unhandled rejection", { reason: String(reason) });
});

process.on("uncaughtException", (err) => {
  log("error", "Uncaught exception", { error: err.message, stack: err.stack });
  shutdown("uncaughtException");
});
