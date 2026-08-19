# CafeBot

## Purpose

CafeBot is a chatbot-style ordering assistant for a café. It has a customer-facing chat UI, a staff order dashboard, an Express backend with an order/promotion engine, and a system prompt intended to drive a future Claude-powered `/api/chat`.

## Architecture overview

- `backend/` — Express server (`server.js`) plus the order engine: `order.js` (current order + totals), `orderStore.js` (persists confirmed orders), `menu.js` (menu lookups), `promotions.js` (discount rules), `money.js` (rounding), `config.js` (tax/delivery env config). Orders persist to `data/orders.json`.
- `frontend/` — static files served by the backend. Customer chat (`index.html`, `app.js`, `styles.css`) is currently mock-only (no live API calls). Staff dashboard (`staff.html`, `staff.js`, `staff.css`) is live and calls the real API.
- `data/` — `menu.json` and `promotions.json` are source data; `orders.json` is generated/persisted order history.
- `prompts/system-prompt.md` — system prompt for the future Claude-powered chat; not yet loaded by the server.
- `.env.example` — `PORT`, `TAX_RATE`, `DELIVERY_FEE`, `ORDERS_FILE_PATH`, `ANTHROPIC_API_KEY`, `CLAUDE_MODEL`.
- Request flow: frontend → REST endpoints (`/api/orders`, `/api/orders/:id/status`, `/api/chat`) → backend reads/writes `data/*.json`.

## Coding rules

- Match existing style: plain CommonJS, Express only, no build step, no added frameworks.
- Keep files small and single-purpose, like the existing ones.
- Reuse existing functions (`getOrderTotals`, `evaluatePromotions`, `roundToCents`, `getMenuItem`, etc.) instead of duplicating logic.
- No comments unless explaining a non-obvious "why".
- No speculative abstractions or config beyond what the current task needs.

## Security rules

- Never commit `.env` or real secrets.
- Never log or expose `ANTHROPIC_API_KEY`.
- Validate any user-supplied input (order options, chat messages) before use, consistent with existing validation in `order.js`/`server.js`.
- Never take or store payment information — CafeBot only takes orders, per `prompts/system-prompt.md`'s own guardrails.
- All pricing/totals math must come from the backend order engine only; a chat/model response must never invent or compute its own prices or totals.

## Token-saving rules

- Don't re-read files already in context.
- Prefer targeted edits over full-file rewrites.
- For small, localized changes, go straight to the relevant file(s) instead of exploring the whole repo.
- Avoid large speculative refactors when a small fix suffices.

## Scope rule

- Only modify the files actually needed for the current task. Leave unrelated files untouched.
