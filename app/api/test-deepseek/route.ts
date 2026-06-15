import { createOpenAI } from "@ai-sdk/openai"
import { generateText } from "ai"

export async function GET() {
  const results: Record<string, unknown> = {}
  const apiKey = process.env.DEEPSEEK_API_KEY

  // 1. API Key 检查
  results["API Key 状态"] = apiKey
    ? `✅ 已设置 (${apiKey.slice(0, 10)}...)`
    : "❌ 未设置"

  // 2. 裸 fetch 测试
  try {
    const res = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [{ role: "user", content: "say hi" }],
        max_tokens: 20,
      }),
    })
    const text = await res.text()
    results["裸 fetch"] = { status: res.status, body: text.slice(0, 300) }
  } catch (e) {
    results["裸 fetch"] = `❌ ${e instanceof Error ? e.message : e}`
  }

  // 3. AI SDK 测试（带自定义 fetch 抓包）
  const captured: { url: string; body: string }[] = []
  const debugFetch: typeof fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
    const body = init?.body ? String(init.body) : ""
    captured.push({ url, body })
    return fetch(input, init)
  }

  try {
    const client = createOpenAI({
      baseURL: "https://api.deepseek.com",
      apiKey,
      fetch: debugFetch,
    })
    const r = await generateText({
      model: client.chat("deepseek-chat"),
      prompt: "say one word",
      maxRetries: 0,
    })
    results["AI SDK"] = { success: true, text: r.text, totalRequests: captured.length, requests: captured }
  } catch (e) {
    results["AI SDK"] = {
      success: false,
      error: e instanceof Error ? e.message : String(e),
      totalRequests: captured.length,
      requests: captured,
    }
  }

  return Response.json(results)
}
