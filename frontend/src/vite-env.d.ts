/// <reference types="vite/client" />

// Types for our own VITE_* variables, so import.meta.env.VITE_API_URL isn't `any`.
interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
