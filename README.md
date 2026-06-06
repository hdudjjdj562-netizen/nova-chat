# Nova Chat

A production-ready, Gemini-style dark chat UI powered by **Supabase Realtime**.  
Stack: HTML5 · Tailwind CSS (CDN) · Vanilla JS ES6+ · Supabase JS v2 (CDN)

---

## 🚀 Quick Start

### 1. Create a Supabase project
Go to [supabase.com](https://supabase.com) → New Project.

### 2. Run the SQL schema
In your Supabase **SQL Editor**, run:

```sql
-- Messages table
create table public.messages (
  id               uuid primary key default gen_random_uuid(),
  content          text,
  sender           text not null default 'user',
  media_url        text,
  conversation_id  uuid,
  created_at       timestamptz not null default now()
);

-- Enable Row Level Security (optional but recommended)
alter table public.messages enable row level security;

-- Allow public read/write for demo (restrict in production)
create policy "Public read"  on public.messages for select using (true);
create policy "Public write" on public.messages for insert with check (true);

-- Enable Realtime on this table
alter publication supabase_realtime add table public.messages;
```

### 3. Create Storage bucket
In **Storage** → **New bucket**:
- Name: `chat-media`
- Public: ✅ (check "Public bucket")

Add a policy for public uploads:
```sql
create policy "Public uploads"
  on storage.objects for insert
  with check (bucket_id = 'chat-media');

create policy "Public reads"
  on storage.objects for select
  using (bucket_id = 'chat-media');
```

### 4. Configure credentials
Open `js/config.js` and replace:
```js
url:     'https://your-project-id.supabase.co',
anonKey: 'your-anon-key-here',
```
Find these in: **Project Settings → API**.

### 5. Deploy
Upload the entire folder to GitHub Pages, Netlify, or any static host:
```
gemini-chat/
├── index.html
├── css/
│   └── style.css
└── js/
    ├── config.js
    ├── supabase.js
    ├── ui.js
    └── app.js
```

---

## 🏗 Architecture

```
Browser
  └── app.js          ← orchestration, event handling, state
       ├── ui.js       ← pure DOM rendering (messages, sidebar, toasts)
       ├── supabase.js ← Supabase service (fetch, insert, upload, realtime)
       └── config.js   ← credentials & feature flags
```

### Message Flow
1. User types + optionally attaches a file → `app.js handleSend()`
2. File uploaded to `chat-media` bucket → public URL returned
3. Row inserted into `messages` table with `content`, `sender`, `media_url`
4. Realtime listener fires on all connected clients
5. `ui.js renderMessage()` appends the bubble with animation

### AI Integration (production)
Create a **Supabase Edge Function** or **Database Webhook** that:
- Triggers on `INSERT` to `messages` where `sender = 'user'`
- Calls your LLM (OpenAI, Anthropic, Gemini, etc.)
- Inserts the AI reply back into `messages` with `sender = 'ai'`
- Realtime automatically delivers it to all clients

---

## ✨ Features
- Collapsible sidebar with conversation history (localStorage)
- Image & video upload to Supabase Storage with preview strip
- Drag & drop media onto input area
- Supabase Realtime subscription with deduplication
- Typing indicator (3-dot animated)
- Skeleton loading state
- Lightbox for full-size image view
- Suggestion chips on empty state
- Inline markdown rendering (bold, italic, code blocks)
- Toast notifications (success / error / info)
- Realtime connection badge
- Demo mode (no credentials needed)
- Mobile responsive with hamburger sidebar

---

## 🔒 Security Notes
- Never commit real API keys — use environment variables for server-side logic.
- The `anon` key is safe to expose in frontend code (it's public by design).
- Use Row Level Security policies to restrict data access in production.
- Validate file uploads server-side in your Edge Function.
