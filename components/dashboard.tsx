"use client"

import { useState, useCallback } from "react"
import { ModuleBoard } from "@/components/module-board"
import { ChatPanel } from "@/components/chat-panel"

/** 模块类型（与 ModuleBoard 保持一致） */
type Module = {
  id: number
  user_id: string
  module_key: string
  display_name: string
  icon: string
  schema_definition: {
    fields: Array<{
      key: string
      label: string
      type: string
      required?: boolean
      options?: string[]
    }>
  }
}

interface DashboardProps {
  initialModules: Module[]
}

/**
 * 主看板布局：左侧动态模块看板 + 右侧 AI 对话控制台
 */
export function Dashboard({ initialModules }: DashboardProps) {
  /** 刷新信号 —— 每次自增都会触发 ModuleBoard 刷新数据 */
  const [refreshSignal, setRefreshSignal] = useState(0)

  /** Chat 完成一轮回复时调用（可能包含工具调用） */
  const handleDataChanged = useCallback(() => {
    setRefreshSignal((n) => n + 1)
  }, [])

  return (
    <div className="flex h-full">
      {/* 左侧：动态管理看板 */}
      <div className="w-1/2 min-w-[360px]">
        <ModuleBoard
          initialModules={initialModules}
          refreshSignal={refreshSignal}
        />
      </div>

      {/* 右侧：AI 对话控制台 */}
      <div className="w-1/2 min-w-[360px]">
        <ChatPanel onDataChanged={handleDataChanged} />
      </div>
    </div>
  )
}
