<script lang="ts">
	import favicon from '#lib/assets/favicon.svg';
	import { PUBLIC_CONVEX_URL } from '$app/env/public';
	import { setupConvex } from 'convex-svelte';

	let { children } = $props();

	setupConvex(PUBLIC_CONVEX_URL);
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{@render children()}
