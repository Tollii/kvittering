<script lang="ts">
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
	import { onMount } from 'svelte';
	let area = $state<'capture' | 'inbox' | 'spending' | 'history'>('capture');
	let selected = $state<Receipt | null>(null);
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
			<p class="intro">Fra en kvittering i lomma til oversikt over det dere kjøper.</p>
			<div class="login-receipt" aria-hidden="true">
				<ReceiptText size={44} strokeWidth={1.2} /><span>Handle. Ta et bilde. Ferdig.</span>
			</div>
			<h2>{signingUp ? 'Opprett konto' : 'Velkommen hjem'}</h2>
			<form onsubmit={authenticate}>
				{#if signingUp}<label>Navn<input autocomplete="name" bind:value={name} required /></label
					>{/if}<label
					>E-post<input type="email" autocomplete="email" bind:value={email} required /></label
				><label
					>Passord<input
						type="password"
						autocomplete={signingUp ? 'new-password' : 'current-password'}
						bind:value={password}
						minlength="12"
						required
					/></label
				>{#if signingUp}<p class="footnote">
						Bruk minst 12 tegn. Dere oppretter hver deres konto og deler én privat husstand.
					</p>{/if}{#if error}<p class="error" role="alert">{error}</p>{/if}<button
					class="primary wide"
					disabled={working}
					>{working ? 'Et øyeblikk …' : signingUp ? 'Opprett konto' : 'Logg inn'}<ChevronRight
						size={18}
					/></button
				>
			</form>
			<button
				class="text-button login-toggle"
				onclick={() => {
					signingUp = !signingUp;
					error = '';
				}}>{signingUp ? 'Har du konto? Logg inn' : 'Ny her? Opprett konto'}</button
			>
		</section>
		<p class="login-footer">Laget for hverdagen. Og kvitteringene som følger med.</p>
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
							>Invitasjonskode<input bind:value={invitation} autocomplete="off" required /></label
						>{:else}<label
							>Navn på husstanden<input bind:value={householdName} maxlength="80" required /></label
						>{/if}{#if error}<p class="error" role="alert">{error}</p>{/if}<button
						class="primary wide"
						disabled={working}>{joinExisting ? 'Bli med' : 'Opprett husstand'}</button
					>
				</form>
				<button
					class="text-button"
					onclick={() => {
						joinExisting = !joinExisting;
						error = '';
					}}>{joinExisting ? 'Opprett en ny husstand' : 'Jeg har en invitasjonskode'}</button
				>{/if}<button class="text-button" onclick={signOut}>Logg ut</button>
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
				{#each [{ id: 'capture' as const, label: 'Ny kvittering', icon: Camera }, { id: 'inbox' as const, label: 'Innboks', icon: Inbox }, { id: 'spending' as const, label: 'Forbruk', icon: ChartNoAxesCombined }, { id: 'history' as const, label: 'Historikk', icon: Search }] as item (item.id)}<button
						class:active={area === item.id && !settings}
						onclick={() => navigate(item.id)}
						><item.icon
							size={20}
						/>{item.label}{#if item.id === 'inbox' && pending.length + queue.length}<span
								class="nav-count">{pending.length + queue.length}</span
							>{/if}</button
					>{/each}
			</nav>
			<div class="sidebar-bottom">
				<p>Små kjøp.<br />Bedre oversikt.</p>
				<button
					class="text-button"
					onclick={() => {
						settings = true;
						selected = null;
					}}><Settings size={17} />Husstanden</button
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
				><button
					class="account-button"
					onclick={() => {
						settings = !settings;
						selected = null;
					}}
					><Users size={16} /><span>{household.data?.members.length ?? 2} i husstanden</span
					></button
				>
			</header>
			<main>
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
							>Invitasjonskode<input
								readonly
								value={household.data?.household.invitation ?? ''}
							/></label
						><button class="secondary" onclick={copyInvitation}
							>{#if copied}<Check size={16} />Kopiert{:else}<Copy size={16} />Kopier kode{/if}</button
						>
						<p class="footnote">
							Del koden privat. Alle med koden kan bli medlem hvis det er en ledig plass.
						</p>
						<button
							class="text-button"
							onclick={async () => {
								await client.mutation(api.households.rotateInvitation, {
									invitation: crypto.randomUUID().replaceAll('-', '')
								});
								copied = false;
							}}>Lag ny invitasjonskode</button
						>
						<hr />
						<h2>På denne enheten</h2>
						<p class="muted">
							{queue.length} kvittering(er) venter på opplasting. Hold appen åpen for å laste opp. Legg
							appen til på Hjem-skjermen fra nettlesermenyen.
						</p>
						<button class="text-button" onclick={signOut}><LogOut size={17} />Logg ut</button>
						<p class="footnote">
							Lokalt lagrede bilder beholdes for denne husstanden til neste innlogging og vellykket
							opplasting.
						</p>
					</section>
				{:else if selected}{#key selected._id}<Review
							receipt={selected}
							onclose={() => (selected = null)}
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
								<button class="text-button" onclick={() => navigate('spending')}
									>Se forbruket<ChevronRight size={16} /></button
								>
							</section>
							<section class="recent-section">
								<div class="section-header">
									<h2>Siste kvitteringer</h2>
									<button class="text-button" onclick={() => navigate('inbox')}
										>Se alle<ChevronRight size={14} /></button
									>
								</div>
								{#each receipts.results.slice(0, 3) as receipt (receipt._id)}<ReceiptCard
										{receipt}
										onopen={openReceipt}
									/>{:else}<div class="empty-recent">
										<ReceiptText size={26} />
										<p>Den første kvitteringen<br />er starten på oversikten.</p>
									</div>{/each}{#if queue.length}<button
										class="notice queue-notice"
										onclick={() => navigate('inbox')}
										><CloudUpload size={19} />{queue.length} lagret på enheten</button
									>{/if}
							</section>
							<p class="capture-aside-note">Du tar bildet.<br />Vi holder orden på detaljene.</p>
						</aside>
					</div>
				{:else if area === 'inbox'}<div class="page-heading">
						<div class="section-eyebrow">KLART NÅR DU ER DET</div>
						<h1>En ting mindre å huske.</h1>
						<p class="muted">
							{pending.length
								? `${pending.length} kvittering(er) venter på kontroll.`
								: 'Du er ajour. Nye kvitteringer kommer hit.'}
						</p>
					</div>
					{#if queue.length}<section class="panel">
							<div class="section-header">
								<h2>På denne enheten</h2>
								<button class="text-button" onclick={() => void synchronize()}
									>Prøv opplasting</button
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
								<button class="primary" onclick={() => navigate('capture')}
									><Camera size={18} />Ny kvittering</button
								>
							</div>{/each}
					</div>
				{:else if area === 'spending'}<Spending receipts={receipts.results} onopen={openReceipt} />
				{:else}<History receipts={receipts.results} onopen={openReceipt} />{/if}
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
				<span>Kvittering</span><span>Hverdagen, litt mer oversiktlig.</span><span>NOK · Norge</span>
			</footer>
		</div>
		<nav class="mobile-nav" aria-label="Mobilmeny">
			<button class:active={area === 'capture'} onclick={() => navigate('capture')}
				><Camera size={22} /><span>Ta bilde</span></button
			><button class:active={area === 'inbox'} onclick={() => navigate('inbox')}
				><Inbox size={22} /><span
					>Innboks{pending.length + queue.length ? ` (${pending.length + queue.length})` : ''}</span
				></button
			><button class:active={area === 'spending'} onclick={() => navigate('spending')}
				><ChartNoAxesCombined size={22} /><span>Forbruk</span></button
			><button class:active={area === 'history'} onclick={() => navigate('history')}
				><Search size={22} /><span>Historikk</span></button
			>
		</nav>
	</div>
{/if}
