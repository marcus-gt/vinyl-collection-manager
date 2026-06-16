// Cloudflare Turnstile site key.
//
// This key is public/publishable by design (it identifies the widget in the
// browser), so it's committed here as the default. The widget is configured for
// localhost and the production host, so the same key works everywhere; an
// optional VITE_TURNSTILE_SITE_KEY env var can override it per environment.
//
// The matching SECRET key is configured only in the Supabase dashboard
// (Auth → Bot & Abuse Protection) and must never live in this codebase.
export const TURNSTILE_SITE_KEY =
  import.meta.env.VITE_TURNSTILE_SITE_KEY || '0x4AAAAAADl4VbuLHDopEKeC';
