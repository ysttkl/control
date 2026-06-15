import { type NextRequest } from "next/server"
import { createClient } from "@/utils/supabase/middleware"

export async function middleware(request: NextRequest) {
  const { supabase, response } = createClient(request)

  // 刷新 session（若存在）
  await supabase.auth.getSession()

  return response
}

export const config = {
  matcher: [
    // 排除静态资源、favicon、Next.js 内部路径
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
