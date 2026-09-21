import { defineApp } from "convex/server";
import { v } from "convex/values";
import betterAuth from "@convex-dev/better-auth/convex.config";
import workflow from "@convex-dev/workflow/convex.config";
import workpool from "@convex-dev/workpool/convex.config";

const app = defineApp({
  env: {
    KASSALAPP_API_KEY: v.string().optional(),
    OPENAI_API_KEY: v.string().optional(),
    TYPESAFE_API_KEY: v.string().optional(),
    OPENAI_RECEIPT_MODEL: v.string().optional(),
    TYPESAFE_MODEL: v.string().optional(),
    BETTER_AUTH_SECRET: v.string().optional(),
    SITE_URL: v.string().optional(),
    ALLOW_EXPO_GO: v.string().optional(),
    RECEIPT_PROVIDER: v.string().optional(),
    APNS_KEY_ID: v.string().optional(),
    APNS_TEAM_ID: v.string().optional(),
    APNS_PRIVATE_KEY: v.string().optional(),
    EXPO_ACCESS_TOKEN: v.string().optional(),
  },
});

app.use(betterAuth);

app.use(workflow);

app.use(workflow, { name: "productAnalysisWorkflow" });

app.use(workpool, { name: "catalogWorkpool" });

export default app;
