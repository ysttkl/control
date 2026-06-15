"use server"

import { createClient } from "@/utils/supabase/server"
import { cookies } from "next/headers"

/** 获取 SSR Supabase 客户端 */
async function getSupabase() {
  const cookieStore = await cookies()
  return createClient(cookieStore)
}

/** 三个基础模块的默认 schema 定义（科学参数版） */
const DEFAULT_MODULES = [
  {
    module_key: "calories",
    display_name: "饮食记录",
    icon: "flame",
    schema_definition: {
      fields: [
        { key: "food_name", label: "食物名称", type: "string", required: true },
        { key: "calories", label: "热量(kcal)", type: "number", required: true },
        { key: "protein", label: "蛋白质(g)", type: "number", required: false },
        { key: "carbs", label: "碳水化合物(g)", type: "number", required: false },
        { key: "fat", label: "脂肪(g)", type: "number", required: false },
        {
          key: "meal_type",
          label: "餐次",
          type: "enum",
          options: ["早餐", "午餐", "晚餐", "加餐"],
          required: true,
        },
      ],
    },
  },
  {
    module_key: "exercise",
    display_name: "运动记录",
    icon: "dumbbell",
    schema_definition: {
      fields: [
        { key: "activity", label: "运动项目", type: "string", required: true },
        { key: "duration_min", label: "时长(分钟)", type: "number", required: true },
        {
          key: "intensity",
          label: "强度",
          type: "enum",
          options: ["低", "中", "高"],
          required: true,
        },
        { key: "calories_burned", label: "消耗热量(kcal)", type: "number", required: true },
        { key: "notes", label: "备注", type: "string", required: false },
      ],
    },
  },
  {
    module_key: "finance",
    display_name: "收支记录",
    icon: "wallet",
    schema_definition: {
      fields: [
        { key: "amount", label: "金额(元)", type: "number", required: true },
        {
          key: "direction",
          label: "方向",
          type: "enum",
          options: ["支出", "收入"],
          required: true,
        },
        { key: "category", label: "分类", type: "string", required: true },
        { key: "account", label: "账户", type: "string", required: true },
        { key: "notes", label: "备注", type: "string", required: false },
      ],
    },
  },
]

/** 获取当前第一个用户的 ID（MVP 阶段，后续接入 Supabase Auth 后替换为 session user） */
async function getFirstUserId(): Promise<string> {
  const supabase = await getSupabase()
  const { data } = await supabase.from("users").select("id").limit(1)
  if (data && data.length > 0) return data[0].id
  throw new Error("未找到任何用户，请先创建用户或注册。")
}

/**
 * 初始化 user_modules —— 若为空则插入 3 个基础模块。
 * 返回已存在的模块或刚插入的模块列表。
 */
export async function initializeModules(userId?: string) {
  const supabase = await getSupabase()
  const uid = userId ?? (await getFirstUserId())

  const { data: existingModules, error: selectError } = await supabase
    .from("user_modules")
    .select("id")
    .eq("user_id", uid)

  if (selectError) {
    throw new Error("查询模块失败: " + selectError.message)
  }

  if (existingModules && existingModules.length > 0) {
    return { userId: uid, modules: existingModules, created: false }
  }

  const modulesToInsert = DEFAULT_MODULES.map((m) => ({
    user_id: uid,
    module_key: m.module_key,
    display_name: m.display_name,
    icon: m.icon,
    schema_definition: m.schema_definition,
  }))

  const { data: insertedModules, error: insertError } = await supabase
    .from("user_modules")
    .insert(modulesToInsert)
    .select()

  if (insertError) {
    throw new Error("插入默认模块失败: " + insertError.message)
  }

  return { userId: uid, modules: insertedModules, created: true }
}

/** 获取指定用户的所有模块定义 */
export async function getUserModules(userId?: string) {
  const supabase = await getSupabase()
  const uid = userId ?? (await getFirstUserId())
  const { data, error } = await supabase
    .from("user_modules")
    .select("*")
    .eq("user_id", uid)
    .order("id", { ascending: true })
  if (error) throw new Error("获取模块失败: " + error.message)
  return data
}

/** 获取指定模块的记录 */
export async function getModuleRecords(moduleKey: string, userId?: string) {
  const supabase = await getSupabase()
  const uid = userId ?? (await getFirstUserId())
  const { data, error } = await supabase
    .from("life_records")
    .select("*")
    .eq("user_id", uid)
    .eq("module_key", moduleKey)
    .order("record_date", { ascending: false })
    .limit(20)
  if (error) throw new Error("获取记录失败: " + error.message)
  return data
}
