/**
 * ╔══════════════════════════════════════════════════════
 *  Nova Chat — Supabase Service Layer  (js/supabase.js)
 *  Handles: client init, message CRUD, file upload,
 *           and Realtime subscriptions.
 * ╚══════════════════════════════════════════════════════
 */

'use strict';

/* ─── In-memory demo store (used when demoMode = true) ── */
const _demoStore = {
  messages: [],
  listeners: [],
  idCounter: 1,
};

/* ─── Supabase client ──────────────────────────────────── */
let _supabase = null;
let _realtimeChannel = null;

function getSupabaseClient() {
  if (_supabase) return _supabase;
  if (SUPABASE_CONFIG.demoMode) return null;

  try {
    _supabase = supabase.createClient(
      SUPABASE_CONFIG.url,
      SUPABASE_CONFIG.anonKey,
      {
        realtime: { params: { eventsPerSecond: 10 } },
      }
    );
    console.info('%c[Supabase] Client initialised.', 'color:#27D9B5');
    return _supabase;
  } catch (err) {
    console.error('[Supabase] Failed to initialise client:', err);
    SUPABASE_CONFIG.demoMode = true;
    return null;
  }
}

/* ════════════════════════════════════════════════════════
   MESSAGES
════════════════════════════════════════════════════════ */

/**
 * Fetch the latest N messages for a session/conversation.
 * @param {string} conversationId  – UUID of the conversation (omit for global)
 * @param {number} limit           – how many messages to load (default 60)
 * @returns {Promise<Message[]>}
 */
async function fetchMessages(conversationId = null, limit = 60) {
  if (SUPABASE_CONFIG.demoMode) {
    return [..._demoStore.messages].slice(-limit);
  }

  const client = getSupabaseClient();
  let query = client
    .from(SUPABASE_CONFIG.messagesTable)
    .select('*')
    .order('created_at', { ascending: true })
    .limit(limit);

  if (conversationId) {
    query = query.eq('conversation_id', conversationId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

/**
 * Insert a new message row.
 * @param {{ content: string, sender: string, media_url?: string, conversation_id?: string }} payload
 * @returns {Promise<Message>}
 */
async function insertMessage(payload) {
  const row = {
    id:          crypto.randomUUID(),
    content:     payload.content || '',
    sender:      payload.sender  || 'user',
    media_url:   payload.media_url || null,
    created_at:  new Date().toISOString(),
    ...(payload.conversation_id ? { conversation_id: payload.conversation_id } : {}),
  };

  if (SUPABASE_CONFIG.demoMode) {
    _demoStore.messages.push(row);
    // Broadcast to demo listeners (simulates Realtime)
    setTimeout(() => {
      _demoStore.listeners.forEach(fn => fn({ eventType: 'INSERT', new: row }));
    }, 0);
    return row;
  }

  const client = getSupabaseClient();
  const { data, error } = await client
    .from(SUPABASE_CONFIG.messagesTable)
    .insert(row)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/* ════════════════════════════════════════════════════════
   FILE UPLOAD
════════════════════════════════════════════════════════ */

/**
 * Upload a file to Supabase Storage bucket "chat-media".
 * Returns the public URL on success.
 *
 * @param {File} file
 * @param {(progress: number) => void} [onProgress]  – 0-100 callback
 * @returns {Promise<string>}  public URL
 */
async function uploadMedia(file, onProgress) {
  // Validate file type
  if (!SUPABASE_CONFIG.allowedFileTypes.includes(file.type)) {
    throw new Error(`Unsupported file type: ${file.type}`);
  }
  // Validate file size
  const maxBytes = SUPABASE_CONFIG.maxFileSizeMB * 1024 * 1024;
  if (file.size > maxBytes) {
    throw new Error(`File too large. Maximum size is ${SUPABASE_CONFIG.maxFileSizeMB} MB.`);
  }

  if (SUPABASE_CONFIG.demoMode) {
    // Return a local object URL for demo mode
    onProgress && onProgress(100);
    return URL.createObjectURL(file);
  }

  const client = getSupabaseClient();
  const ext      = file.name.split('.').pop();
  const filePath = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;

  // Supabase JS v2 doesn't expose upload progress natively,
  // so we fake a progress animation for UX while uploading.
  let fakeProgress = 0;
  const progressInterval = setInterval(() => {
    fakeProgress = Math.min(fakeProgress + Math.random() * 18, 85);
    onProgress && onProgress(Math.round(fakeProgress));
  }, 150);

  try {
    const { error: uploadError } = await client.storage
      .from(SUPABASE_CONFIG.storageBucket)
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false,
        contentType: file.type,
      });

    clearInterval(progressInterval);
    if (uploadError) throw uploadError;

    onProgress && onProgress(100);

    const { data: urlData } = client.storage
      .from(SUPABASE_CONFIG.storageBucket)
      .getPublicUrl(filePath);

    return urlData.publicUrl;
  } catch (err) {
    clearInterval(progressInterval);
    throw err;
  }
}

/* ════════════════════════════════════════════════════════
   REALTIME SUBSCRIPTION
════════════════════════════════════════════════════════ */

/**
 * Subscribe to new messages via Supabase Realtime.
 * Calls `onInsert(message)` whenever a row is INSERTed.
 *
 * @param {(message: Message) => void} onInsert
 * @param {string} [conversationId]
 * @returns {{ unsubscribe: () => void }}
 */
function subscribeToMessages(onInsert, conversationId = null) {
  // Demo mode: register in-memory listener
  if (SUPABASE_CONFIG.demoMode) {
    const handler = (payload) => {
      if (payload.eventType === 'INSERT') onInsert(payload.new);
    };
    _demoStore.listeners.push(handler);
    return {
      unsubscribe: () => {
        const idx = _demoStore.listeners.indexOf(handler);
        if (idx > -1) _demoStore.listeners.splice(idx, 1);
      },
    };
  }

  const client = getSupabaseClient();
  if (!client) {
    console.warn('[Supabase] Cannot subscribe — client not initialised.');
    return { unsubscribe: () => {} };
  }

  // Build filter if we want to scope to a conversation
  const filter = conversationId
    ? `conversation_id=eq.${conversationId}`
    : undefined;

  _realtimeChannel = client
    .channel(`messages-${conversationId || 'global'}`)
    .on(
      'postgres_changes',
      {
        event:  'INSERT',
        schema: 'public',
        table:  SUPABASE_CONFIG.messagesTable,
        ...(filter ? { filter } : {}),
      },
      (payload) => {
        console.debug('[Realtime] INSERT received:', payload.new);
        onInsert(payload.new);
      }
    )
    .subscribe((status) => {
      console.info(`%c[Realtime] Channel status: ${status}`, 'color:#27D9B5');
      if (status === 'SUBSCRIBED') {
        window.dispatchEvent(new CustomEvent('nova:realtime-connected'));
      }
    });

  return {
    unsubscribe: () => {
      if (_realtimeChannel) {
        client.removeChannel(_realtimeChannel);
        _realtimeChannel = null;
      }
    },
  };
}

/* ════════════════════════════════════════════════════════
   CONVERSATION MANAGEMENT  (lightweight, client-side)
════════════════════════════════════════════════════════ */

const _CONV_KEY = 'nova_conversations';

function saveConversationLocally(conv) {
  const existing = getLocalConversations();
  const idx = existing.findIndex(c => c.id === conv.id);
  if (idx > -1) existing[idx] = conv;
  else existing.unshift(conv);
  try {
    localStorage.setItem(_CONV_KEY, JSON.stringify(existing.slice(0, 40)));
  } catch (_) { /* storage full */ }
}

function getLocalConversations() {
  try {
    return JSON.parse(localStorage.getItem(_CONV_KEY) || '[]');
  } catch (_) {
    return [];
  }
}

function deleteLocalConversation(id) {
  const convs = getLocalConversations().filter(c => c.id !== id);
  localStorage.setItem(_CONV_KEY, JSON.stringify(convs));
}

/* ── Exports (global scope for vanilla JS) ────────────── */
window.NovaSupabase = {
  getClient:              getSupabaseClient,
  fetchMessages,
  insertMessage,
  uploadMedia,
  subscribeToMessages,
  saveConversationLocally,
  getLocalConversations,
  deleteLocalConversation,
};
