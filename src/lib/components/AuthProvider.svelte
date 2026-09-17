<script lang="ts">
	import { setupAuth } from 'convex-svelte';
	import { authClient, fetchAccessToken } from '#lib/auth-client.js';
	import type { Snippet } from 'svelte';
	let { children }: { children: Snippet } = $props();
	const session = authClient.useSession();
	setupAuth(() => ({
		isLoading: $session.isPending,
		isAuthenticated: !!$session.data,
		fetchAccessToken
	}));
</script>

{@render children()}
