<script lang="ts">
	import { Input } from '#lib/components/ui/input/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import {
		Camera,
		Inbox,
		ChartNoAxesCombined,
		Search,
		ReceiptText,
		LogOut,
		Users,
		WifiOff,
		CloudUpload,
		ChevronRight,
		Settings,
		Copy,
		Check
	} from '@lucide/svelte';
	import { useAuth, useQuery, usePaginatedQuery, useConvexClient } from 'convex-svelte';
	import { api } from '../../convex/_generated/api';
	import { authClient, fetchAccessToken } from '#lib/auth-client.js';
	import { PUBLIC_CONVEX_SITE_URL } from '$app/env/public';
	import Capture from '#lib/components/Capture.svelte';
	import ReceiptCard from '#lib/components/ReceiptCard.svelte';
	import Spending from '#lib/components/Spending.svelte';
	import History from '#lib/components/History.svelte';
	import Review from '#lib/components/Review.svelte';
	import NotificationSettings from '#lib/components/NotificationSettings.svelte';
	import { disableNotifications } from '#lib/notifications.js';
	import { replaceState } from '$app/navigation';
	import {
		drainQueue,
		localReceipts,
		type LocalReceipt,
		type UploadTransport
	} from '#lib/upload-queue.js';
	import type { Id } from '../../convex/_generated/dataModel';
	import type { Receipt } from '#lib/domain/insights.js';
	import { formatMoney, osloDate } from '#lib/domain/receipt.js';
	import { monthlyInsights } from '#lib/domain/insights.js';
	import { onMount, tick } from 'svelte';
	let area = $state<'capture' | 'inbox' | 'spending' | 'history'>('capture');
	let selected = $state<Receipt | null>(null);
	let returnScroll = 0;
	let notificationReceiptId = $state<string | null>(null);
	let notificationError = $state('');
	async function closeReceipt() {
		selected = null;
		await tick();
		window.scrollTo(0, returnScroll);
	}
	let settings = $state(false);
	let name = $state('');
	let email = $state('');
	let password = $state('');
	let signingUp = $state(false);
	let working = $state(false);
	let error = $state('');
	let householdName = $state('Hjemme');
	let invitation = $state('');
	let joinExisting = $state(false);
	let copied = $state(false);
	let online = $state(true);
	let queue = $state<LocalReceipt[]>([]);
	let offlineHousehold = $state<{ id: string; name: string } | null>(null);
	const auth = useAuth();
	const client = useConvexClient();
	const household = useQuery(api.households.current, () => (auth.isAuthenticated ? {} : 'skip'));
	const receipts = usePaginatedQuery(
		api.receipts.list,
		() => (auth.isAuthenticated && household.data ? {} : 'skip'),
		{ initialNumItems: 100 }
	);
	const householdId = $derived(
		household.data?.household._id ?? (!online ? offlineHousehold?.id : null)
	);
	const householdTitle = $derived(
		household.data?.household.name ?? offlineHousehold?.name ?? 'Hjemme'
	);
	const pending = $derived(
		receipts.results.filter((receipt) => receipt.status !== 'reviewed' && !receipt.excluded)
	);
	const totals = $derived(monthlyInsights(receipts.results, osloDate().slice(0, 7)));
	const transport: UploadTransport = {
		reserve: (clientId, imageCount, householdId) =>
			client.mutation(api.receipts.reserve, {
				clientId,
				imageCount,
				householdId: householdId as Id<'households'>
			}),
		upload: async (id, position, blob) => {
			const token = await fetchAccessToken();
			if (!token) throw new Error('Logg inn for å fortsette opplastingen.');
			const response = await fetch(
				`${PUBLIC_CONVEX_SITE_URL}/receipt-image?receipt=${id}&position=${position}`,
				{
					method: 'POST',
					headers: { Authorization: `Bearer ${token}`, 'Content-Type': blob.type },
					body: blob
				}
			);
			if (!response.ok) throw new Error('Opplastingen ble avbrutt. Prøver igjen når du har nett.');
		},
		complete: async (id) => {
			await client.mutation(api.receipts.completeUpload, { id });
		}
	};
	async function refreshQueue() {
		if (householdId) queue = await localReceipts(householdId);
		else queue = [];
	}
	async function synchronize() {
		if (receipts.status === 'CanLoadMore') receipts.loadMore(100);
		if (household.data)
			localStorage.setItem(
				'receipt-household',
				JSON.stringify({ id: household.data.household._id, name: household.data.household.name })
			);
		await refreshQueue();
		if (auth.isAuthenticated && household.data)
			await drainQueue(household.data.household._id, transport, refreshQueue);
	}
	onMount(() => {
		online = navigator.onLine;
		try {
			offlineHousehold = JSON.parse(localStorage.getItem('receipt-household') ?? 'null');
		} catch {
			offlineHousehold = null;
		}
		const connection = () => {
			online = navigator.onLine;
			void synchronize();
		};
		window.addEventListener('online', connection);
		window.addEventListener('offline', connection);
		const interval = setInterval(() => void synchronize(), 5000);
		void refreshQueue();
		return () => {
			window.removeEventListener('online', connection);
			window.removeEventListener('offline', connection);
			clearInterval(interval);
		};
	});
	onMount(() => {
		notificationReceiptId = new URLSearchParams(window.location.search).get('receipt');
	});
	$effect(() => {
		if (auth.isAuthenticated && household.data && notificationReceiptId) {
			const id = notificationReceiptId;
			notificationReceiptId = null;
			void (async () => {
				try {
					const result = await client.query(api.receipts.detail, { id: id as Id<'receipts'> });
					if (!auth.isAuthenticated || result.receipt.householdId !== householdId) return;
					settings = false;
					area = 'inbox';
					openReceipt(result.receipt);
				} catch {
					notificationError = 'Kvitteringen er slettet eller ikke tilgjengelig for denne kontoen.';
				} finally {
					replaceState('/', {});
				}
			})();
		}
	});

	async function authenticate(event: SubmitEvent) {
		event.preventDefault();
		working = true;
		error = '';
		try {
			const result = signingUp
				? await authClient.signUp.email({ name, email, password })
				: await authClient.signIn.email({ email, password });
			if (result.error) throw new Error(result.error.message ?? 'Innlogging mislyktes.');
			password = '';
		} catch (cause) {
			error = (cause as Error).message;
		} finally {
			working = false;
		}
	}
	async function configureHousehold(event: SubmitEvent) {
		event.preventDefault();
		working = true;
		error = '';
		try {
			if (joinExisting) await client.mutation(api.households.join, { invitation });
			else
				await client.mutation(api.households.create, {
					name: householdName,
					invitation: crypto.randomUUID().replaceAll('-', '')
				});
		} catch (cause) {
			error = (cause as Error).message;
		} finally {
			working = false;
		}
	}
	async function signOut() {
		try {
			await disableNotifications(client);
		} catch {
			notificationError = 'Kunne ikke slå av varsler. Prøv å logge ut igjen med nett.';
			return;
		}
		await authClient.signOut();
		localStorage.removeItem('receipt-household');
		offlineHousehold = null;
		queue = [];
		selected = null;
		settings = false;
	}
	function navigate(next: typeof area) {
		area = next;
		selected = null;
		settings = false;
		window.scrollTo({ top: 0 });
	}
	function openReceipt(receipt: Receipt) {
		returnScroll = window.scrollY;
		selected = receipt;
		window.scrollTo({ top: 0 });
	}
	async function copyInvitation() {
		try {
			await navigator.clipboard.writeText(household.data?.household.invitation ?? '');
			copied = true;
		} catch {
			error = 'Kopier invitasjonskoden fra feltet.';
		}
	}
</script>

<svelte:head><title>Kvittering · Dagligvarene, samlet</title></svelte:head>
{#if !auth.isAuthenticated && !householdId}
	<div class="login-page">
		<a class="brand" href="/"
			><span class="brand-mark"><ReceiptText size={23} /></span>Kvittering<span class="brand-dot"
				>.</span
			></a
		>
		<section class="login-panel">
			<div class="section-eyebrow">ET LITE REGNSKAP FOR HVERDAGEN</div>
			<h1>Dagligvarene.<br />Samlet.</h1>
			<div class="login-receipt" aria-hidden="true">
				<ReceiptText size={44} strokeWidth={1.2} /><span>Handle. Ta et bilde. Ferdig.</span>
			</div>
			<h2>{signingUp ? 'Opprett konto' : 'Velkommen hjem'}</h2>
			<form onsubmit={authenticate}>
				{#if signingUp}<label>Navn<Input autocomplete="name" bind:value={name} required /></label
					>{/if}<label
					>E-post<Input type="email" autocomplete="email" bind:value={email} required /></label
				><label
					>Passord<Input
						type="password"
						autocomplete={signingUp ? 'new-password' : 'current-password'}
						bind:value={password}
						minlength={12}
						required
					/></label
				>{#if signingUp}<p class="footnote">
						Bruk minst 12 tegn. Dere oppretter hver deres konto og deler én privat husstand.
					</p>{/if}{#if error}<p class="error" role="alert">{error}</p>{/if}<Button
					type="submit"
					variant="default"
					class="primary wide"
					disabled={working}
					>{working ? 'Et øyeblikk …' : signingUp ? 'Opprett konto' : 'Logg inn'}<ChevronRight
						size={18}
					/></Button
				>
			</form>
			<Button
				variant="ghost"
				class="text-button login-toggle"
				onclick={() => {
					signingUp = !signingUp;
					error = '';
				}}>{signingUp ? 'Har du konto? Logg inn' : 'Ny her? Opprett konto'}</Button
			>
		</section>
	</div>
{:else if auth.isAuthenticated && !household.data}
	<div class="setup-page">
		<div class="brand"><span class="brand-mark"><ReceiptText /></span>Kvittering.</div>
		<section class="panel">
			<div class="section-eyebrow">DERES FELLES OVERSIKT</div>
			<h1>{joinExisting ? 'Bli med hjem.' : 'En husstand for to.'}</h1>
			<p class="muted">Begge kan legge til og kontrollere kvitteringer.</p>
			{#if household.isLoading}<p role="status">Henter husstanden …</p>{:else}<form
					onsubmit={configureHousehold}
				>
					{#if joinExisting}<label
							>Invitasjonskode<Input bind:value={invitation} autocomplete="off" required /></label
						>{:else}<label
							>Navn på husstanden<Input bind:value={householdName} maxlength={80} required /></label
						>{/if}{#if error}<p class="error" role="alert">{error}</p>{/if}<Button
						type="submit"
						variant="default"
						class="primary wide"
						disabled={working}>{joinExisting ? 'Bli med' : 'Opprett husstand'}</Button
					>
				</form>
				<Button
					variant="ghost"
					class="text-button"
					onclick={() => {
						joinExisting = !joinExisting;
						error = '';
					}}>{joinExisting ? 'Opprett en ny husstand' : 'Jeg har en invitasjonskode'}</Button
				>{/if}<Button variant="ghost" class="text-button" onclick={signOut}>Logg ut</Button>
		</section>
	</div>
{:else}
	<div class="app-shell">
		<aside class="sidebar">
			<a class="brand" href="/"
				><span class="brand-mark"><ReceiptText size={23} /></span>Kvittering<span class="brand-dot"
					>.</span
				></a
			>
			<div class="sidebar-household">
				<span class="household-avatar"><Users size={18} /></span>
				<div><strong>{householdTitle}</strong><span>Deres dagligvarer</span></div>
			</div>
			<nav aria-label="Hovedmeny">
				{#each [{ id: 'capture' as const, label: 'Ny kvittering', icon: Camera }, { id: 'inbox' as const, label: 'Innboks', icon: Inbox }, { id: 'spending' as const, label: 'Forbruk', icon: ChartNoAxesCombined }, { id: 'history' as const, label: 'Historikk', icon: Search }] as item (item.id)}<Button
						variant="ghost"
						class={area === item.id && !settings ? 'active' : ''}
						onclick={() => navigate(item.id)}
						><item.icon
							size={20}
						/>{item.label}{#if item.id === 'inbox' && pending.length + queue.length}<span
								class="nav-count">{pending.length + queue.length}</span
							>{/if}</Button
					>{/each}
			</nav>
			<div class="sidebar-bottom">
				<Button
					variant="ghost"
					class="text-button"
					onclick={() => {
						settings = true;
						selected = null;
					}}><Settings size={17} />Husstanden</Button
				>
			</div>
		</aside>
		<div class="main-shell">
			<header class="topbar">
				<span class="mobile-brand"><ReceiptText size={20} />Kvittering.</span><span
					class="topbar-label"
					>{householdTitle} <span>/</span>
					{selected
						? 'Kontroller kvittering'
						: settings
							? 'Husstanden'
							: {
									capture: 'Ny kvittering',
									inbox: 'Innboks',
									spending: 'Forbruk',
									history: 'Historikk'
								}[area]}</span
				><Button
					variant="ghost"
					class="account-button"
					onclick={() => {
						settings = !settings;
						selected = null;
					}}
					><Users size={16} /><span>{household.data?.members.length ?? 2} i husstanden</span
					></Button
				>
			</header>
			<main>
				{#if notificationError}<p class="error" role="alert">{notificationError}</p>{/if}
				{#if !online}<div class="offline-indicator">
						<WifiOff size={15} />Uten nett · nye bilder lagres på enheten
					</div>{/if}
				{#if settings}<div class="page-heading">
						<div class="section-eyebrow">DERES FELLES OVERSIKT</div>
						<h1>{householdTitle}</h1>
					</div>
					<section class="panel settings-panel">
						<h2>Medlemmer</h2>
						{#each household.data?.members ?? [] as member (member._id)}<p class="member-row">
								<Users size={18} />{member.name}
							</p>{/each}
						<h2>Inviter partneren din</h2>
						<p class="muted">
							Partneren oppretter en konto og bruker denne koden. Husstanden har plass til to.
						</p>
						<label
							>Invitasjonskode<Input
								readonly
								value={household.data?.household.invitation ?? ''}
							/></label
						><Button variant="outline" class="secondary" onclick={copyInvitation}
							>{#if copied}<Check size={16} />Kopiert{:else}<Copy size={16} />Kopier kode{/if}</Button
						>
						<p class="footnote">
							Del koden privat. Alle med koden kan bli medlem hvis det er en ledig plass.
						</p>
						<Button
							variant="ghost"
							class="text-button"
							onclick={async () => {
								await client.mutation(api.households.rotateInvitation, {
									invitation: crypto.randomUUID().replaceAll('-', '')
								});
								copied = false;
							}}>Lag ny invitasjonskode</Button
						>
						<hr />
						<h2>På denne enheten</h2>
						<p class="muted">
							{queue.length} kvittering(er) venter på opplasting. Hold appen åpen for å laste opp. Legg
							appen til på Hjem-skjermen fra nettlesermenyen.
						</p>
						<Button variant="ghost" class="text-button" onclick={signOut}
							><LogOut size={17} />Logg ut</Button
						>
						<p class="footnote">
							Lokalt lagrede bilder beholdes for denne husstanden til neste innlogging og vellykket
							opplasting.
						</p>
					</section>
					<NotificationSettings />
				{:else if selected}{#key selected._id}<Review
							receipt={selected}
							onclose={closeReceipt}
						/>{/key}
				{:else if area === 'capture'}<div class="capture-layout">
						<Capture
							householdId={householdId!}
							offline={!online}
							onsaved={() => void synchronize()}
						/>
						<aside class="capture-sidebar">
							<section class="month-summary">
								<div class="section-eyebrow">DENNE MÅNEDEN</div>
								<h2>{formatMoney(totals.products)}</h2>
								<p>Vareforbruk uten pant</p>
								<div>
									<span>{totals.selected.length} kvitteringer</span><span
										>{totals.provisional ? 'Foreløpig' : 'Kontrollert'}</span
									>
								</div>
								<Button variant="ghost" class="text-button" onclick={() => navigate('spending')}
									>Se forbruket<ChevronRight size={16} /></Button
								>
							</section>
							<section class="recent-section">
								<div class="section-header">
									<h2>Siste kvitteringer</h2>
									<Button variant="ghost" class="text-button" onclick={() => navigate('inbox')}
										>Se alle<ChevronRight size={14} /></Button
									>
								</div>
								{#each receipts.results.slice(0, 3) as receipt (receipt._id)}<ReceiptCard
										{receipt}
										onopen={openReceipt}
									/>{:else}<div class="empty-recent">
										<ReceiptText size={26} />
										<p>Ingen kvitteringer ennå.</p>
									</div>{/each}{#if queue.length}<Button
										variant="ghost"
										class="notice queue-notice"
										onclick={() => navigate('inbox')}
										><CloudUpload size={19} />{queue.length} lagret på enheten</Button
									>{/if}
							</section>
						</aside>
					</div>
				{:else if area === 'inbox'}<div class="page-heading">
						<h1>Innboks</h1>
						<p class="muted">
							{pending.length
								? `${pending.length} kvittering(er) venter på kontroll.`
								: 'Alt er kontrollert.'}
						</p>
					</div>
					{#if queue.length}<section class="panel">
							<div class="section-header">
								<h2>På denne enheten</h2>
								<Button variant="ghost" class="text-button" onclick={() => void synchronize()}
									>Prøv opplasting</Button
								>
							</div>
							{#each queue as entry (entry.id)}<div class="queue-row">
									<CloudUpload size={22} />
									<div>
										<strong
											>{entry.state === 'uploading'
												? 'Laster opp'
												: entry.state === 'uploaded'
													? 'Lastet opp'
													: 'Lagret på denne enheten'}</strong
										>
										<p>
											{entry.images.length} bilder · {entry.uploaded.filter(Boolean).length} lastet opp
										</p>
										{#if entry.error}<p class="warning">{entry.error}</p>{/if}
									</div>
								</div>{/each}
						</section>{/if}
					<div class="receipt-list">
						{#each pending as receipt (receipt._id)}<ReceiptCard
								{receipt}
								onopen={openReceipt}
							/>{:else}<div class="empty-state">
								<Inbox size={35} />
								<h2>Innboksen er tom.</h2>
								<p>Ta et bilde neste gang dere handler.</p>
								<Button variant="default" class="primary" onclick={() => navigate('capture')}
									><Camera size={18} />Ny kvittering</Button
								>
							</div>{/each}
					</div>
				{/if}
				{#if area === 'spending'}<div hidden={!!selected || settings}>
						<Spending receipts={receipts.results} onopen={openReceipt} />
					</div>{/if}
				{#if area === 'history'}<div hidden={!!selected || settings}>
						<History receipts={receipts.results} onopen={openReceipt} />
					</div>{/if}
				{#if receipts.error}<p class="error" role="alert">
						Kunne ikke hente kvitteringer. {receipts.error.message}
					</p>{:else if receipts.status !== 'Exhausted' && auth.isAuthenticated}<p
						class="footnote"
						role="status"
					>
						Henter historikken. Totalene er ufullstendige til innlastingen er ferdig.
					</p>{/if}
			</main>
			<footer class="app-footer">
				<span>Kvittering</span><span>NOK · Norge</span>
			</footer>
		</div>
		<nav class="mobile-nav" aria-label="Mobilmeny">
			<Button
				variant="ghost"
				class={area === 'capture' ? 'active' : ''}
				onclick={() => navigate('capture')}><Camera size={22} /><span>Ta bilde</span></Button
			><Button
				variant="ghost"
				class={area === 'inbox' ? 'active' : ''}
				onclick={() => navigate('inbox')}
				><Inbox size={22} /><span
					>Innboks{pending.length + queue.length ? ` (${pending.length + queue.length})` : ''}</span
				></Button
			><Button
				variant="ghost"
				class={area === 'spending' ? 'active' : ''}
				onclick={() => navigate('spending')}
				><ChartNoAxesCombined size={22} /><span>Forbruk</span></Button
			><Button
				variant="ghost"
				class={area === 'history' ? 'active' : ''}
				onclick={() => navigate('history')}><Search size={22} /><span>Historikk</span></Button
			>
		</nav>
	</div>
{/if}
