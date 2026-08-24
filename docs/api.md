# Ledger API contract

The API runs at `http://localhost:4000`. Protected routes use:

```text
Authorization: Bearer <token>
```

## Authentication

### POST `/api/auth/register`

Request:

```json
{ "name": "Asha", "email": "asha@example.com", "password": "password123" }
```

Returns `201` with a token and user. Passwords are hashed with bcrypt.

### POST `/api/auth/login`

Request:

```json
{ "email": "demo@ledger.local", "password": "Demo@12345" }
```

Returns `200` with a token and user.

### GET `/api/auth/me`

Returns the currently authenticated user.

## Transactions

All transaction routes require authentication.

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/api/transactions` | List the user's transactions |
| POST | `/api/transactions` | Create a transaction |
| PATCH | `/api/transactions/:id` | Edit an owned transaction |
| DELETE | `/api/transactions/:id` | Delete an owned transaction |

Create request:

```json
{
  "amount": 450,
  "type": "expense",
  "category": "Food",
  "description": "Lunch",
  "occurredAt": "2026-08-24T12:00:00.000Z"
}
```

Transactions only belong to the authenticated user. Zod validates all request bodies and invalid input returns `400`.

## Dashboard

### GET `/api/dashboard`

Returns calculated balance, income, expenses, recent transactions, and spending by category.

## Budgets

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/api/budgets?month=2026-08` | List monthly budgets |
| POST | `/api/budgets` | Create a budget |
| PATCH | `/api/budgets/:id` | Edit an owned budget |

Budget request:

```json
{ "category": "Food", "limit": 8000, "month": "2026-08" }
```

## Categories

Ready-made categories power the pickers in transaction and budget forms. The first `GET` request for a user seeds the default set (Food, Transport, Subscriptions, Housing, Utilities, Health, Shopping, Entertainment, Education, Salary, Freelance, Other).

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/api/categories` | List the user's categories |
| POST | `/api/categories` | Add a custom category |
| DELETE | `/api/categories/:id` | Remove a category |

Create request:

```json
{ "name": "Pet care" }
```

Returns `201` with `{ "id": "...", "name": "Pet care" }`. Duplicate names (case-insensitive) return `409`.

## Common status codes

- `200` successful request
- `201` record created
- `204` record deleted
- `400` invalid request data
- `401` missing or invalid token
- `404` record does not exist or is not owned by the user
- `409` duplicate record (email or category already exists)
- `500` unexpected server error
