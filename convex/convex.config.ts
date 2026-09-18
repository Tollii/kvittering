import { defineApp } from "convex/server";
import { v } from "convex/values";
import betterAuth from "@convex-dev/better-auth/convex.config";
import workflow from "@convex-dev/workflow/convex.config";
import workpool from "@convex-dev/workpool/convex.config";
const app = defineApp({
  env: {
    KASSALAPP_API_KEY: v.optional(v.string()),
    OPENAI_API_KEY: v.optional(v.string()),
    TYPESAFE_API_KEY: v.optional(v.string()),
    OPENAI_RECEIPT_MODEL: v.optional(v.string()),
    TYPESAFE_MODEL: v.optional(v.string()),
    BETTER_AUTH_SECRET: v.optional(v.string()),
    SITE_URL: v.optional(v.string()),
    ALLOW_EXPO_GO: v.optional(v.string()),
    RECEIPT_PROVIDER: v.optional(v.string()),
    EXPO_ACCESS_TOKEN: v.optional(v.string()),
  },
});
app.use(betterAuth);
app.use(workflow);
app.use(workpool, { name: "catalogWorkpool" });
export default app;
