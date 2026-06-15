"use client"

import { useEffect, useState, useCallback } from "react"
import { RefreshCw, Plus, ChevronDown, ChevronUp } from "lucide-react"
import { DynamicIcon } from "@/components/dynamic-icon"
import { getUserModules, getModuleRecords } from "@/lib/actions/init"

/** 模块定义类型 */
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

/** 生活记录类型 */
type LifeRecord = {
  id: number
  module_key: string
  data: Record<string, unknown>
  raw_text: string | null
  record_date: string
}

interface ModuleBoardProps {
  /** 初始模块数据（从服务端获取） */
  initialModules: Module[]
  /** 刷新触发器（由父组件 ChatPanel 控制） */
  refreshSignal: number
}

export function ModuleBoard({ initialModules, refreshSignal }: ModuleBoardProps) {
  const [modules, setModules] = useState<Module[]>(initialModules)
  const [records, setRecords] = useState<LifeRecord[]>([])
  const [expandedModule, setExpandedModule] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  /** 加载所有模块的记录 */
  const loadAllRecords = useCallback(async (mods: Module[]) => {
    const all: LifeRecord[] = []
    for (const mod of mods) {
      try {
        const recs = await getModuleRecords(mod.module_key)
        all.push(...(recs as LifeRecord[]))
      } catch {
        // 模块无记录时忽略
      }
    }
    setRecords(all)
  }, [])

  /** 刷新模块和记录 */
  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const freshModules = await getUserModules()
      setModules(freshModules as Module[])
      await loadAllRecords(freshModules as Module[])
    } catch (err) {
      console.error("刷新失败:", err)
    } finally {
      setLoading(false)
    }
  }, [loadAllRecords])

  // 初始加载记录
  useEffect(() => {
    loadAllRecords(modules)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // 当 refreshSignal 变化时刷新
  useEffect(() => {
    if (refreshSignal > 0) {
      refresh()
    }
  }, [refreshSignal, refresh])

  /** 按模块分组记录 */
  const recordsByModule = new Map<string, LifeRecord[]>()
  for (const rec of records) {
    const list = recordsByModule.get(rec.module_key) ?? []
    list.push(rec)
    recordsByModule.set(rec.module_key, list)
  }

  return (
    <div className="flex flex-col h-full bg-gray-50 dark:bg-gray-950">
      {/* 标题栏 */}
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">
            管理看板
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {modules.length} 个模块
          </p>
        </div>
        <button
          onClick={refresh}
          disabled={loading}
          className="rounded-lg p-2 text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors"
          title="手动刷新"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* 模块卡片列表 */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {modules.length === 0 && (
          <div className="text-center text-gray-400 mt-8">
            <p className="text-sm">暂无模块，请在右侧与 AI 对话创建</p>
          </div>
        )}

        {modules.map((mod) => {
          const modRecords = recordsByModule.get(mod.module_key) ?? []
          const isExpanded = expandedModule === mod.module_key
          const fields = mod.schema_definition?.fields ?? []

          return (
            <div
              key={mod.id}
              className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-sm overflow-hidden"
            >
              {/* 卡片标题 */}
              <button
                onClick={() => setExpandedModule(isExpanded ? null : mod.module_key)}
                className="w-full px-4 py-3 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
              >
                <span className="text-xl">
                  <DynamicIcon name={mod.icon} size={20} />
                </span>
                <div className="flex-1 text-left">
                  <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                    {mod.display_name}
                  </h3>
                  <p className="text-xs text-gray-500">{modRecords.length} 条记录</p>
                </div>
                {isExpanded ? (
                  <ChevronUp className="h-4 w-4 text-gray-400" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-gray-400" />
                )}
              </button>

              {/* 展开内容：字段定义 & 最近记录 */}
              {isExpanded && (
                <div className="border-t border-gray-100 dark:border-gray-800 px-4 py-3 space-y-3">
                  {/* 字段定义 */}
                  <div>
                    <p className="text-xs font-medium text-gray-500 mb-2">字段定义</p>
                    <div className="flex flex-wrap gap-1.5">
                      {fields.map((f) => (
                        <span
                          key={f.key}
                          className="inline-flex items-center gap-1 rounded-md bg-gray-100 dark:bg-gray-800 px-2 py-0.5 text-xs text-gray-700 dark:text-gray-300"
                        >
                          {f.label}
                          {f.required && (
                            <span className="text-red-400">*</span>
                          )}
                          <span className="text-gray-400">({f.type})</span>
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* 最近记录 */}
                  <div>
                    <p className="text-xs font-medium text-gray-500 mb-2">最近记录</p>
                    {modRecords.length === 0 ? (
                      <p className="text-xs text-gray-400">暂无记录</p>
                    ) : (
                      <div className="space-y-1.5">
                        {modRecords.slice(0, 5).map((rec) => (
                          <div
                            key={rec.id}
                            className="rounded-lg bg-gray-50 dark:bg-gray-800/50 px-3 py-2 text-xs text-gray-700 dark:text-gray-300"
                          >
                            <div className="flex justify-between items-start">
                              <div className="flex-1">
                                {fields.map((f) => {
                                  const val = rec.data?.[f.key]
                                  if (val === undefined || val === null) return null
                                  return (
                                    <span key={f.key} className="mr-2">
                                      <span className="text-gray-400">{f.label}:</span>{" "}
                                      <span className="font-medium">{String(val)}</span>
                                    </span>
                                  )
                                })}
                              </div>
                              <span className="text-gray-400 shrink-0 ml-2">
                                {rec.record_date}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
