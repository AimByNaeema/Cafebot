# CafeBot

A chatbot-style ordering assistant for a cafe. The backend is a working Express API with an in-file order store; the frontend has a customer-facing chat UI and a staff order dashboard.

## Status

- Backend (`backend/server.js`): implemented — serves the frontend, exposes the orders API, and persists orders to `data/orders.json`.
- Customer chat UI (`frontend/index.html`, `frontend/app.js`): UI only, currently uses mocked data (no live backend calls).
- Staff dashboard (`frontend/staff.html`, `frontend/staff.js`): live — calls the real `/api/orders` and `/api/orders/:id/status` endpoints.
- `/api/chat`: placeholder — returns a canned response. It is not yet wired up to the Anthropic API, despite `ANTHROPIC_API_KEY`/`CLAUDE_MODEL` being present in `.env.example` for future use.

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
| `ANTHROPIC_API_KEY` | Not yet used | Reserved for the future Claude-powered `/api/chat` integration |
| `CLAUDE_MODEL` | Not yet used | Reserved for the future Claude-powered `/api/chat` integration |

## Tests

```bash
cd backend
npm test
```

## Deployment

The app is a single Node process with no build step. A root-level `Procfile` (`web: node backend/server.js`) is included for PaaS platforms (Render, Railway, Heroku-style) that detect and run it automatically. Set `PORT` and the other environment variables above in the platform's dashboard rather than committing a `.env` file.
