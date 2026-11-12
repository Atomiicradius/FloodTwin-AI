import * as TabsPrimitive from '@radix-ui/react-tabs'
import { cn } from '@/lib/utils'

export const Tabs = TabsPrimitive.Root

export function TabsList({ className, ...props }) {
  return (
    <TabsPrimitive.List
      className={cn('inline-flex items-center gap-1 rounded-xl border border-white/10 bg-white/[0.04] p-1', className)}
      {...props}
    />
  )
}

export function TabsTrigger({ className, ...props }) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-1.5 text-[13px] font-medium text-muted-foreground transition-colors',
        'hover:text-foreground data-[state=active]:bg-white/10 data-[state=active]:text-foreground data-[state=active]:shadow-sm',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
        className,
      )}
      {...props}
    />
  )
}

export function TabsContent({ className, ...props }) {
  return <TabsPrimitive.Content className={cn('mt-4 outline-none', className)} {...props} />
}
