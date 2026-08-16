// CafeBot chat interface — UI only. All messages below are static mock
// data; nothing here calls a real API, database, or auth system.

const chatArea = document.getElementById('chatArea');
const inputForm = document.getElementById('inputForm');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');

// Seed conversation shown when the page loads.
const MOCK_CONVERSATION = [
  { sender: 'bot', text: "Hi there! Welcome to CafeBot ☕ What can I get started for you today?", time: '9:01 AM' },
  { sender: 'customer', text: "Hi! Can I get a large latte?", time: '9:01 AM' },
  { sender: 'bot', text: "Sure thing! What kind of milk would you like — whole, oat, almond, or soy?", time: '9:02 AM' },
  { sender: 'customer', text: "Oat milk please", time: '9:02 AM' },
  { sender: 'bot', text: "Got it — one large oat milk latte. Want to add a pastry with that? Our blueberry muffins are fresh today.", time: '9:02 AM' },
  { sender: 'customer', text: "Sure, I'll take a blueberry muffin too", time: '9:03 AM' },
  { sender: 'bot', text: "Perfect! Here's your order:\n\n1 Large Oat Milk Latte — $4.25\n1 Blueberry Muffin — $3.50\n\nTotal: $7.75. Can I get a name for the order?", time: '9:03 AM' },
  { sender: 'customer', text: "It's Sam", time: '9:03 AM' },
  { sender: 'bot', text: "Thanks, Sam! Your order will be ready in about 5-8 minutes. We'll call your name at the counter. See you soon! 🎉", time: '9:04 AM' },
];

// Canned bot replies used to acknowledge anything the user types live.
const CANNED_REPLIES = [
  "Thanks for the message! This is just a demo chat, so I can't take real orders here yet.",
  "Got it! (This is a mock reply — CafeBot isn't connected to a real backend in this preview.)",
  "Sounds good! In the full version, I'd help you with that — for now this is just a UI demo.",
  "Noted! Feel free to keep exploring the chat — all replies here are pre-written mock messages.",
];

let replyIndex = 0;

function currentTime() {
  return new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function scrollToBottom() {
  chatArea.scrollTop = chatArea.scrollHeight;
}

function appendMessage(sender, text, time) {
  const row = document.createElement('div');
  row.className = `bubble-row ${sender}`;

  const bubble = document.createElement('div');
  bubble.className = 'bubble';

  const textEl = document.createElement('span');
  textEl.textContent = text;
  bubble.appendChild(textEl);

  const timeEl = document.createElement('span');
  timeEl.className = 'bubble-time';
  timeEl.textContent = time || currentTime();
  bubble.appendChild(timeEl);

  row.appendChild(bubble);
  chatArea.appendChild(row);
  scrollToBottom();
}

function showTypingIndicator() {
  const row = document.createElement('div');
  row.className = 'bubble-row bot typing';
  row.id = 'typingIndicator';

  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.innerHTML = '<span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span>';

  row.appendChild(bubble);
  chatArea.appendChild(row);
  scrollToBottom();
}

function hideTypingIndicator() {
  const el = document.getElementById('typingIndicator');
  if (el) el.remove();
}

function loadMockConversation() {
  MOCK_CONVERSATION.forEach((msg) => appendMessage(msg.sender, msg.text, msg.time));
}

function handleSend(event) {
  event.preventDefault();
  const text = messageInput.value.trim();
  if (!text) return;

  appendMessage('customer', text);
  messageInput.value = '';
  messageInput.focus();

  showTypingIndicator();
  sendBtn.disabled = true;

  setTimeout(() => {
    hideTypingIndicator();
    const reply = CANNED_REPLIES[replyIndex % CANNED_REPLIES.length];
    replyIndex += 1;
    appendMessage('bot', reply);
    sendBtn.disabled = false;
  }, 900);
}

inputForm.addEventListener('submit', handleSend);

loadMockConversation();
