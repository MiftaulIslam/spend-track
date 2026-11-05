"use client";

import { ThemeProvider as NextThemes } from "next-themes";
import type { ReactNode } from "react";

/**
 * Theme. `attribute="data-theme"` matches the CSS in globals.css, and
 * next-themes writes it before paint so there is no flash of the wrong theme.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemes
      attribute="data-theme"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      storageKey="spendtrack-theme"
    >
      {children}
    </NextThemes>
  );
}
