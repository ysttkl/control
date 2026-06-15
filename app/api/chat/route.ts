import { streamText, tool, jsonSchema, stepCountIs } from "ai"
import { createOpenAI } from "@ai-sdk/openai"
import { createClient } from "@/utils/supabase/server"
import { cookies } from "next/headers"

/** DeepSeek 模型 */
const deepseek = createOpenAI({
  baseURL: "https://api.deepseek.com",
  apiKey: process.env.DEEPSEEK_API_KEY,
})

/** 获取 Supabase 客户端 */
async function getSupabaseClient() {
  const cookieStore = await cookies()
  return createClient(cookieStore)
}

/** 获取第一个用户的 ID（MVP 阶段，后续从 session 获取） */
async function getFirstUserId(): Promise<string> {
  const supabase = await getSupabaseClient()
  const { data } = await supabase.from("users").select("id").limit(1)
  if (data && data.length > 0) return data[0].id
  throw new Error("未找到任何用户，请先在 Supabase 中创建用户。")
}

/** 从 user_modules 表中读取所有模块定义 */
async function fetchModules(userId: string) {
  const supabase = await getSupabaseClient()
  const { data, error } = await supabase
    .from("user_modules")
    .select("*")
    .eq("user_id", userId)
    .order("id", { ascending: true })

  if (error) throw new Error("获取模块失败: " + error.message)
  return data ?? []
}

/**
 * 获取当前北京时间的格式化字符串。
 * 格式：2026-06-15（周日）14:30
 */
function nowInBeijing(): string {
  const now = new Date()
  const beijing = new Date(now.getTime() + 8 * 60 * 60 * 1000) // UTC → 北京时间
  const y = beijing.getUTCFullYear()
  const m = String(beijing.getUTCMonth() + 1).padStart(2, "0")
  const d = String(beijing.getUTCDate()).padStart(2, "0")
  const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"]
  const wd = weekdays[beijing.getUTCDay()]
  const hh = String(beijing.getUTCHours()).padStart(2, "0")
  const mm = String(beijing.getUTCMinutes()).padStart(2, "0")
  return `${y}-${m}-${d}（${wd}）${hh}:${mm}`
}

/**
 * 构建 System Prompt —— 时间感知 + 科学顾问 + 数据分析师。
 * 每次请求时注入当前所有模块的 schema，确保 AI 严格匹配。
 */
function buildSystemPrompt(modules: Array<{ module_key: string; display_name: string; schema_definition: unknown }>) {
  const currentTime = nowInBeijing()

  const describeModule = (m: typeof modules[number]) => {
    const schema = m.schema_definition as Record<string, unknown>
    const fields = (schema?.fields as Array<{ key: string; label: string; type: string; required?: boolean; options?: string[] }>) ?? []
    const fieldLines = fields.map((f) => {
      const req = f.required ? "【必填】" : "【选填】"
      const opts = f.options ? ` → 可选: ${f.options.join(" / ")}` : ""
      return `      ${f.key}: ${f.label} | ${f.type} | ${req}${opts}`
    }).join("\n")
    return `### ${m.display_name} (module_key: "${m.module_key}")\n${fieldLines}`
  }

  const moduleSchemas = modules.length > 0
    ? modules.map(describeModule).join("\n\n")
    : "（暂无模块，AI 应引导用户使用 create_new_module 工具创建）"

  return `## 时间感知

当前的真实时间是 **${currentTime}（北京时间）**。

### 日期推算规则
- 用户**没提到任何时间** → record_date 默认填今天的日期
- 用户说"今天" → 用当前日期
- 用户说"昨天" → 当前日期减 1 天
- 用户说"前天" → 当前日期减 2 天
- 用户说"上周五" / "上周三" → 推算到上周对应的星期几
- 用户说"这周一/这周三" → 推算本周对应的日期
- 用户说具体日期如"6月10号" → 格式化为 YYYY-06-10（年份用当年）
- 用户说"月初" / "上周" 等模糊范围 → 尽量推算合理日期

**重要**：调用 record_data 时，务必根据上述规则在 record_date 参数中填入推算出的日期。调用 query_module_records 时，根据用户时间锚点推算出 start_date 和 end_date。"这周"指周一到周日；"最近7天" = ${currentTime.slice(0, 10)} 往前推 7 天。

## 角色定位

你是一位专业的 **健康管理与个人财务科学顾问 + 数据分析师**。你有三大核心能力：
1. **记录数据**：帮用户把日常饮食、运动、财务信息结构化存入数据库。
2. **科学估算**：当用户信息不完整时，基于常识主动估算缺失数值。
3. **查询与分析**：从数据库中检索用户的历史记录，进行汇总计算和趋势总结。

## 核心能力一：智能常识估算

当用户输入信息不完整时，你必须**基于科学常识和生活经验主动估算**缺失的数值。

### 饮食估算知识库
- 一碗米饭（约150g）：热量 ~180kcal, 碳水 ~40g, 蛋白质 ~4g
- 一碗面条（约200g）：热量 ~250kcal, 碳水 ~50g, 蛋白质 ~8g
- 牛肉面（标准碗）：热量 ~550-650kcal, 蛋白质 ~25g, 碳水 ~75g, 脂肪 ~15g
- 黄焖鸡米饭（一份）：热量 ~700-800kcal, 蛋白质 ~35g, 碳水 ~80g, 脂肪 ~25g
- 一个苹果：热量 ~80kcal, 碳水 ~20g
- 一杯牛奶（250ml）：热量 ~150kcal, 蛋白质 ~8g, 碳水 ~12g, 脂肪 ~8g
- 一个鸡蛋：热量 ~70kcal, 蛋白质 ~6g, 脂肪 ~5g
- 快餐汉堡：热量 ~500-700kcal, 蛋白质 ~25-30g, 碳水 ~45-55g, 脂肪 ~25-35g
- 沙拉（无酱）：热量 ~100-150kcal, 蛋白质 ~5g, 碳水 ~10g
- 披萨（一片）：热量 ~250-300kcal, 蛋白质 ~12g, 碳水 ~30g, 脂肪 ~10g
- 根据上下文推断餐次：7:00-10:00 为早餐，11:00-14:00 为午餐，17:00-20:00 为晚餐，其余为加餐

### 运动消耗估算知识库
- 跑步 30 分钟中等强度：消耗 ~250-300kcal
- 快走 30 分钟：消耗 ~120-150kcal
- 游泳 40 分钟中等强度：消耗 ~300-400kcal
- 骑行 60 分钟：消耗 ~400-500kcal
- 力量训练 45 分钟：消耗 ~200-300kcal
- 瑜伽 60 分钟：消耗 ~150-200kcal
- HIIT 20 分钟：消耗 ~200-250kcal
- 强度对应消耗倍率：低 ≈ 3-4 kcal/min, 中 ≈ 5-8 kcal/min, 高 ≈ 9-12 kcal/min

### 财务分类知识库
- 交通出行：打车、地铁、公交、加油、停车、共享单车
- 餐饮食品：外卖、聚餐、买菜、零食、咖啡奶茶
- 购物消费：衣服、日用品、电子产品、网购
- 住房居家：房租、水电、物业、维修、日用品
- 娱乐休闲：电影、游戏、旅游、KTV、运动健身
- 医疗健康：看病、买药、体检、牙科
- 收入分类：工资、奖金、兼职、投资收益、红包、退款
- 无法确定账户时，默认填 "微信" 或 "默认账户"

## 当前可用模块

${moduleSchemas}

## 工作流程

根据用户意图，选择正确的流程：

**流程 A：记录数据**
1. 判断用户想记录饮食、运动还是财务。
2. 提取明确信息，对模糊部分科学估算补全。
3. 调用 record_data 工具写入。data 字段必须完全匹配模块 schema。
4. 温暖告知用户你记录了什么、估算了什么。

**流程 B：查询/统计/回顾**
1. 判断用户想查哪个模块、什么时间范围。
2. **必须优先调用 query_module_records 工具**获取原始数据。传入正确的 module_key 和基于当前时间推算的日期范围。
3. 拿到数据后，扮演数据分析师角色：汇总计算（总热量、总花费、平均值、趋势等），用清晰结构呈现给用户。
4. 如果查询结果为空，温柔告知用户该模块暂无相关记录，建议先去记录一些数据。

## 回复要求

- 语气温暖、专业、简洁，像一位贴心的私人助理
- 记录场景：明确告知记录了什么数据 + 估算的数值及依据
- 查询场景：用简洁的结构化格式呈现汇总结果（如"本周总支出 325 元，主要集中在餐饮和交通"）
- 不确定的地方简略提及假设前提
- 当用户输入无法归类时，使用 create_new_module 创建新模块
- 所有 record_data 的 data 必须与模块 schema 严格一致`
}

export async function POST(req: Request) {
  try {
    const { messages } = await req.json()

    // 动态获取当前用户 ID
    const userId = await getFirstUserId()

    // 读取当前所有模块定义
    const modules = await fetchModules(userId)
    const systemPrompt = buildSystemPrompt(modules)

    const result = streamText({
      model: deepseek.chat("deepseek-chat"),
      system: systemPrompt,
      messages,
      // 允许最多 3 步（工具调用 → 模型分析回复 → 可能再调用 → 最终回复），默认 1 步会截断查询结果
      stopWhen: stepCountIs(3),
      tools: {
        /**
         * 工具：向指定模块写入一条结构化记录
         */
        record_data: tool({
          description:
            "向指定的模块写入一条结构化数据记录。调用前务必补齐所有必填字段——若用户未提供具体数值，你必须基于科学常识进行估算后填入。data 对象的 key 必须与目标模块 schema_definition 中的字段 key 完全一致。",
          inputSchema: jsonSchema<{
            module_key: string
            data: Record<string, unknown>
            raw_text?: string
            record_date?: string
          }>({
            type: "object",
            properties: {
              module_key: {
                type: "string",
                description: "模块标识，如 calories、exercise、finance",
              },
              data: {
                type: "object",
                description: "符合模块 schema_definition 的结构化数据，键值对形式",
              },
              raw_text: {
                type: "string",
                description: "用户原始输入文本，用于追溯",
              },
              record_date: {
                type: "string",
                description:
                  "记录日期，格式 YYYY-MM-DD。根据用户语意推算：没提时间默认今天，提了'昨天/上周五/6月10号'等则对应转换。不确定时也默认今天。",
              },
            },
            required: ["module_key", "data"],
          }),
          execute: async ({ module_key, data, raw_text, record_date }) => {
            const supabase = await getSupabaseClient()
            const date = record_date ?? new Date().toISOString().split("T")[0]
            const { error } = await supabase.from("life_records").insert({
              user_id: userId,
              module_key,
              data,
              raw_text: raw_text ?? null,
              record_date: date,
            })

            if (error) {
              return { success: false, error: error.message }
            }

            return {
              success: true,
              message: `已在「${module_key}」模块中保存记录（日期：${date}）。`,
              record: { module_key, data, date },
            }
          },
        }),

        /**
         * 工具：查询模块的历史记录（支持日期范围过滤）
         */
        query_module_records: tool({
          description:
            "查询指定模块的历史记录，支持日期范围过滤和数量限制。当用户询问'今天的数据'、'这周总共'、'最近记录'、'帮我看看'、'总结一下'等回顾/统计类问题时，必须优先调用此工具获取原始数据。",
          inputSchema: jsonSchema<{
            module_key: string
            start_date?: string
            end_date?: string
            limit?: number
          }>({
            type: "object",
            properties: {
              module_key: {
                type: "string",
                description: "要查询的模块标识，如 calories、exercise、finance",
              },
              start_date: {
                type: "string",
                description: "查询起始日期，格式 YYYY-MM-DD。根据当前时间推算，如'今天'=当天，'这周'=本周一",
              },
              end_date: {
                type: "string",
                description: "查询结束日期，格式 YYYY-MM-DD。根据当前时间推算",
              },
              limit: {
                type: "number",
                description: "返回记录数量上限，默认 50",
              },
            },
            required: ["module_key"],
          }),
          execute: async ({ module_key, start_date, end_date, limit }) => {
            const supabase = await getSupabaseClient()
            let query = supabase
              .from("life_records")
              .select("id, module_key, data, raw_text, record_date, created_at")
              .eq("user_id", userId)
              .eq("module_key", module_key)
              .order("record_date", { ascending: false })
              .limit(limit ?? 50)

            if (start_date) {
              query = query.gte("record_date", start_date)
            }
            if (end_date) {
              query = query.lte("record_date", end_date)
            }

            const { data, error } = await query

            if (error) {
              return { success: false, error: error.message }
            }

            return {
              success: true,
              module_key,
              count: data?.length ?? 0,
              date_range: { start_date: start_date ?? "不限", end_date: end_date ?? "不限" },
              records: data ?? [],
            }
          },
        }),

        /**
         * 工具：创建新的数据采集模块
         */
        create_new_module: tool({
          description:
            "当用户想记录的数据类型不在现有模块中时，创建一个新模块。需要设计合理的字段（key 英文小写、label 中文、类型正确），枚举型字段要提供 options 列表。",
          inputSchema: jsonSchema<{
            module_key: string
            display_name: string
            icon: string
            fields: Array<{ key: string; label: string; type: string; required?: boolean; options?: string[] }>
          }>({
            type: "object",
            properties: {
              module_key: {
                type: "string",
                description: "模块唯一标识，英文小写，如 sleep、mood、reading",
              },
              display_name: {
                type: "string",
                description: "模块显示名称，中文，如 睡眠记录、心情记录",
              },
              icon: {
                type: "string",
                description: "Lucide 图标名称，如 moon、smile、book-open",
              },
              fields: {
                type: "array",
                description: "字段定义列表",
                items: {
                  type: "object",
                  properties: {
                    key: { type: "string", description: "字段键名" },
                    label: { type: "string", description: "字段显示名称" },
                    type: { type: "string", description: "字段类型: string, number, enum" },
                    required: { type: "boolean", description: "是否必填" },
                    options: {
                      type: "array",
                      items: { type: "string" },
                      description: "枚举类型的可选值列表（仅 type=enum 时需要）",
                    },
                  },
                  required: ["key", "label", "type"],
                },
              },
            },
            required: ["module_key", "display_name", "icon", "fields"],
          }),
          execute: async ({ module_key, display_name, icon, fields }) => {
            const supabase = await getSupabaseClient()
            // 检查 module_key 是否已存在
            const { data: existing } = await supabase
              .from("user_modules")
              .select("id")
              .eq("user_id", userId)
              .eq("module_key", module_key)
              .maybeSingle()

            if (existing) {
              return { success: false, error: `模块 "${module_key}" 已存在，无需重复创建。` }
            }

            const schema_definition = { fields }

            const { error } = await supabase.from("user_modules").insert({
              user_id: userId,
              module_key,
              display_name,
              icon,
              schema_definition,
            })

            if (error) {
              return { success: false, error: error.message }
            }

            return {
              success: true,
              message: `已创建新模块「${display_name}」(module_key: ${module_key})，包含 ${fields.length} 个字段。`,
              module: { module_key, display_name, icon, fields },
            }
          },
        }),
      },
    })

    return result.toTextStreamResponse()
  } catch (error) {
    const message = error instanceof Error ? error.message : "未知错误"
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    })
  }
}
