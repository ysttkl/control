import { Dashboard } from "@/components/dashboard"
import { initializeModules, getUserModules } from "@/lib/actions/init"

export default async function Home() {
  // 尝试初始化模块并获取模块列表
  let modules: Awaited<ReturnType<typeof getUserModules>> = []
  let error: string | null = null

  try {
    const result = await initializeModules()
    modules = await getUserModules(result.userId)
  } catch (err) {
    error = err instanceof Error ? err.message : "初始化失败"
  }

  return (
    <main className="flex-1 h-full">
      {error ? (
        /* 错误状态：提示用户检查数据库连接或创建用户 */
        <div className="flex h-full items-center justify-center bg-gray-50 dark:bg-gray-950">
          <div className="text-center max-w-md px-6">
            <div className="text-4xl mb-4">⚠️</div>
            <h1 className="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-2">
              无法连接到数据库
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {error}
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-4">
              请确认 Supabase 环境变量已正确配置，且 users 表中至少有一条记录。
            </p>
          </div>
        </div>
      ) : (
        <Dashboard initialModules={modules} />
      )}
    </main>
  )
}
