# CafeBot

A chatbot-style ordering assistant for a cafe. The backend is a working Express API with an in-file order store; the frontend has a customer-facing chat UI and a staff order dashboard.

## Status

- Backend (`backend/server.js`): implemented — serves the frontend, exposes the orders API, and persists orders to `data/orders.json`.
- Customer chat UI (`frontend/index.html`, `frontend/chat-widget.js`): live — calls the real `/api/chat` endpoint. (`frontend/app.js` is an older, unused mock and is not loaded by `index.html`.)
- Staff dashboard (`frontend/staff.html`, `frontend/staff.js`): live — calls the real `/api/orders` and `/api/orders/:id/status` endpoints.
- `/api/chat`: live — calls the real Anthropic Messages API with a full tool-calling loop (menu lookup, cart management, order details, promotions, deterministic totals, checkout summary, and a confirmation-gated `placeOrder`). Requires a real `ANTHROPIC_API_KEY` in `.env` to return real replies instead of a fallback error.

## Folder layout

- `prompts/` — prompt templates intended to guide CafeBot's conversations (not yet loaded by the server)
- `data/` — menu, promotions, and order data (`menu.json`, `promotions.json`, `orders.json`)
- `frontend/` — customer chat UI and staff order dashboard, served as static files
- `backend/` — the Express server and order logic
- `.env.example` — example environment variables (copy to `.env` and fill in real values; never commit `.env`)
- `Procfile` — process declaration for PaaS deployment (Render/Railway/Heroku-style)

## Local setup

```bash
cd backend
npm install
npm start
```

The server listens on `PORT` (default `3000`). Open `http://localhost:3000/` for the customer chat UI, or `http://localhost:3000/staff.html` for the staff dashboard.

## Environment variables

Copy `.env.example` to `.env` in the project root and adjust as needed:

| Variable | Required | Purpose |
| --- | --- | --- |
| `PORT` | No (default `3000`) | Port the backend listens on |
| `TAX_RATE` | No (default `0`) | Sales tax rate as a decimal fraction, e.g. `0.08` |
| `DELIVERY_FEE` | No (default `0`) | Flat delivery fee added to delivery orders, in dollars |
| `ORDERS_FILE_PATH` | No (default `data/orders.json`) | Overrides where order records are read/written — useful on platforms with an ephemeral filesystem |
| `ANTHROPIC_API_KEY` | **Yes** | Real key for the Anthropic (Claude) API — `/api/chat` returns a generic fallback reply without it |
| `CLAUDE_MODEL` | No (default `claude-sonnet-5`) | Claude model id used for chat responses |

## Tests

```bash
cd backend
npm test
```

## Deployment

The app is a single Node process with no build step. A root-level `Procfile` (`web: node backend/server.js`) is included for PaaS platforms (Render, Railway, Heroku-style) that detect and run it automatically. Set `PORT` and the other environment variables above in the platform's dashboard rather than committing a `.env` file.
