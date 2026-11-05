import type * as z from "zod";
import type { createCategorySchema } from "@/src/lib/schemas";

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
