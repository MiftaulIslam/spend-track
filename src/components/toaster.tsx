"use client";

import { Toaster as Sonner, toast } from "sonner";
import { useTheme } from "next-themes";

/**
 * Toasts.
 *
 * Styled through CSS variables rather than Sonner's default palette so a
 * success toast is the same moss green as an inflow amount — one colour
 * language across the product.
 */
export function Toaster() {
  const { resolvedTheme } = useTheme();
  return (
    <Sonner
      theme={(resolvedTheme as "light" | "dark") ?? "light"}
      position="bottom-center"
      offset={16}
      mobileOffset={{ bottom: 76 }}
      duration={5000}
      closeButton={false}
      toastOptions={{
        classNames: {
          toast:
            "!bg-inverse !text-ink-inverse !border-0 !rounded-md !text-sm !shadow-[var(--shadow-popover)] !font-sans",
          description: "!text-ink-inverse/70",
          actionButton: "!bg-transparent !text-brass-bright !font-semibold !px-0",
          cancelButton: "!bg-transparent !text-ink-inverse/60",
          success: "[&_[data-icon]]:!text-inflow",
          error: "[&_[data-icon]]:!text-danger",
        },
      }}
    />
  );
}

export { toast };
