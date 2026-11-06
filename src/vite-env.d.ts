/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string
  /** Legacy fallback for projects still using the anon JWT key. */
  readonly VITE_SUPABASE_ANON_KEY?: string
  readonly VITE_STUDYSPACE_MEET_DOMAIN?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}