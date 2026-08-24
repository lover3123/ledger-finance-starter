import "dotenv/config";

export const config = {
  mongoUri: process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27017/ledger",
  jwtSecret: process.env.JWT_SECRET ?? "local-development-secret-change-me",
  port: Number(process.env.PORT ?? 4000),
  clientOrigin: process.env.CLIENT_ORIGIN ?? "http://localhost:5173",
  uploadDir: process.env.UPLOAD_STORAGE ?? "./uploads",
  appBaseUrl: process.env.APP_BASE_URL ?? "http://localhost:5173",
  paymentProvider: (process.env.PAYMENT_PROVIDER ?? "sandbox") as "sandbox" | "production",
  flags: {
    enableUpiIntent: process.env.ENABLE_UPI_INTENT !== "false",
    enableSandboxProvider: process.env.ENABLE_SANDBOX_PROVIDER !== "false",
    enableEvidenceUpload: process.env.ENABLE_EVIDENCE_UPLOAD !== "false",
    enableGroupSplit: process.env.ENABLE_GROUP_SPLIT !== "false",
    enableRelationshipBudget: process.env.ENABLE_RELATIONSHIP_BUDGET !== "false"
  }
};

export const isSandbox = config.paymentProvider === "sandbox";
