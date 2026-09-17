<script lang="ts">
	import { onMount } from 'svelte';
	import { useConvexClient } from 'convex-svelte';
	import { Bell } from '@lucide/svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { api } from '../../../convex/_generated/api';
	import { applicationServerKey, disableNotifications } from '#lib/notifications.js';
	const client = useConvexClient();
	let supported = $state(false);
	let installRequired = $state(false);
	let enabled = $state(false);
	let blocked = $state(false);
	let working = $state(true);
	let publicKey = $state<string | null>(null);
	let error = $state('');
	onMount(() => {
		const ios =
			/iPad|iPhone|iPod/.test(navigator.userAgent) ||
			(navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
		installRequired = ios && !window.matchMedia('(display-mode: standalone)').matches;
		supported = 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
		if (!supported || installRequired) {
			working = false;
			return;
		}
		blocked = Notification.permission === 'denied';
		void (async () => {
			try {
				publicKey = await client.query(api.notifications.configuration, {});
				const registration = await navigator.serviceWorker.ready;
				const subscription = await registration.pushManager.getSubscription();
				enabled =
					!!subscription &&
					(await client.query(api.notifications.enabled, { endpoint: subscription.endpoint }));
			} catch {
				error = 'Kunne ikke hente varslingsinnstillingene.';
			} finally {
				working = false;
			}
		})();
	});
	async function enable() {
		if (!publicKey) return;
		working = true;
		error = '';
		try {
			const permission = await Notification.requestPermission();
			blocked = permission === 'denied';
			if (permission !== 'granted') return;
			const registration = await navigator.serviceWorker.ready;
			let subscription = await registration.pushManager.getSubscription();
			if (
				subscription &&
				!(await client.query(api.notifications.enabled, { endpoint: subscription.endpoint }))
			) {
				await subscription.unsubscribe();
				subscription = null;
			}
			subscription ??= await registration.pushManager.subscribe({
				userVisibleOnly: true,
				applicationServerKey: applicationServerKey(publicKey)
			});
			const serialized = subscription.toJSON();
			if (!serialized.keys?.p256dh || !serialized.keys.auth)
				throw new Error('Nettleseren kunne ikke opprette varsler.');
			await client.mutation(api.notifications.subscribe, {
				endpoint: subscription.endpoint,
				keys: { p256dh: serialized.keys.p256dh, auth: serialized.keys.auth }
			});
			enabled = true;
		} catch (cause) {
			error = cause instanceof Error ? cause.message : 'Kunne ikke aktivere varsler.';
		} finally {
			working = false;
		}
	}
	async function disable() {
		working = true;
		error = '';
		try {
			await disableNotifications(client);
			enabled = false;
		} catch {
			error = 'Kunne ikke slå av varsler. Prøv igjen med nett.';
		} finally {
			working = false;
		}
	}
</script>

<section class="panel">
	<h2 class="flex items-center gap-2"><Bell size={18} />Varsler</h2>
	{#if installRequired}
		<p class="muted">Legg appen til på Hjem-skjermen og åpne den der for å aktivere varsler.</p>
	{:else if !supported && !working}
		<p class="muted">Denne nettleseren støtter ikke pushvarsler.</p>
	{:else if blocked}
		<p class="muted">Varsler er blokkert. Tillat dem i enhetens varslingsinnstillinger.</p>
		{#if enabled}<Button variant="outline" onclick={disable} disabled={working}
				>Slå av varsler</Button
			>{/if}
	{:else}
		<p class="muted">Varsle på denne enheten når kvitteringene dine er klare.</p>
		<Button
			variant={enabled ? 'outline' : 'default'}
			disabled={working || !publicKey}
			onclick={enabled ? disable : enable}
		>
			{working ? 'Henter …' : enabled ? 'Slå av varsler' : 'Slå på varsler'}
		</Button>
		{#if !publicKey && !working && !error}<p class="muted">
				Varsler er ikke tilgjengelige ennå.
			</p>{/if}
	{/if}
	{#if error}<p class="error" role="alert">{error}</p>{/if}
</section>
