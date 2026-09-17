import { createClient, type GenericCtx } from '@convex-dev/better-auth';
import { convex } from '@convex-dev/better-auth/plugins';
import { betterAuth } from 'better-auth/minimal';
import { components } from './_generated/api';
import type { DataModel } from './_generated/dataModel';
import authConfig from './auth.config';
import { env } from './_generated/server';
export const authComponent = createClient<DataModel>(components.betterAuth);
export const createAuth = (ctx: GenericCtx<DataModel>) =>
	betterAuth({
		baseURL: env.SITE_URL ?? 'http://localhost:5173',
		secret: env.BETTER_AUTH_SECRET,
		database: authComponent.adapter(ctx),
		emailAndPassword: { enabled: true, requireEmailVerification: false, minPasswordLength: 12 },
		trustedOrigins: [env.SITE_URL ?? 'http://localhost:5173'],
		plugins: [convex({ authConfig })]
	});
