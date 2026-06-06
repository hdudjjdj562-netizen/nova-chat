/**
 * ╔══════════════════════════════════════════════════════
 *  Nova Chat — App Controller  (js/app.js)
 *  Orchestrates UI + Supabase + state management.
 *  Entry point: DOMContentLoaded → init()
 * ╚══════════════════════════════════════════════════════
 */

'use strict';

/* ═══════════════════════════════════════════════════════
   STATE
═══════════════════════════════════════════════════════ */
const State = {
  currentConvId:    null,   // active conversation UUID
  pendingFiles:     [],     // files queued for upload
  isSending:        false,  // prevents double-send
  realtimeSub:      null,   // current Realtime subscription handle
  seenMessageIds:   new Set(), // dedup realtime + fetch
};

/* ═══════════════════════════════════════════════════════
   CONVERSATION MANAGEMENT
═══════════════════════════════════════════════════════ */

function createNewConversation() {
  const id = crypto.randomUUID();
  const conv = {
    id,
    title:     'New conversation',
    createdAt: new Date().toISOString(),
  };
  State.currentConvId  = id;
  State.seenMessageIds = new Set();

  // Clear chat
  const container = NovaUI.refs.chatContainer();
  container.innerHTML = '';
  NovaUI.showEmptyState();

  // Update sidebar
  NovaUI.renderHistoryItem(conv, true, loadConversation, handleDeleteConversation);
  NovaUI.setActiveHistoryItem(id);
  NovaUI.saveConversationLocally
    ? NovaSupabase.saveConversationLocally(conv)
    : null;

  // Re-subscribe Realtime for new conversation
  subscribeRealtime(id);

  return conv;
}

async function loadConversation(conv) {
  if (State.currentConvId === conv.id) return;

  State.currentConvId  = conv.id;
  State.seenMessageIds = new Set();

  NovaUI.setActiveHistoryItem(conv.id);

  // Unsubscribe previous realtime
  if (State.realtimeSub) {
    State.realtimeSub.unsubscribe();
    State.realtimeSub = null;
  }

  // Clear & load
  const container = NovaUI.refs.chatContainer();
  container.innerHTML = '';
  NovaUI.showSkeletonLoader();

  try {
    const messages = await NovaSupabase.fetchMessages(conv.id);
    NovaUI.hideSkeletonLoader();

    if (messages.length === 0) {
      NovaUI.showEmptyState();
    } else {
      messages.forEach(m => State.seenMessageIds.add(m.id));
      NovaUI.renderMessageBatch(messages);
    }
  } catch (err) {
    NovaUI.hideSkeletonLoader();
    NovaUI.showToast('Failed to load messages.', 'error');
    console.error('[App] loadConversation error:', err);
  }

  subscribeRealtime(conv.id);

  // Close mobile sidebar
  closeMobileSidebar();
}

function handleDeleteConversation(conv, element) {
  NovaSupabase.deleteLocalConversation(conv.id);
  element.remove();

  if (State.currentConvId === conv.id) {
    createNewConversation();
  }
  NovaUI.showToast('Conversation deleted.', 'info', 2000);
}

/* ═══════════════════════════════════════════════════════
   REALTIME SUBSCRIPTION
═══════════════════════════════════════════════════════ */

function subscribeRealtime(convId) {
  // Unsubscribe any existing
  if (State.realtimeSub) {
    State.realtimeSub.unsubscribe();
  }

  State.realtimeSub = NovaSupabase.subscribeToMessages((message) => {
    // Deduplicate: Realtime may fire for messages we just inserted
    if (State.seenMessageIds.has(message.id)) return;
    State.seenMessageIds.add(message.id);

    // Only show if it belongs to current conversation
    // (or no conversation filtering is in use)
    if (message.conversation_id && message.conversation_id !== State.currentConvId) return;

    // Only render AI messages from Realtime (user messages are rendered immediately on send)
    if (message.sender !== 'user') {
      NovaUI.hideTypingIndicator();
      NovaUI.renderMessage(message);
      updateConversationTitle(message.content);
    }
  }, convId);
}

/* ═══════════════════════════════════════════════════════
   SEND MESSAGE FLOW
═══════════════════════════════════════════════════════ */

async function handleSend() {
  if (State.isSending) return;

  const input   = NovaUI.refs.messageInput();
  const content = input.value.trim();

  if (!content && State.pendingFiles.length === 0) return;

  State.isSending = true;
  NovaUI.setSendBtnState(false);

  let mediaUrl = null;

  // ── 1. Upload files if any ──
  if (State.pendingFiles.length > 0) {
    const file = State.pendingFiles[0]; // upload first file
    NovaUI.showUploadProgress();
    try {
      mediaUrl = await NovaSupabase.uploadMedia(file, (pct) => {
        // Could render a real progress bar here
        console.debug('[Upload] progress:', pct + '%');
      });
      NovaUI.hideUploadProgress();
      NovaUI.showToast('File uploaded.', 'success', 2000);
    } catch (err) {
      NovaUI.hideUploadProgress();
      NovaUI.showToast(err.message || 'Upload failed.', 'error');
      State.isSending = false;
      NovaUI.setSendBtnState(true);
      return;
    }
  }

  // ── 2. Clear input immediately ──
  const sentContent = content;
  input.value = '';
  input.style.height = 'auto';
  NovaUI.clearMediaPreview();
  State.pendingFiles = [];
  NovaUI.refs.charCount().classList.add('hidden');

  // ── 3. Optimistically render user bubble ──
  const optimisticMsg = {
    id:          crypto.randomUUID(),
    content:     sentContent,
    sender:      'user',
    media_url:   mediaUrl,
    created_at:  new Date().toISOString(),
  };
  State.seenMessageIds.add(optimisticMsg.id);
  NovaUI.renderMessage(optimisticMsg);

  // ── 4. Show typing indicator ──
  setTimeout(() => NovaUI.showTypingIndicator(), 200);

  // ── 5. Persist to Supabase ──
  try {
    await NovaSupabase.insertMessage({
      content:         sentContent,
      sender:          'user',
      media_url:       mediaUrl,
      conversation_id: State.currentConvId,
    });
  } catch (err) {
    NovaUI.showToast('Failed to send message.', 'error');
    console.error('[App] insertMessage error:', err);
  }

  // ── 6. Simulate AI response (demo mode only) ──
  if (SUPABASE_CONFIG.demoMode) {
    simulateDemoAIResponse(sentContent, mediaUrl);
  } else {
    // In production, hide typing when Realtime delivers the AI response.
    // Safety timeout: hide after 30s regardless
    setTimeout(() => NovaUI.hideTypingIndicator(), 30_000);
  }

  // Update conversation title from first message
  updateConversationTitle(sentContent);

  State.isSending = false;
  NovaUI.setSendBtnState(!!input.value.trim() || State.pendingFiles.length > 0);
}

/* ═══════════════════════════════════════════════════════
   DEMO AI RESPONSE
═══════════════════════════════════════════════════════ */
const DEMO_RESPONSES = [
  "That's a great question! In demo mode, I'm responding locally. Connect your Supabase project in `js/config.js` to enable real AI responses via your backend.",
  "I can see your message! This is the demo mode response. Once you wire up your AI backend (e.g. Edge Functions calling an LLM), responses will appear here via **Supabase Realtime** automatically.",
  "Nice! Your file was uploaded successfully. In production, your backend would analyse this and respond. For now, here's a demo reply.\n\nTo enable AI: create a Supabase Edge Function that listens for new `messages` rows and inserts an AI response back into the table.",
  "Demo mode active 🚀\n\nYour full stack looks like:\n1. **Frontend** (this app) sends message\n2. **Supabase** stores it in `messages` table\n3. **Edge Function / Webhook** calls your LLM\n4. **AI response** inserted back into `messages`\n5. **Realtime** pushes it to all connected clients",
];

function simulateDemoAIResponse(userContent, hasMedia) {
  const delay = 1200 + Math.random() * 800;
  setTimeout(async () => {
    let reply = DEMO_RESPONSES[Math.floor(Math.random() * DEMO_RESPONSES.length)];
    if (hasMedia) reply = DEMO_RESPONSES[2];

    const aiMsg = {
      id:          crypto.randomUUID(),
      content:     reply,
      sender:      'ai',
      media_url:   null,
      created_at:  new Date().toISOString(),
      conversation_id: State.currentConvId,
    };

    // Insert via service (will trigger demo realtime listener)
    await NovaSupabase.insertMessage(aiMsg);
  }, delay);
}

/* ═══════════════════════════════════════════════════════
   CONVERSATION TITLE UPDATE
═══════════════════════════════════════════════════════ */
function updateConversationTitle(content) {
  if (!State.currentConvId || !content) return;
  const title = content.slice(0, 40).trim();

  // Update in localStorage
  const convs = NovaSupabase.getLocalConversations();
  const conv   = convs.find(c => c.id === State.currentConvId);
  if (conv && conv.title === 'New conversation') {
    conv.title = title;
    NovaSupabase.saveConversationLocally(conv);

    // Update sidebar DOM
    const item = document.querySelector(`[data-conv-id="${State.currentConvId}"] span`);
    if (item) item.textContent = title;
  }
}

/* ═══════════════════════════════════════════════════════
   SIDEBAR TOGGLE
═══════════════════════════════════════════════════════ */
let sidebarExpanded = true;

function collapseSidebar() {
  const sidebar  = document.getElementById('sidebar');
  const rail     = document.getElementById('sidebarRail');
  sidebar.classList.add('collapsed');
  rail.style.display = 'flex';
  sidebarExpanded = false;
}

function expandSidebar() {
  const sidebar = document.getElementById('sidebar');
  const rail    = document.getElementById('sidebarRail');
  sidebar.classList.remove('collapsed');
  rail.style.display = 'none';
  sidebarExpanded = true;
}

function openMobileSidebar() {
  const sidebar  = document.getElementById('sidebar');
  const overlay  = document.getElementById('mobileOverlay');
  sidebar.classList.add('mobile-open');
  overlay.classList.remove('hidden');
}

function closeMobileSidebar() {
  const sidebar  = document.getElementById('sidebar');
  const overlay  = document.getElementById('mobileOverlay');
  sidebar.classList.remove('mobile-open');
  overlay.classList.add('hidden');
}

/* ═══════════════════════════════════════════════════════
   EVENT LISTENERS
═══════════════════════════════════════════════════════ */

function bindEvents() {
  const input   = NovaUI.refs.messageInput();
  const sendBtn = NovaUI.refs.sendBtn();
  const fileIn  = NovaUI.refs.fileInput();

  // ── Textarea: auto-resize + enable send button ──
  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 192) + 'px';

    const hasContent = input.value.trim().length > 0 || State.pendingFiles.length > 0;
    NovaUI.setSendBtnState(hasContent);

    // Character count (show >200)
    const count = input.value.length;
    const cc    = NovaUI.refs.charCount();
    if (count > 200) {
      cc.textContent = count;
      cc.classList.remove('hidden');
    } else {
      cc.classList.add('hidden');
    }
  });

  // ── Send on Enter (Shift+Enter = newline) ──
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!sendBtn.disabled) handleSend();
    }
  });

  // ── Send button ──
  sendBtn.addEventListener('click', handleSend);

  // ── Attach button → file input ──
  NovaUI.refs.attachBtn().addEventListener('click', () => fileIn.click());

  // ── File selected ──
  fileIn.addEventListener('change', () => {
    const files = Array.from(fileIn.files);
    if (!files.length) return;

    files.forEach(file => {
      // Validate type
      if (!SUPABASE_CONFIG.allowedFileTypes.includes(file.type)) {
        NovaUI.showToast(`Unsupported type: ${file.type}`, 'error');
        return;
      }
      const maxBytes = SUPABASE_CONFIG.maxFileSizeMB * 1024 * 1024;
      if (file.size > maxBytes) {
        NovaUI.showToast(`File too large (max ${SUPABASE_CONFIG.maxFileSizeMB} MB).`, 'error');
        return;
      }

      State.pendingFiles.push(file);
      NovaUI.addMediaPreviewThumb(file, (removedFile) => {
        State.pendingFiles = State.pendingFiles.filter(f => f !== removedFile);
        const hasContent = input.value.trim().length > 0 || State.pendingFiles.length > 0;
        NovaUI.setSendBtnState(hasContent);
      });
    });

    // Enable send if files added
    const hasContent = input.value.trim().length > 0 || State.pendingFiles.length > 0;
    NovaUI.setSendBtnState(hasContent);

    // Reset file input so same file can be re-selected
    fileIn.value = '';
  });

  // ── Drag & drop onto input card ──
  const inputCard = document.getElementById('inputCard');
  inputCard.addEventListener('dragover', (e) => {
    e.preventDefault();
    inputCard.classList.add('border-accent-blue/60');
  });
  inputCard.addEventListener('dragleave', () => {
    inputCard.classList.remove('border-accent-blue/60');
  });
  inputCard.addEventListener('drop', (e) => {
    e.preventDefault();
    inputCard.classList.remove('border-accent-blue/60');
    const files = Array.from(e.dataTransfer.files);
    if (files.length) {
      // Create synthetic change-like event by simulating file selection
      files.forEach(file => {
        if (!SUPABASE_CONFIG.allowedFileTypes.includes(file.type)) {
          NovaUI.showToast(`Unsupported type: ${file.type}`, 'error');
          return;
        }
        State.pendingFiles.push(file);
        NovaUI.addMediaPreviewThumb(file, (removedFile) => {
          State.pendingFiles = State.pendingFiles.filter(f => f !== removedFile);
          const hasContent = input.value.trim().length > 0 || State.pendingFiles.length > 0;
          NovaUI.setSendBtnState(hasContent);
        });
      });
      NovaUI.setSendBtnState(true);
    }
  });

  // ── Sidebar collapse/expand ──
  document.getElementById('sidebarToggle').addEventListener('click', () => {
    sidebarExpanded ? collapseSidebar() : expandSidebar();
  });
  document.getElementById('railExpandBtn').addEventListener('click', expandSidebar);

  // ── New chat buttons ──
  document.getElementById('newChatBtn').addEventListener('click', createNewConversation);
  document.getElementById('railNewChat').addEventListener('click', createNewConversation);

  // ── Mobile sidebar ──
  document.getElementById('mobileSidebarToggle').addEventListener('click', openMobileSidebar);
  document.getElementById('mobileOverlay').addEventListener('click', closeMobileSidebar);

  // ── Suggestion chips (initial render) ──
  document.querySelectorAll('.suggestion-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      const text = btn.querySelector('p:first-child').textContent.replace(/^[^\w]+/, '');
      input.value = text;
      input.dispatchEvent(new Event('input'));
      input.focus();
    });
  });

  // ── Lightbox: delegate click on msg-media images ──
  document.addEventListener('click', (e) => {
    const img = e.target.closest('[data-lightbox]');
    if (img) NovaUI.openLightbox(img.dataset.lightbox);
  });

  // ── Realtime connected event ──
  window.addEventListener('nova:realtime-connected', () => {
    NovaUI.renderRealtimeBadge(true);
  });
}

/* ═══════════════════════════════════════════════════════
   INIT
═══════════════════════════════════════════════════════ */

async function init() {
  // Init lightbox
  NovaUI.initLightbox();

  // Load previous conversations from localStorage
  const conversations = NovaSupabase.getLocalConversations();

  if (conversations.length > 0) {
    // Render history items (most-recent first already)
    conversations.slice(0, 20).forEach((conv, i) => {
      NovaUI.renderHistoryItem(
        conv,
        i === 0,
        loadConversation,
        handleDeleteConversation
      );
    });

    // Load most recent
    const latest = conversations[0];
    State.currentConvId  = latest.id;
    State.seenMessageIds = new Set();

    const container = NovaUI.refs.chatContainer();
    container.innerHTML = '';
    NovaUI.showSkeletonLoader();

    try {
      const messages = await NovaSupabase.fetchMessages(latest.id);
      NovaUI.hideSkeletonLoader();
      if (messages.length === 0) {
        NovaUI.showEmptyState();
      } else {
        messages.forEach(m => State.seenMessageIds.add(m.id));
        NovaUI.renderMessageBatch(messages);
      }
    } catch (err) {
      NovaUI.hideSkeletonLoader();
      NovaUI.showEmptyState();
      console.warn('[App] Could not load history:', err);
    }

    subscribeRealtime(latest.id);
  } else {
    // First launch: create a fresh conversation
    createNewConversation();
  }

  // Hide config banner if Supabase is configured
  if (!SUPABASE_CONFIG.demoMode) {
    const banner = document.getElementById('configBanner');
    if (banner) banner.remove();
    NovaUI.renderRealtimeBadge(false); // will flip to true on SUBSCRIBED
  }

  // Bind all events
  bindEvents();

  // Focus input
  NovaUI.refs.messageInput().focus();

  console.info('%c[Nova Chat] Initialised ✓', 'color:#4A9EFF;font-weight:bold');
}

/* ── Bootstrap ─────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', init);
