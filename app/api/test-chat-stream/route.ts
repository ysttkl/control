import { createOpenAI } from "@ai-sdk/openai"
import { streamText, generateText } from "ai"

const deepseek = createOpenAI({
  baseURL: "https://api.deepseek.com",
  apiKey: process.env.DEEPSEEK_API_KEY,
})

export async function GET() {
  const results: Record<string, unknown> = {}

  // 1. 非流式 generateText
  try {
    const r = await generateText({
      model: deepseek.chat("deepseek-chat"),
      prompt: "say hi",
    })
    results["generateText"] = { success: true, text: r.text }
  } catch (e) {
    results["generateText"] = { success: false, error: String(e) }
  }

  // 2. 流式 streamText（收集文本）
  try {
    const result = streamText({
      model: deepseek.chat("deepseek-chat"),
      prompt: "count from 1 to 5 slowly",
    })

    let collected = ""
    for await (const part of result.fullStream) {
      if (part.type === "text-delta") {
        collected += part.text
      }
    }

    results["streamText (fullStream)"] = { success: true, text: collected }
  } catch (e) {
    results["streamText (fullStream)"] = { success: false, error: String(e) }
  }

  // 3. toTextStreamResponse 测试
  try {
    const result2 = streamText({
      model: deepseek.chat("deepseek-chat"),
      prompt: "say hello in Chinese",
    })
    const response = result2.toTextStreamResponse()
    const reader = response.body?.getReader()
    if (!reader) throw new Error("no body")

    const decoder = new TextDecoder()
    let streamText2 = ""
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      streamText2 += decoder.decode(value, { stream: true })
    }

    results["toTextStreamResponse"] = { success: true, rawSSE: streamText2.slice(0, 500) }
  } catch (e) {
    results["toTextStreamResponse"] = { success: false, error: String(e) }
  }

  return Response.json(results)
}
