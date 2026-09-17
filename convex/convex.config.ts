import { defineApp } from 'convex/server';
import { v } from 'convex/values';
import betterAuth from '@convex-dev/better-auth/convex.config';
import workflow from '@convex-dev/workflow/convex.config';
const app = defineApp({
	env: {
		OPENAI_API_KEY: v.optional(v.string()),
		TYPESAFE_API_KEY: v.optional(v.string()),
		OPENAI_RECEIPT_MODEL: v.optional(v.string()),
		TYPESAFE_MODEL: v.optional(v.string()),
		BETTER_AUTH_SECRET: v.optional(v.string()),
		SITE_URL: v.optional(v.string()),
		RECEIPT_PROVIDER: v.optional(v.string())
	}
});
app.use(betterAuth);
app.use(workflow);
export default app;
