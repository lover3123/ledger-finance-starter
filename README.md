# Ledger — Personal Finance + Peer Payments Platform

**Track your money. Request it. Settle it. Remember it.**

A full-stack TypeScript platform combining personal finance management with peer payment requests, UPI-assisted lending, expense-sharing, and relationship accounting.

## Architecture

```
React + Vite          Frontend SPA (TypeScript)
    │
    ▼
Express REST API      Backend (TypeScript)
    │
    ├── Services       State machine, balances, audit, notifications
    ├── Providers      Payment provider abstraction (Sandbox/Production)
    └── Middleware      Auth, validation, security, rate limiting
    │
    ▼
MongoDB + Mongoose    Persistence layer
```

**Stack:**
- **Frontend:** React 19 + Vite 8 + TypeScript
- **Backend:** Node.js + Express 5 + TypeScript
- **Database:** MongoDB 7 + Mongoose 9
- **Auth:** JWT + bcrypt password hashing
- **Validation:** Zod schemas (server-side)
- **Payments:** Provider abstraction with sandbox mode
- **Security:** Helmet, CORS, input sanitization, rate limiting

## Quick Start (Development)

Prerequisites: Node.js 20.19+, npm, MongoDB running on `localhost:27017`.

```bash
npm install
npm run db:seed
npm run dev
```

Open http://localhost:5173

### Seed Accounts

| Email | Name | Password |
|-------|------|----------|
| `demo@ledger.local` | Rohan Rajbanshi | `Demo@12345` |
| `rahul@ledger.local` | Rahul Sharma | `Demo@12345` |
| `priya@ledger.local` | Priya Verma | `Demo@12345` |

## Product Modules

### Personal Finance
- **Dashboard** — balance, income, expenses, spending by category, Money Pulse
- **Transactions** — full transaction history with filters
- **Budgets** — monthly budgets per category with progress tracking

### Ledger Pay (Peer Payments)
- **People** — search users, send/accept connection requests, view relationships
- **Payment Requests** — create structured requests (borrow, pay on behalf, split, gift)
- **QR Scanner** — scan merchant QR codes or enter UPI details manually
- **Payment Sessions** — UPI app handoff with sandbox simulation
- **Evidence** — submit payment proof (receipt, transaction reference)
- **Confirmation** — receiver confirms or disputes payments

### Lending & Settlements
- **You Owe / Owed to You** — view all outstanding debts
- **Settlements** — full or partial balance settlement
- **Relationship Budgets** — set monthly limits per relationship

### Expense Splitting
- **Equal / Custom / Percentage splits** with friend selection

### System
- **Notifications** — in-app notification center with type-based icons
- **Audit Log** — full state transition history for every transaction

## Payment Lifecycle

```
REQUESTED
    ↓
ACCEPTED
    ↓
PAYMENT_STARTED       ← Payer initiates via QR scan
    ↓
UPI_RETURNED          ← UPI app returns result
    ↓
PENDING_VERIFICATION  ← Awaiting evidence/confirmation
    ↓
EVIDENCE_SUBMITTED    ← Payer submits receipt/reference
    ↓
AWAITING_CONFIRMATION ← Receiver reviews evidence
    ↓
COMPLETED             ← Receiver confirms payment

Alternative states:
REQUESTED → REJECTED
REQUESTED → CANCELLED
PAYMENT_STARTED → FAILED
EVIDENCE_SUBMITTED → DISPUTED
```

**Trust model — three distinct verification levels:**
1. **UPI App Returned** — the UPI app reported a result (not proof of payment)
2. **User Evidence** — payer submitted a receipt/reference (user-submitted, not verified)
3. **Receiver Confirmed** — the recipient confirmed receiving the payment

These are never collapsed into a single "PAID" status.

## Sandbox Payment Flow

In development mode, the `SandboxProvider` simulates the UPI payment flow:

1. Payer scans QR or enters merchant details
2. Creates a payment session (`PAY-XXXXXXXX`)
3. Opens simulated UPI handoff page
4. Clicks one of: **Simulate Success** / **Simulate Failure** / **Simulate Pending** / **Simulate Cancel**
5. Result is recorded in the payment session
6. Payer can submit evidence
7. Receiver confirms or disputes

> **SANDBOX MODE** is always displayed during simulated payments. Sandbox results are never treated as real payment confirmations.

## Docker Production Deployment

### One-command production start:

```bash
# Set a secure JWT secret
export JWT_SECRET=$(openssl rand -hex 32)

# Start all services
docker compose -f docker-compose.prod.yml up -d

# Seed demo data
docker compose -f docker-compose.prod.yml exec api npx tsx src/db/seed.ts
```

Open http://localhost

### Services:
| Service | Port | Description |
|---------|------|-------------|
| `web` | 80 | Nginx serving React SPA + proxying API |
| `api` | 4000 | Express REST API (internal) |
| `mongo` | 27017 | MongoDB (internal) |

### Production build locally:

```bash
# Build API
cd apps/api && npm run build

# Build frontend
cd apps/web && npm run build

# Run production API
cd apps/api && npm start
```

## Environment Variables

### API (`apps/api/.env`)

```env
# Database
MONGODB_URI=mongodb://127.0.0.1:27017/ledger

# Auth (CHANGE IN PRODUCTION)
JWT_SECRET=your-secret-here
JWT_REFRESH_SECRET=your-refresh-secret-here

# Server
PORT=4000
CLIENT_ORIGIN=http://localhost:5173
APP_BASE_URL=http://localhost:5173

# Storage
UPLOAD_STORAGE=./uploads

# Payments
PAYMENT_PROVIDER=sandbox

# Feature Flags
ENABLE_UPI_INTENT=true
ENABLE_SANDBOX_PROVIDER=true
ENABLE_EVIDENCE_UPLOAD=true
ENABLE_GROUP_SPLIT=true
ENABLE_RELATIONSHIP_BUDGET=true
```

## API Reference

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Create account |
| POST | `/api/auth/login` | Login, returns JWT |
| GET | `/api/auth/me` | Get current user |

### People & Relationships
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/users/search?q=` | Search users |
| GET | `/api/friends` | List friends |
| POST | `/api/friends/:userId/connect` | Send connection request |
| PATCH | `/api/friends/:userId/accept` | Accept connection |
| PATCH | `/api/friends/:userId/reject` | Reject connection |
| DELETE | `/api/friends/:userId` | Remove connection |
| GET | `/api/relationships` | List relationships with balances |
| GET | `/api/relationships/:id` | Relationship detail |

### Payment Requests
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/payment-requests` | Create request |
| GET | `/api/payment-requests` | List requests (?box=incoming/outgoing) |
| GET | `/api/payment-requests/:id` | Get request by ID |
| PATCH | `/api/payment-requests/:id/accept` | Accept request |
| PATCH | `/api/payment-requests/:id/reject` | Reject request |
| PATCH | `/api/payment-requests/:id/cancel` | Cancel request |

### Payment Sessions
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/payment-sessions` | Create session |
| GET | `/api/payment-sessions/:id` | Get session |
| POST | `/api/payment-sessions/:id/start` | Start UPI flow |
| POST | `/api/payment-sessions/:id/return` | Record UPI return |

### Transactions
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/pay/transactions` | List pay transactions |
| GET | `/api/pay/summary` | Balance summary |
| GET | `/api/transactions/:id` | Transaction detail |
| POST | `/api/evidence` | Submit evidence |
| POST | `/api/transactions/:id/confirm` | Confirm payment |
| POST | `/api/transactions/:id/dispute` | Dispute payment |

### Settlements
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/settlements` | Create settlement |
| GET | `/api/settlements` | List settlements |

### Expense Splits
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/splits` | Create split |
| GET | `/api/splits` | List splits |
| GET | `/api/splits/:id` | Split detail |

### System
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| GET | `/api/notifications` | List notifications |
| PATCH | `/api/notifications/:id/read` | Mark notification read |
| GET | `/api/audit/:entityType/:entityId` | Audit log for entity |
| GET | `/api/dashboard` | Personal finance dashboard |
| GET | `/api/transactions` | Personal finance transactions |
| POST | `/api/transactions` | Create personal transaction |
| GET | `/api/budgets` | List budgets |
| POST | `/api/budgets` | Create/update budget |
| GET | `/api/settings` | User settings |
| PATCH | `/api/settings` | Update settings |

## Project Structure

```
├── apps/
│   ├── api/                    # Express REST API
│   │   └── src/
│   │       ├── config.ts       # Environment configuration
│   │       ├── server.ts       # Express app + middleware
│   │       ├── db/
│   │       │   ├── mongo.ts    # MongoDB connection
│   │       │   ├── indexes.ts  # Production database indexes
│   │       │   ├── seed.ts     # Demo data seeder
│   │       │   └── migrate.ts  # Database migration
│   │       ├── models/         # Mongoose schemas
│   │       ├── routes/         # Express route handlers
│   │       ├── services/       # Business logic
│   │       │   ├── balances.ts       # Balance engine
│   │       │   ├── stateMachine.ts   # Transaction state machine
│   │       │   ├── audit.ts          # Audit logging
│   │       │   ├── notify.ts         # Notification service
│   │       │   ├── ids.ts            # ID generation
│   │       │   └── payments/
│   │       │       └── provider.ts   # Payment provider abstraction
│   │       └── middleware/
│   │           ├── auth.ts           # JWT authentication
│   │           └── production.ts     # Security, timeout, sanitization
│   │
│   └── web/                    # React SPA
│       └── src/
│           ├── App.tsx         # Router + layout
│           ├── api.ts          # API client (all endpoints)
│           ├── pages/          # Page components
│           ├── components/     # Shared components
│           ├── styles.css      # Base styles
│           └── ledger-pay.css  # Ledger Pay styles
│
├── packages/
│   └── shared/                 # Shared TypeScript types
│
├── Dockerfile.api              # API production image
├── Dockerfile.web              # Frontend production image (Nginx)
├── docker-compose.prod.yml     # Production stack
└── nginx.conf                  # Nginx configuration
```

## Security

- **JWT authentication** on all sensitive routes
- **bcrypt** password hashing
- **Helmet** security headers
- **CORS** restricted to configured origin
- **Input sanitization** strips XSS/injection patterns
- **Request timeout** prevents slow loris attacks
- **Server-controlled state machine** — clients cannot skip states
- **Ownership checks** — users can only access their own data
- **Audit trail** — every state transition is logged
- **No credential storage** — never stores UPI PIN, bank passwords, or payment app credentials
- **Idempotent payment APIs** — prevents duplicate transactions

## License

Private project.
