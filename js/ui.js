/**
 * ╔══════════════════════════════════════════════════════
 *  Nova Chat — UI Module  (js/ui.js)
 *  Pure DOM rendering helpers — no state, no side-effects.
 * ╚══════════════════════════════════════════════════════
 */

'use strict';

/* ═══════════════════════════════════════════════════════
   DOM REFERENCES
═══════════════════════════════════════════════════════ */
const UI = {
  chatContainer:   () => document.getElementById('chatContainer'),
  emptyState:      () => document.getElementById('emptyState'),
  messageInput:    () => document.getElementById('messageInput'),
  sendBtn:         () => document.getElementById('sendBtn'),
  attachBtn:       () => document.getElementById('attachBtn'),
  fileInput:       () => document.getElementById('fileInput'),
  mediaPreview:    () => document.getElementById('mediaPreview'),
  uploadProgress:  () => document.getElementById('uploadProgress'),
  charCount:       () => document.getElementById('charCount'),
  chatHistoryList: () => document.getElementById('chatHistoryList'),
  sidebar:         () => document.getElementById('sidebar'),
  sidebarRail:     () => document.getElementById('sidebarRail'),
  toast:           () => document.getElementById('toast'),
  configBanner:    () => document.getElementById('configBanner'),
};

/* ═══════════════════════════════════════════════════════
   HELPERS
═══════════════════════════════════════════════════════ */

function formatTime(isoString) {
  const d = isoString ? new Date(isoString) : new Date();
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function escapeHTML(str) {
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
}

/** Lightweight markdown: bold, italic, inline code, code blocks */
function renderMarkdown(text) {
  let html = escapeHTML(text);

  // Code blocks: ```...```
  html = html.replace(/```([\s\S]*?)```/g, (_, code) =>
    `<pre><code>${code.trim()}</code></pre>`
  );
  // Inline code: `...`
  html = html.replace(/`([^`]+)`/g, (_, code) =>
    `<code>${code}</code>`
  );
  // Bold: **...**
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // Italic: *...*
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  // Newlines → <br>
  html = html.replace(/\n/g, '<br>');

  return html;
}

function isVideoURL(url) {
  if (!url) return false;
  const videoExts = ['.mp4', '.webm', '.ogg', '.mov'];
  return videoExts.some(ext => url.toLowerCase().includes(ext));
}

/* ═══════════════════════════════════════════════════════
   MESSAGE RENDERING
═══════════════════════════════════════════════════════ */

/**
 * Create and append a message bubble to the chat container.
 * @param {{ id, content, sender, media_url, created_at }} message
 * @param {boolean} scrollIntoView
 * @returns {HTMLElement} the created row element
 */
function renderMessage(message, scrollIntoView = true) {
  const container = UI.chatContainer();
  hideEmptyState();

  const isUser = message.sender === 'user';
  const row = document.createElement('div');
  row.dataset.id = message.id;
  row.className = `msg-row ${isUser ? 'user-row' : 'ai-row'}`;

  // ── AI Avatar ──
  if (!isUser) {
    row.innerHTML += `
      <div class="ai-avatar" aria-hidden="true">
        <svg class="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.2">
          <path stroke-linecap="round" stroke-linejoin="round"
            d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"/>
        </svg>
      </div>`;
  }

  // ── Bubble ──
  const bubbleWrap = document.createElement('div');
  bubbleWrap.className = 'flex flex-col ' + (isUser ? 'items-end' : 'items-start');

  const bubble = document.createElement('div');
  bubble.className = `msg-bubble ${isUser ? 'user-bubble' : 'ai-bubble'}`;

  // Media
  if (message.media_url) {
    if (isVideoURL(message.media_url)) {
      bubble.innerHTML += `
        <video class="msg-video" controls preload="metadata">
          <source src="${escapeHTML(message.media_url)}" />
          Your browser does not support video.
        </video>`;
    } else {
      bubble.innerHTML += `
        <img
          src="${escapeHTML(message.media_url)}"
          alt="Attached image"
          class="msg-media"
          loading="lazy"
          data-lightbox="${escapeHTML(message.media_url)}"
        />`;
    }
  }

  // Text content
  if (message.content && message.content.trim()) {
    const textNode = document.createElement('span');
    textNode.innerHTML = renderMarkdown(message.content);
    bubble.appendChild(textNode);
  }

  bubbleWrap.appendChild(bubble);

  // Timestamp
  const time = document.createElement('p');
  time.className = 'msg-time';
  time.textContent = formatTime(message.created_at);
  bubbleWrap.appendChild(time);

  row.appendChild(bubbleWrap);
  container.appendChild(row);

  if (scrollIntoView) smoothScrollToBottom(container);

  return row;
}

/**
 * Render multiple messages at once (initial load).
 * @param {Array} messages
 */
function renderMessageBatch(messages) {
  messages.forEach((msg, i) => {
    const row = renderMessage(msg, false);
    // Stagger animations
    row.style.animationDelay = `${i * 30}ms`;
  });
  const container = UI.chatContainer();
  // Jump to bottom immediately for initial load
  container.scrollTop = container.scrollHeight;
}

/* ═══════════════════════════════════════════════════════
   TYPING / LOADING INDICATOR
═══════════════════════════════════════════════════════ */
const TYPING_ID = 'typing-indicator-row';

function showTypingIndicator() {
  hideTypingIndicator(); // prevent duplicates
  const container = UI.chatContainer();

  const row = document.createElement('div');
  row.id = TYPING_ID;
  row.className = 'msg-row ai-row';

  row.innerHTML = `
    <div class="ai-avatar" aria-hidden="true">
      <svg class="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.2">
        <path stroke-linecap="round" stroke-linejoin="round"
          d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"/>
      </svg>
    </div>
    <div class="msg-bubble ai-bubble">
      <div class="typing-indicator" role="status" aria-label="Nova is thinking">
        <span class="typing-dot"></span>
        <span class="typing-dot"></span>
        <span class="typing-dot"></span>
      </div>
    </div>`;

  container.appendChild(row);
  smoothScrollToBottom(container);
}

function hideTypingIndicator() {
  const el = document.getElementById(TYPING_ID);
  if (el) el.remove();
}

/* ═══════════════════════════════════════════════════════
   SKELETON LOADER  (for initial data fetch)
═══════════════════════════════════════════════════════ */
const SKELETON_ID = 'skeleton-loader';

function showSkeletonLoader(count = 4) {
  hideSkeletonLoader();
  const container = UI.chatContainer();
  const wrapper = document.createElement('div');
  wrapper.id = SKELETON_ID;
  wrapper.className = 'space-y-4 max-w-3xl mx-auto w-full px-1';

  const items = [
    { align: 'right', widths: ['w-48', 'w-32'] },
    { align: 'left',  widths: ['w-64', 'w-52', 'w-40'] },
    { align: 'right', widths: ['w-56'] },
    { align: 'left',  widths: ['w-72', 'w-48'] },
  ].slice(0, count);

  items.forEach(item => {
    const row = document.createElement('div');
    row.className = `flex gap-3 ${item.align === 'right' ? 'flex-row-reverse' : ''}`;

    if (item.align === 'left') {
      row.innerHTML += `<div class="w-8 h-8 rounded-xl skeleton shrink-0"></div>`;
    }

    const lines = document.createElement('div');
    lines.className = 'flex flex-col gap-2 ' + (item.align === 'right' ? 'items-end' : '');
    item.widths.forEach(w => {
      lines.innerHTML += `<div class="skeleton h-4 ${w} rounded-lg"></div>`;
    });
    row.appendChild(lines);
    wrapper.appendChild(row);
  });

  container.appendChild(wrapper);
}

function hideSkeletonLoader() {
  const el = document.getElementById(SKELETON_ID);
  if (el) el.remove();
}

/* ═══════════════════════════════════════════════════════
   EMPTY STATE
═══════════════════════════════════════════════════════ */
function hideEmptyState() {
  const el = UI.emptyState();
  if (el && el.parentNode) el.remove();
}

function showEmptyState() {
  const container = UI.chatContainer();
  if (!document.getElementById('emptyState')) {
    container.innerHTML = `
      <div id="emptyState" class="flex flex-col items-center justify-center h-full gap-6 pb-20">
        <div class="w-16 h-16 rounded-2xl bg-gradient-to-br from-accent-blue/30 to-accent-teal/20 flex items-center justify-center border border-accent-blue/20">
          <svg class="w-8 h-8 text-accent-blue" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"/>
          </svg>
        </div>
        <div class="text-center space-y-2">
          <h1 class="text-2xl font-semibold tracking-tight text-zinc-100">How can I help you today?</h1>
          <p class="text-zinc-500 text-sm max-w-xs leading-relaxed">Send a message or attach an image to start a new conversation.</p>
        </div>
        <div class="grid grid-cols-2 gap-2 w-full max-w-md">
          <button class="suggestion-chip text-left p-3.5 rounded-2xl border border-border-DEFAULT bg-surface-200 hover:bg-white/5 hover:border-border-strong transition-all group">
            <p class="text-xs font-medium text-zinc-300 group-hover:text-white transition-colors">✍️ Draft an email</p>
            <p class="text-[11px] text-zinc-600 mt-0.5">to my team about the sprint</p>
          </button>
          <button class="suggestion-chip text-left p-3.5 rounded-2xl border border-border-DEFAULT bg-surface-200 hover:bg-white/5 hover:border-border-strong transition-all group">
            <p class="text-xs font-medium text-zinc-300 group-hover:text-white transition-colors">🧠 Explain a concept</p>
            <p class="text-[11px] text-zinc-600 mt-0.5">like I'm a beginner</p>
          </button>
          <button class="suggestion-chip text-left p-3.5 rounded-2xl border border-border-DEFAULT bg-surface-200 hover:bg-white/5 hover:border-border-strong transition-all group">
            <p class="text-xs font-medium text-zinc-300 group-hover:text-white transition-colors">💻 Write code</p>
            <p class="text-[11px] text-zinc-600 mt-0.5">for a REST API endpoint</p>
          </button>
          <button class="suggestion-chip text-left p-3.5 rounded-2xl border border-border-DEFAULT bg-surface-200 hover:bg-white/5 hover:border-border-strong transition-all group">
            <p class="text-xs font-medium text-zinc-300 group-hover:text-white transition-colors">📊 Analyze data</p>
            <p class="text-[11px] text-zinc-600 mt-0.5">from an uploaded image</p>
          </button>
        </div>
      </div>`;
    // Re-attach suggestion chip listeners
    container.querySelectorAll('.suggestion-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        const text = btn.querySelector('p:first-child').textContent.replace(/^[^\w]+/, '');
        const input = UI.messageInput();
        input.value = text;
        input.dispatchEvent(new Event('input'));
        input.focus();
      });
    });
  }
}

/* ═══════════════════════════════════════════════════════
   MEDIA PREVIEW
═══════════════════════════════════════════════════════ */

function addMediaPreviewThumb(file, onRemove) {
  const strip = UI.mediaPreview();
  strip.classList.remove('hidden');
  strip.classList.add('flex');

  const thumb = document.createElement('div');
  thumb.className = 'preview-thumb';

  const url = URL.createObjectURL(file);

  if (file.type.startsWith('video/')) {
    thumb.innerHTML = `
      <video src="${url}" muted preload="metadata"></video>
      <button class="remove-preview" aria-label="Remove">✕</button>`;
  } else {
    thumb.innerHTML = `
      <img src="${url}" alt="preview" />
      <button class="remove-preview" aria-label="Remove">✕</button>`;
  }

  thumb.querySelector('.remove-preview').addEventListener('click', () => {
    URL.revokeObjectURL(url);
    thumb.remove();
    if (strip.children.length === 0) {
      strip.classList.add('hidden');
      strip.classList.remove('flex');
    }
    onRemove && onRemove(file);
  });

  strip.appendChild(thumb);
}

function clearMediaPreview() {
  const strip = UI.mediaPreview();
  // Revoke any object URLs
  strip.querySelectorAll('img, video').forEach(el => {
    if (el.src.startsWith('blob:')) URL.revokeObjectURL(el.src);
  });
  strip.innerHTML = '';
  strip.classList.add('hidden');
  strip.classList.remove('flex');
}

/* ═══════════════════════════════════════════════════════
   SIDEBAR / HISTORY
═══════════════════════════════════════════════════════ */

function renderHistoryItem(conv, isActive, onClick, onDelete) {
  const list  = UI.chatHistoryList();
  const item  = document.createElement('div');
  item.dataset.convId = conv.id;
  item.className = `history-item ${isActive ? 'active' : ''}`;

  const title = (conv.title || 'New conversation').slice(0, 36);

  item.innerHTML = `
    <svg class="history-icon w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8">
      <path stroke-linecap="round" stroke-linejoin="round"
        d="M8.625 9.75a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375m-13.5 3.01c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.184-4.183a1.14 1.14 0 01.778-.332 48.294 48.294 0 005.83-.498c1.585-.233 2.708-1.626 2.708-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z"/>
    </svg>
    <span class="flex-1 truncate text-sm">${escapeHTML(title)}</span>
    <button class="delete-conv w-5 h-5 rounded flex items-center justify-center text-zinc-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all shrink-0" title="Delete">
      <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
      </svg>
    </button>`;

  item.addEventListener('mouseenter', () => item.querySelector('.delete-conv').style.opacity = '1');
  item.addEventListener('mouseleave', () => item.querySelector('.delete-conv').style.opacity = '0');

  item.addEventListener('click', (e) => {
    if (!e.target.closest('.delete-conv')) onClick(conv);
  });
  item.querySelector('.delete-conv').addEventListener('click', (e) => {
    e.stopPropagation();
    onDelete(conv, item);
  });

  list.prepend(item);
  return item;
}

function setActiveHistoryItem(convId) {
  document.querySelectorAll('.history-item').forEach(el => {
    el.classList.toggle('active', el.dataset.convId === convId);
  });
}

function clearHistoryList() {
  UI.chatHistoryList().innerHTML = '';
}

function renderRealtimeBadge(connected) {
  const existing = document.getElementById('rtBadge');
  if (existing) existing.remove();
  const badge = document.createElement('div');
  badge.id = 'rtBadge';
  badge.className = 'rt-badge px-4 py-1.5 fixed top-3 right-4 z-10';
  badge.innerHTML = `
    <span class="rt-dot" style="${connected ? '' : 'background:#ef4444;animation:none'}"></span>
    <span>${connected ? 'Realtime' : 'Offline'}</span>`;
  document.body.appendChild(badge);
}

/* ═══════════════════════════════════════════════════════
   UPLOAD PROGRESS
═══════════════════════════════════════════════════════ */

function showUploadProgress() {
  UI.uploadProgress().classList.remove('hidden');
}
function hideUploadProgress() {
  UI.uploadProgress().classList.add('hidden');
}

/* ═══════════════════════════════════════════════════════
   SEND BUTTON STATE
═══════════════════════════════════════════════════════ */

function setSendBtnState(enabled) {
  const btn = UI.sendBtn();
  btn.disabled = !enabled;
}

/* ═══════════════════════════════════════════════════════
   TOAST NOTIFICATIONS
═══════════════════════════════════════════════════════ */
let _toastTimer = null;

function showToast(message, type = 'info', duration = 3000) {
  const toast = UI.toast();
  clearTimeout(_toastTimer);

  toast.className = `fixed bottom-6 left-1/2 px-4 py-2.5 rounded-xl text-sm font-medium shadow-xl z-50 transition-all duration-300 flex items-center gap-2 ${type}`;
  toast.innerHTML = `
    ${type === 'error'   ? '<svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"/></svg>' : ''}
    ${type === 'success' ? '<svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>' : ''}
    <span>${escapeHTML(message)}</span>`;

  requestAnimationFrame(() => {
    toast.classList.add('show');
  });

  _toastTimer = setTimeout(() => {
    toast.classList.remove('show');
  }, duration);
}

/* ═══════════════════════════════════════════════════════
   LIGHTBOX
═══════════════════════════════════════════════════════ */

function initLightbox() {
  // Create lightbox element if it doesn't exist
  if (document.getElementById('lightbox')) return;
  const lb = document.createElement('div');
  lb.id = 'lightbox';
  lb.setAttribute('role', 'dialog');
  lb.setAttribute('aria-modal', 'true');
  lb.innerHTML = `
    <button id="lightboxClose" aria-label="Close lightbox">✕</button>
    <img id="lightboxImg" src="" alt="Full size image" />`;

  document.body.appendChild(lb);

  lb.addEventListener('click', (e) => {
    if (e.target === lb) lb.classList.remove('open');
  });
  document.getElementById('lightboxClose').addEventListener('click', () => {
    lb.classList.remove('open');
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') lb.classList.remove('open');
  });
}

function openLightbox(src) {
  initLightbox();
  document.getElementById('lightboxImg').src = src;
  document.getElementById('lightbox').classList.add('open');
}

/* ═══════════════════════════════════════════════════════
   SCROLL HELPERS
═══════════════════════════════════════════════════════ */

function smoothScrollToBottom(container) {
  container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
}

function isScrolledToBottom(container, threshold = 120) {
  return container.scrollHeight - container.scrollTop - container.clientHeight < threshold;
}

/* ── Exports ───────────────────────────────────────────── */
window.NovaUI = {
  refs: UI,
  renderMessage,
  renderMessageBatch,
  showTypingIndicator,
  hideTypingIndicator,
  showSkeletonLoader,
  hideSkeletonLoader,
  hideEmptyState,
  showEmptyState,
  addMediaPreviewThumb,
  clearMediaPreview,
  renderHistoryItem,
  setActiveHistoryItem,
  clearHistoryList,
  renderRealtimeBadge,
  showUploadProgress,
  hideUploadProgress,
  setSendBtnState,
  showToast,
  openLightbox,
  initLightbox,
  smoothScrollToBottom,
  isScrolledToBottom,
};
