import {
  Flame,
  Dumbbell,
  Wallet,
  Moon,
  Smile,
  BookOpen,
  Pen,
  Heart,
  Star,
  Sun,
  Cloud,
  Music,
  Coffee,
  ShoppingBag,
  type LucideIcon,
} from "lucide-react"

/** 图标名称到 Lucide 组件的映射 */
const ICON_MAP: Record<string, LucideIcon> = {
  flame: Flame,
  dumbbell: Dumbbell,
  wallet: Wallet,
  moon: Moon,
  smile: Smile,
  "book-open": BookOpen,
  pen: Pen,
  heart: Heart,
  star: Star,
  sun: Sun,
  cloud: Cloud,
  music: Music,
  coffee: Coffee,
  "shopping-bag": ShoppingBag,
}

interface DynamicIconProps {
  name: string
  size?: number
  className?: string
}

/** 根据字符串名称动态渲染 Lucide 图标，找不到时显示默认图标 */
export function DynamicIcon({ name, size = 18, className }: DynamicIconProps) {
  const Icon = ICON_MAP[name] ?? Star
  return <Icon size={size} className={className} />
}
