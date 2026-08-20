const ORDER_STATUSES = ['NEW', 'confirmed', 'preparing', 'ready', 'completed', 'cancelled'];

const ordersArea = document.getElementById('ordersArea');
const emptyState = document.getElementById('emptyState');
const refreshBtn = document.getElementById('refreshBtn');
const orderCardTemplate = document.getElementById('orderCardTemplate');

function formatTime(isoString) {
  return new Date(isoString).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatOptions(options) {
  return Object.entries(options || {})
    .filter(([, value]) => value && value !== 'none' && value !== 'no')
    .map(([name, value]) => `${name}: ${value}`)
    .join(', ');
}

function renderOrder(order) {
  const card = orderCardTemplate.content.firstElementChild.cloneNode(true);

  card.dataset.orderId = order.orderId;
  card.querySelector('.order-id').textContent = `#${order.orderId.slice(0, 8)}`;
  card.querySelector('.order-time').textContent = formatTime(order.timestamp);
  card.querySelector('.order-customer').textContent = `Customer: ${order.customerName || 'Guest'}`;

  const fulfillmentBadge = card.querySelector('.fulfillment-badge');
  fulfillmentBadge.textContent = order.fulfillmentType === 'delivery' ? 'Delivery' : 'Pickup';

  const itemsList = card.querySelector('.order-items');
  order.items.forEach((item) => {
    const li = document.createElement('li');
    const optionsText = formatOptions(item.options);
    const nameSpan = document.createElement('span');
    nameSpan.className = 'order-item-name';
    nameSpan.textContent = `${item.quantity}x ${item.name}${optionsText ? ` (${optionsText})` : ''}`;
    const priceSpan = document.createElement('span');
    priceSpan.textContent = `$${item.lineTotal.toFixed(2)}`;
    li.appendChild(nameSpan);
    li.appendChild(priceSpan);
    itemsList.appendChild(li);
  });

  card.querySelector('.order-total').textContent = `Total: $${order.total.toFixed(2)}`;

  const statusBadge = card.querySelector('.status-badge');
  statusBadge.textContent = order.status;
  statusBadge.className = `status-badge ${order.status}`;

  const statusSelect = card.querySelector('.status-select');
  ORDER_STATUSES.forEach((status) => {
    const option = document.createElement('option');
    option.value = status;
    option.textContent = status;
    statusSelect.appendChild(option);
  });
  statusSelect.value = order.status;

  const errorEl = card.querySelector('.order-error');

  statusSelect.addEventListener('change', async () => {
    const previousStatus = order.status;
    const newStatus = statusSelect.value;
    errorEl.hidden = true;
    statusSelect.disabled = true;

    try {
      const res = await fetch(`/api/orders/${order.orderId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!res.ok) {
        throw new Error((await res.json().catch(() => ({}))).error || 'Update failed');
      }

      order.status = newStatus;
      statusBadge.textContent = newStatus;
      statusBadge.className = `status-badge ${newStatus}`;
    } catch (err) {
      statusSelect.value = previousStatus;
      errorEl.textContent = err.message;
      errorEl.hidden = false;
    } finally {
      statusSelect.disabled = false;
    }
  });

  return card;
}

async function loadOrders() {
  refreshBtn.disabled = true;
  try {
    const res = await fetch('/api/orders');
    const orders = await res.json();

    ordersArea.querySelectorAll('.order-card').forEach((card) => card.remove());
    emptyState.hidden = orders.length > 0;

    orders.forEach((order) => {
      ordersArea.appendChild(renderOrder(order));
    });
  } finally {
    refreshBtn.disabled = false;
  }
}

refreshBtn.addEventListener('click', loadOrders);

loadOrders();
