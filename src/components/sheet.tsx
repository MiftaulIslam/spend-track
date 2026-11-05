"use client";

import { Dialog } from "@base-ui/react/dialog";
import type { ReactNode } from "react";
import { cn } from "./ui";
import { IconClose } from "./icons";

/**
 * Sheet / modal.
 *
 * One component, two presentations: a bottom sheet on a phone (thumb-reachable,
 * with a grip) and a centred modal from 640px up. Base UI supplies the focus
 * trap, scroll lock, escape handling and aria wiring — all of which are easy to
 * write and very easy to write subtly wrong.
 */

export function Sheet({
  open,
  onOpenChange,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      {children}
    </Dialog.Root>
  );
}

export function SheetContent({
  children,
  title,
  description,
  className,
  size = "md",
}: {
  children: ReactNode;
  title: string;
  description?: string;
  className?: string;
  size?: "md" | "lg";
}) {
  return (
    <Dialog.Portal>
      <Dialog.Backdrop className="animate-fade fixed inset-0 z-60 bg-inverse/40 backdrop-blur-[2px]" />
      <Dialog.Popup
        className={cn(
          // Phone: bottom sheet.
          "animate-sheet fixed inset-x-0 bottom-0 z-61 flex max-h-[92dvh] flex-col",
          "rounded-t-xl bg-paper pb-safe shadow-[var(--shadow-sheet)] outline-none",
          "ring-1 ring-rule",
          // Tablet and up: centred modal.
          "sm:animate-modal sm:inset-auto sm:top-1/2 sm:left-1/2 sm:max-h-[84dvh] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl sm:shadow-[var(--shadow-modal)]",
          size === "lg" ? "sm:w-[min(680px,calc(100vw-48px))]" : "sm:w-[min(520px,calc(100vw-48px))]",
          className,
        )}
      >
        <div className="mx-auto mt-2 mb-1 h-1 w-[34px] shrink-0 rounded-full bg-rule-strong sm:hidden" aria-hidden />
        <div className="flex items-center gap-3 border-b border-rule px-4 pt-2 pb-3">
          <Dialog.Title className="text-md font-semibold">{title}</Dialog.Title>
          <Dialog.Close
            className="ml-auto grid size-8 place-items-center rounded-md text-ink-secondary transition-colors hover:bg-rule-faint"
            aria-label="Close"
          >
            <IconClose size={18} />
          </Dialog.Close>
        </div>
        {description ? (
          <Dialog.Description className="px-4 pt-3 text-sm text-ink-tertiary">
            {description}
          </Dialog.Description>
        ) : null}
        {children}
      </Dialog.Popup>
    </Dialog.Portal>
  );
}

export function SheetBody({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain", className)}>{children}</div>
  );
}

export function SheetFoot({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("shrink-0 border-t border-rule bg-paper px-4 pt-3 pb-4", className)}>
      {children}
    </div>
  );
}

export const SheetTrigger = Dialog.Trigger;
export const SheetClose = Dialog.Close;
