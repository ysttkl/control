import { createBrowserClient } from "@supabase/ssr"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

/** 浏览器端 Supabase 客户端 */
export const createClient = () => createBrowserClient(supabaseUrl!, supabaseKey!)
