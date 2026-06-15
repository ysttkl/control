"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { Send, Loader2 } from "lucide-react"

interface Message {
  id: string
  role: "user" | "assistant"
  content: string
}

interface ChatPanelProps {
  /** 当 AI 通过工具修改数据时触发，用于通知看板刷新 */
  onDataChanged: () => void
}

export function ChatPanel({ onDataChanged }: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  // 自动滚动到底部
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      const input = inputRef.current
      if (!input || !input.value.trim() || loading) return

      const userMessage: Message = {
        id: crypto.randomUUID(),
        role: "user",
        content: input.value.trim(),
      }

      setMessages((prev) => [...prev, userMessage])
      setLoading(true)
      input.value = ""

      const abortController = new AbortController()
      abortRef.current = abortController

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: messages.concat(userMessage).map((m) => ({
              role: m.role,
              content: m.content,
            })),
          }),
          signal: abortController.signal,
        })

        if (!res.ok) {
          const err = await res.json()
          throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`)
        }

        // 解析 SSE 流
        const reader = res.body?.getReader()
        if (!reader) throw new Error("无响应流")

        const decoder = new TextDecoder()
        const assistantId = crypto.randomUUID()
        let assistantContent = ""

        // 先添加空的 assistant 消息占位
        setMessages((prev) => [
          ...prev,
          { id: assistantId, role: "assistant", content: "" },
        ])

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          // 纯文本流，直接拼接到 assistantContent
          assistantContent += decoder.decode(value, { stream: true })
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, content: assistantContent }
                : m
            )
          )
        }

        // 流结束后触发数据刷新
        onDataChanged()
      } catch (err) {
        if ((err as Error).name === "AbortError") return
        console.error("Chat error:", err)
        // 添加错误消息
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: `❌ 错误: ${err instanceof Error ? err.message : "未知错误"}`,
          },
        ])
      } finally {
        setLoading(false)
        abortRef.current = null
      }
    },
    [messages, loading, onDataChanged]
  )

  return (
    <div className="flex flex-col h-full border-l border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
      {/* 标题栏 */}
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">
          AI 助手
        </h2>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          用自然语言记录你的生活数据
        </p>
      </div>

      {/* 消息列表 */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-4"
      >
        {messages.length === 0 && (
          <div className="text-center text-gray-400 dark:text-gray-500 mt-8">
            <p className="text-sm">试着说：</p>
            <p className="text-xs mt-1">"我中午吃了黄焖鸡米饭，大概700卡"</p>
            <p className="text-xs">"今天跑步了30分钟，强度中等"</p>
            <p className="text-xs">"帮我创建一个睡眠记录模块"</p>
          </div>
        )}

        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] rounded-xl px-4 py-2 text-sm leading-relaxed ${
                m.role === "user"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200"
              }`}
            >
              <p className="whitespace-pre-wrap">{m.content || (loading && m.role === "assistant" ? "思考中..." : "")}</p>
            </div>
          </div>
        ))}
      </div>

      {/* 输入区域 */}
      <form
        onSubmit={handleSubmit}
        className="border-t border-gray-200 dark:border-gray-700 p-4"
      >
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            placeholder="输入你想记录的内容..."
            disabled={loading}
            className="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-blue-600 px-3 py-2 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </button>
        </div>
      </form>
    </div>
  )
}
