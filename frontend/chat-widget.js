// Floating CafeBot chat widget — mock UI only. No API calls; the reply is a
// fixed canned message.

const MOCK_REPLY = "Hi! I'm CafeBot. My AI brain isn't connected yet.";

const toggleBtn = document.getElementById('chatWidgetToggle');
const panel = document.getElementById('chatWidgetPanel');
const closeBtn = document.getElementById('chatWidgetClose');
const messagesEl = document.getElementById('chatWidgetMessages');
const form = document.getElementById('chatWidgetForm');
const input = document.getElementById('chatWidgetInput');
const sendBtn = document.getElementById('chatWidgetSend');

function currentTime() {
  return new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function scrollToBottom() {
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function appendMessage(sender, text) {
  const row = document.createElement('div');
  row.className = `chat-widget-row ${sender}`;

  const bubble = document.createElement('div');
  bubble.className = 'chat-widget-bubble';

  const textEl = document.createElement('span');
  textEl.textContent = text;
  bubble.appendChild(textEl);

  const timeEl = document.createElement('span');
  timeEl.className = 'chat-widget-time';
  timeEl.textContent = currentTime();
  bubble.appendChild(timeEl);

  row.appendChild(bubble);
  messagesEl.appendChild(row);
  scrollToBottom();
}

function showTyping() {
  const row = document.createElement('div');
  row.className = 'chat-widget-row bot typing';
  row.id = 'chatWidgetTyping';

  const bubble = document.createElement('div');
  bubble.className = 'chat-widget-bubble';
  for (let i = 0; i < 3; i += 1) {
    const dot = document.createElement('span');
    dot.className = 'chat-widget-typing-dot';
    bubble.appendChild(dot);
  }

  row.appendChild(bubble);
  messagesEl.appendChild(row);
  scrollToBottom();
}

function hideTyping() {
  const el = document.getElementById('chatWidgetTyping');
  if (el) el.remove();
}

function openPanel() {
  panel.classList.add('is-open');
  panel.setAttribute('aria-hidden', 'false');
  toggleBtn.setAttribute('aria-expanded', 'true');
  input.focus();
}

function closePanel() {
  panel.classList.remove('is-open');
  panel.setAttribute('aria-hidden', 'true');
  toggleBtn.setAttribute('aria-expanded', 'false');
  toggleBtn.focus();
}

function togglePanel() {
  if (panel.classList.contains('is-open')) {
    closePanel();
  } else {
    openPanel();
  }
}

function handleSend(event) {
  event.preventDefault();
  const text = input.value.trim();
  if (!text) return;

  appendMessage('customer', text);
  input.value = '';
  input.focus();

  sendBtn.disabled = true;
  showTyping();

  setTimeout(() => {
    hideTyping();
    appendMessage('bot', MOCK_REPLY);
    sendBtn.disabled = false;
  }, 700);
}

toggleBtn.addEventListener('click', togglePanel);
closeBtn.addEventListener('click', closePanel);
form.addEventListener('submit', handleSend);

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && panel.classList.contains('is-open')) {
    closePanel();
  }
});
