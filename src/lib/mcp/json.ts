import type { z } from "zod";

export type JsonValue = z.infer<ReturnType<typeof z.json>>;
