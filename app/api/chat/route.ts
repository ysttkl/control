import { streamText, tool, jsonSchema } from "ai"
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

/** 构建 System Prompt，将当前模块定义注入给大模型 */
function buildSystemPrompt(modules: Array<{ module_key: string; display_name: string; schema_definition: unknown }>) {
  if (modules.length === 0) {
    return `你是一个 AI 个人数据助手。当前用户还没有创建任何模块，请引导用户先通过 create_new_module 工具创建模块。

你可以使用以下工具：
- create_new_module：为用户创建新的数据记录模块（如热量、运动、收支等）
- record_data：向指定模块写入一条数据记录`
  }

  const moduleDescriptions = modules
    .map((m) => {
      const schema = m.schema_definition as Record<string, unknown>
      const fields = (schema?.fields as Array<{ key: string; label: string; type: string; required?: boolean; options?: string[] }>) ?? []
      const fieldDescs = fields
        .map((f) => `    - ${f.key}: ${f.label} (${f.type}${f.options ? ", 可选值: " + f.options.join("/") : ""}${f.required ? "，必填" : ""})`)
        .join("\n")
      return `### ${m.display_name} (module_key: "${m.module_key}")
${fieldDescs}`
    })
    .join("\n\n")

  return `你是一个 AI 个人数据助手。你可以帮用户向以下模块写入结构化数据：

${moduleDescriptions}

## 工具使用说明
- **record_data**：当用户告诉你需要记录的内容（比如"我吃了两碗米饭"、"今天跑了5公里"），解析出对应的结构化数据并调用此工具。
- **create_new_module**：当用户想要记录一个你还没有合适模块的数据时，主动为其创建新的模块。

请用友好的语气与用户交流。每次引导用户完善记录信息（如缺失必填字段时主动询问）。`
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
      tools: {
        /**
         * 工具：向指定模块写入一条结构化记录
         */
        record_data: tool({
          description: "向指定的模块写入一条结构化数据记录。调用前请确保提供的 data 字段与模块的 schema_definition 匹配。",
          inputSchema: jsonSchema<{
            module_key: string
            data: Record<string, unknown>
            raw_text?: string
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
            },
            required: ["module_key", "data"],
          }),
          execute: async ({ module_key, data, raw_text }) => {
            const supabase = await getSupabaseClient()
            const { error } = await supabase.from("life_records").insert({
              user_id: userId,
              module_key,
              data,
              raw_text: raw_text ?? null,
              record_date: new Date().toISOString().split("T")[0],
            })

            if (error) {
              return { success: false, error: error.message }
            }

            return {
              success: true,
              message: `已在「${module_key}」模块中保存记录。`,
              record: { module_key, data, date: new Date().toISOString().split("T")[0] },
            }
          },
        }),

        /**
         * 工具：创建新的数据采集模块
         */
        create_new_module: tool({
          description: "当用户需要记录一个新类型的数据时，创建一个新的模块。需要提供模块名称、唯一标识和字段定义。",
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
