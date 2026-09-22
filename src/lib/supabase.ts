import { createClient, SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Supabase 환경변수가 없으면 null — 로컬 개발 중에도 UI는 동작하되 기록은 건너뜀.
export const supabase: SupabaseClient | null = url && anonKey ? createClient(url, anonKey) : null;
