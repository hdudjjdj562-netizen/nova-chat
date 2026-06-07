/**
 * ╔══════════════════════════════════════════════╗
 *  Nova Chat — Supabase Configuration
 *  ─────────────────────────────────────────────
 *  1. Create a Supabase project at https://supabase.com
 *  2. Go to Project Settings → API
 *  3. Copy your Project URL and anon/public key below
 *  4. In Supabase Storage: create a bucket named "chat-media"
 *     and set it to PUBLIC (Row Level Security optional)
 *  5. In Supabase SQL Editor, run the schema in README.md
 * ╚══════════════════════════════════════════════╝
 */

const SUPABASE_CONFIG = {
  // ← Replace with your Supabase project URL
  url: 'https://pqeijbipyjqjhexywyji.supabase.co/',

  // ← Replace with your Supabase anon (public) key
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBxZWlqYmlweWpxamhleHl3eWppIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA3NDA4MzMsImV4cCI6MjA5NjMxNjgzM30.i8omYtSlpFQwUrMRB0HIYPIGIMiEOliTSvRXA0J-IAQ',

  // Storage bucket name (must exist in your project)
  storageBucket: 'chat-media',

  // Table name
  messagesTable: 'messages',

  /**
   * Allowed file types for uploads
   * These are validated client-side before upload
   */
  allowedFileTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/webm'],

  /**
   * Max file size in bytes (default: 50 MB)
   */
  maxFileSizeMB: 50,

  /**
   * Demo mode: when true, uses local in-memory messages
   * instead of Supabase (auto-enabled if keys not set)
   */
  demoMode: false,
};

// Auto-detect demo mode if keys are still placeholder values
if (
  SUPABASE_CONFIG.url.includes('your-project-id') ||
  SUPABASE_CONFIG.anonKey.includes('your-anon-key')
) {
  SUPABASE_CONFIG.demoMode = true;
  console.info('%c[Nova Chat] Running in DEMO MODE — configure js/config.js for Supabase.', 'color:#4A9EFF;font-weight:bold');
}
