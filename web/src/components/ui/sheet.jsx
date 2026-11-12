import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

export const Sheet = DialogPrimitive.Root
export const SheetTrigger = DialogPrimitive.Trigger
export const SheetClose = DialogPrimitive.Close
export const SheetTitle = DialogPrimitive.Title
export const SheetDescription = DialogPrimitive.Description

export function SheetContent({ className, children, ...props }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="sheet-overlay fixed inset-0 z-50 bg-black/55 backdrop-blur-[2px]" />
      <DialogPrimitive.Content
        className={cn(
          'sheet-content fixed inset-y-0 right-0 z-50 flex w-[440px] max-w-[92vw] flex-col gap-4 border-l border-white/10 bg-[#0a1120]/96 p-7 pt-16 shadow-2xl backdrop-blur-xl',
          className,
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close className="absolute right-5 top-[52px] rounded-md p-1.5 text-muted-foreground transition hover:bg-white/10 hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary">
          <X className="size-4" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}
