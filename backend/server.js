require('dotenv').config();

const path = require('node:path');
const express = require('express');
const cors = require('cors');
const { readOrders, updateOrderStatus, ORDER_STATUSES } = require('./orderStore');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'frontend')));

app.get('/api/orders', (req, res) => {
  const orders = readOrders().slice().reverse();
  res.json(orders);
});

app.patch('/api/orders/:orderId/status', (req, res) => {
  const { status } = req.body || {};

  if (typeof status !== 'string' || !ORDER_STATUSES.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${ORDER_STATUSES.join(', ')}` });
  }

  const result = updateOrderStatus(req.params.orderId, status);
  if (!result.ok) {
    return res.status(404).json({ error: 'order not found' });
  }

  res.json(result.order);
});

app.post('/api/chat', (req, res) => {
  const { message, history } = req.body || {};

  if (typeof message !== 'string' || message.trim() === '') {
    return res.status(400).json({ error: 'message is required' });
  }
  if (history !== undefined && !Array.isArray(history)) {
    return res.status(400).json({ error: 'history must be an array' });
  }

  res.json({
    reply: "Thanks for your message! (This is a placeholder response — CafeBot isn't connected to the AI model yet.)",
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`CafeBot backend listening on port ${PORT}`);
});
