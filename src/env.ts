import { defineEnvVars } from '@sveltejs/kit/env';
export const variables = defineEnvVars({
	PUBLIC_CONVEX_URL: { public: true, static: true, description: 'Convex deployment URL.' },
	PUBLIC_CONVEX_SITE_URL: { public: true, static: true, description: 'Convex HTTP action URL.' }
});
