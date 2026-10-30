"use client"

import * as React from "react"
import { cn } from "cn"
import { Dialog as SheetPrimitive } from "radix-ui"
import { X } from "lucide-react"

function Sheet({ ...props }) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />
}

function SheetTrigger({ ...props }) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />
}

function SheetClose({ ...props }) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />
}

function SheetPortal({ ...props }) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />
}

function SheetOverlay({ className, ...props }) {
  return (
    <SheetPrimitive.Overlay
      data-slot="sheet-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-black/20 duration-150 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
        className
      )}
      {...props}
    />
  )
}

function SheetContent({ className, children, side = "right", ...props }) {
  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Content
        data-slot="sheet-content"
        data-side={side}
        className={cn(
          "fixed z-50 flex flex-col gap-4 bg-popover text-popover-foreground shadow-xl outline-none data-open:animate-in data-closed:animate-out",
          side === "right" &&
            "inset-y-0 right-0 h-full w-full border-l border-border data-open:slide-in-from-right data-closed:slide-out-to-right sm:max-w-md",
          side === "left" &&
            "inset-y-0 left-0 h-full w-full border-r border-border data-open:slide-in-from-left data-closed:slide-out-to-left sm:max-w-md",
          side === "bottom" &&
            "inset-x-0 bottom-0 h-auto max-h-[85vh] border-t border-border data-open:slide-in-from-bottom data-closed:slide-out-to-bottom",
          className
        )}
        {...props}
      >
        {children}
        <SheetPrimitive.Close className="absolute top-4 right-4 rounded-sm opacity-70 transition-opacity hover:opacity-100 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:pointer-events-none">
          <X className="size-4" />
          <span className="sr-only">Close</span>
        </SheetPrimitive.Close>
      </SheetPrimitive.Content>
    </SheetPortal>
  )
}

function SheetHeader({ className, ...props }) {
  return (
    <div
      data-slot="sheet-header"
      className={cn("flex flex-col gap-1.5 p-4", className)}
      {...props}
    />
  )
}

function SheetFooter({ className, ...props }) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn("mt-auto flex flex-col gap-2 p-4", className)}
      {...props}
    />
  )
}

function SheetTitle({ className, ...props }) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn("font-heading text-base font-semibold text-foreground", className)}
      {...props}
    />
  )
}

function SheetDescription({ className, ...props }) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetOverlay,
  SheetPortal,
  SheetTitle,
  SheetTrigger,
}
