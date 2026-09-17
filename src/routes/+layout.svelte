<script lang="ts">
	import { PUBLIC_CONVEX_URL } from '$app/env/public';
	import { setupConvex } from 'convex-svelte';
	import AuthProvider from '#lib/components/AuthProvider.svelte';
	import '../app.css';
	let { children } = $props();
	setupConvex(PUBLIC_CONVEX_URL);
</script>

<svelte:head>
	<link rel="icon" href="/icon.svg" type="image/svg+xml" />
	<link rel="apple-touch-icon" href="/icon-192.png" />
	<link rel="manifest" href="/manifest.webmanifest" />
	<meta name="theme-color" content="#163f36" />
	<meta name="apple-mobile-web-app-capable" content="yes" />
	<meta name="apple-mobile-web-app-status-bar-style" content="default" />
	<meta name="description" content="Ta vare på kvitteringene. Få oversikt over dagligvarene." />
</svelte:head>
<AuthProvider>{@render children()}</AuthProvider>
