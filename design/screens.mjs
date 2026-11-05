/* Screen registry. Primitives live in kit.mjs so the defs can import them
   without a circular dependency back through this file. */
export * from "./kit.mjs";

/* ------------------------------------------------------------- registry */
import money from "./defs/money.mjs";
import plan from "./defs/plan.mjs";
import understand from "./defs/understand.mjs";
import data from "./defs/data.mjs";
import entry from "./defs/entry.mjs";
import admin from "./defs/admin.mjs";
import foundations from "./defs/foundations.mjs";

export const SCREENS = [...entry, ...money, ...plan, ...understand, ...data, ...admin, ...foundations];
