import { createClient } from '@supabase/supabase-js'

const url = () => process.env.NEXT_PUBLIC_SUPABASE_URL!
const anonKey = () => process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const serviceKey = () => process.env.SUPABASE_SERVICE_ROLE_KEY!

// Browser client (anon key, respects RLS)
let _supabase: ReturnType<typeof createClient> | null = null
export const supabase = new Proxy({} as ReturnType<typeof createClient>, {
  get(_, prop) {
    if (!_supabase) _supabase = createClient(url(), anonKey())
    return (_supabase as any)[prop]
  },
})

// Server-only client (service key, bypasses RLS for writes)
export const supabaseAdmin = () => createClient(url(), serviceKey())
