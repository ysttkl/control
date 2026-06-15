import { createClient } from "@/utils/supabase/server"
import { cookies } from "next/headers"

export async function GET() {
  const cookieStore = await cookies()
  const supabase = await createClient(cookieStore)

  const results: Record<string, unknown> = {}

  // 1. 测试连接：查 users 表行数
  const { count: userCount, error: userError } = await supabase
    .from("users")
    .select("*", { count: "exact", head: true })

  results["users 表"] = userError
    ? `❌ ${userError.message}`
    : `✅ 存在，共 ${userCount} 条记录`

  // 2. 测试 user_modules 表
  const { count: modCount, error: modError } = await supabase
    .from("user_modules")
    .select("*", { count: "exact", head: true })

  results["user_modules 表"] = modError
    ? `❌ ${modError.message}`
    : `✅ 存在，共 ${modCount} 条记录`

  // 3. 测试 life_records 表
  const { count: recCount, error: recError } = await supabase
    .from("life_records")
    .select("*", { count: "exact", head: true })

  results["life_records 表"] = recError
    ? `❌ ${recError.message}`
    : `✅ 存在，共 ${recCount} 条记录`

  // 4. 测试 chat_messages 表
  const { count: chatCount, error: chatError } = await supabase
    .from("chat_messages")
    .select("*", { count: "exact", head: true })

  results["chat_messages 表"] = chatError
    ? `❌ ${chatError.message}`
    : `✅ 存在，共 ${chatCount} 条记录`

  return Response.json(results)
}
