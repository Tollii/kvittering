<script lang="ts">
	import {
		ArrowLeft,
		Plus,
		Trash2,
		Check,
		RotateCcw,
		TriangleAlert,
		ChevronDown
	} from '@lucide/svelte';
	import { useQuery, useConvexClient } from 'convex-svelte';
	import { api } from '../../../convex/_generated/api';
	import type { Receipt } from '#lib/domain/insights.js';
	import {
		formatMoney,
		moneyInput,
		parseOre,
		reconcile,
		emptyLine,
		lineKinds,
		type ReceiptData,
		type ReceiptLine
	} from '#lib/domain/receipt.js';
	import { categoryGroups, categories, categoryById } from '#lib/domain/categories.js';
	import { fetchAccessToken } from '#lib/auth-client.js';
	import { PUBLIC_CONVEX_SITE_URL } from '$app/env/public';
	import { onMount, untrack } from 'svelte';
	let { receipt, onclose }: { receipt: Receipt; onclose: () => void } = $props();
	const initial = untrack(() => receipt);
	let expanded = $state<Record<string, boolean>>(
		Object.fromEntries(initial.data?.lines.map((line) => [line.id, line.issues.length > 0]) ?? [])
	);
	let data = $state<ReceiptData | null>(initial.data ? $state.snapshot(initial.data) : null);
	let revision = $state(initial.revision);
	let duplicateResolved = $state(initial.duplicateResolved);
	let excluded = $state(initial.excluded);
	let remember = $state<string[]>([]);
	let error = $state('');
	let busy = $state(false);
	let message = $state('');
	let urls = $state<string[]>([]);
	let photoError = $state('');
	let invalidMoney = $state<string[]>([]);
	const client = useConvexClient();
	const detail = useQuery(api.receipts.detail, { id: initial._id });
	const totals = $derived(data ? reconcile(data) : null);
	const labels: Record<string, string> = {
		product: 'Vare',
		item_discount: 'Varerabatt',
		receipt_discount: 'Kvitteringsrabatt',
		deposit: 'Pant',
		deposit_return: 'Pantretur',
		adjustment: 'Justering',
		summary: 'Oppsummering (telles ikke)',
		vat: 'MVA (telles ikke)'
	};
	onMount(() => {
		let cancelled = false;
		const resources: string[] = [];
		async function load() {
			try {
				const token = await fetchAccessToken();
				for (let position = 0; position < initial.imageCount; position++) {
					const response = await fetch(
						`${PUBLIC_CONVEX_SITE_URL}/receipt-image?receipt=${initial._id}&position=${position}`,
						{ headers: { Authorization: `Bearer ${token}` } }
					);
					if (!response.ok) throw new Error('Bildet kunne ikke hentes.');
					const url = URL.createObjectURL(await response.blob());
					resources.push(url);
					if (!cancelled) urls = [...resources];
					else URL.revokeObjectURL(url);
				}
			} catch {
				if (!cancelled) photoError = 'Bildene kunne ikke hentes. Kontroller nettilkoblingen.';
			}
		}
		void load();
		return () => {
			cancelled = true;
			resources.forEach((url) => URL.revokeObjectURL(url));
		};
	});
	function setAmount(line: ReceiptLine, field: 'amountOre' | 'unitPriceOre', event: Event) {
		const key = line.id + field;
		try {
			line[field] = parseOre((event.target as HTMLInputElement).value);
			invalidMoney = invalidMoney.filter((item) => item !== key);
			error = '';
		} catch (cause) {
			invalidMoney = [...new Set([...invalidMoney, key])];
			error = (cause as Error).message;
		}
	}
	function setTotal(event: Event) {
		try {
			data!.totalOre = parseOre((event.target as HTMLInputElement).value);
			invalidMoney = invalidMoney.filter((key) => key !== 'total');
			error = '';
		} catch (cause) {
			invalidMoney = [...new Set([...invalidMoney, 'total'])];
			error = (cause as Error).message;
		}
	}
	async function save(reviewed: boolean) {
		if (!data || invalidMoney.length) return;
		busy = true;
		error = '';
		message = '';
		try {
			await client.mutation(api.receipts.save, {
				id: initial._id,
				revision,
				data: $state.snapshot(data),
				reviewed,
				rememberLineIds: remember,
				duplicateResolved,
				excluded
			});
			revision++;
			message = reviewed ? 'Kvitteringen er kontrollert.' : 'Endringene er lagret.';
			if (reviewed) onclose();
		} catch (cause) {
			error = cause instanceof Error ? cause.message : 'Lagring mislyktes.';
		} finally {
			busy = false;
		}
	}
	async function retry() {
		busy = true;
		error = '';
		try {
			await client.mutation(api.receipts.retry, { id: initial._id });
			onclose();
		} catch (cause) {
			error = (cause as Error).message;
		} finally {
			busy = false;
		}
	}
	function reload() {
		const current = detail.data?.receipt;
		if (current?.data) {
			data = $state.snapshot(current.data);
			revision = current.revision;
		}
	}
</script>

<button class="text-button back-button" onclick={onclose}><ArrowLeft size={17} />Tilbake</button>
<div class="page-heading">
	<div class="section-eyebrow">KONTROLLER KVITTERING</div>
	<h1>{data?.store ?? 'Ny kvittering'}</h1>
	<p class="muted">Lastet opp av {initial.uploaderName}. Dette angir ikke hvem som betalte.</p>
</div>
{#if detail.data?.receipt.revision !== undefined && detail.data.receipt.revision !== revision}<div
		class="notice warning"
	>
		Kvitteringen har nye endringer.<button class="text-button" onclick={reload}
			>Hent siste versjon</button
		>
	</div>{/if}
<div class="review-grid">
	<section class="receipt-photos">
		<h2>Originalen</h2>
		{#each urls as url, index (url)}<a href={url} target="_blank" rel="noreferrer"
				><img src={url} alt={`Original kvittering, bilde ${index + 1}`} /></a
			>{:else}<p class="muted">{photoError || 'Henter bilder …'}</p>{/each}
		<p class="footnote">Trykk på et bilde for å se det i full størrelse.</p>
	</section>
	<section class="review-content">
		{#if initial.provider.includes('mock')}<div class="notice warning">
				<TriangleAlert size={19} /><span
					>Demodata fra en testleverandør. Bildet er ikke lest av en modell.</span
				>
			</div>{/if}
		{#if initial.error}<div class="notice warning">{initial.error}</div>{/if}
		{#if initial.duplicateOf}<div class="notice warning">
				<div>
					<strong>Mulig duplikat</strong>
					<p>En annen kvittering har samme bilde eller kjøpsdetaljer. Begge beholdes.</p>
					<label class="check-label"
						><input type="checkbox" bind:checked={duplicateResolved} />Jeg har kontrollert dette</label
					><label class="check-label"
						><input type="checkbox" bind:checked={excluded} />Utelat denne kvitteringen fra forbruk</label
					>
				</div>
			</div>{/if}
		{#if data && totals}
			<div class="panel receipt-fields">
				<label>Butikk<input bind:value={data.store} /></label><label
					>Avdeling / sted<input bind:value={data.branch} /></label
				>
				<div class="field-row">
					<label>Kjøpsdato<input type="date" bind:value={data.purchaseDate} /></label><label
						>Klokkeslett<input type="time" bind:value={data.purchaseTime} /></label
					>
				</div>
				<div class="field-row">
					<label
						>Betalt (kr)<input
							inputmode="decimal"
							value={moneyInput(data.totalOre)}
							onchange={setTotal}
						/></label
					><label>Valuta<input bind:value={data.currency} /></label>
				</div>
				<label>Kvitteringsnummer<input bind:value={data.receiptNumber} /></label>
			</div>
			{#if data.issues.length}<div class="notice warning">
					<div>
						<strong>Uklare felt</strong>{#each data.issues as issue, index (index)}<p>
								{issue}
							</p>{/each}<button class="text-button" onclick={() => (data!.issues = [])}
							>Feltene er kontrollert</button
						>
					</div>
				</div>{/if}
			<div class="section-header">
				<h2>Varer og beløp</h2>
				<span class="muted small">{data.lines.length} linjer</span>
			</div>
			{#each data.lines as line, index (line.id)}<details
					class="line-editor"
					bind:open={expanded[line.id]}
				>
					<summary
						><span
							><strong>{line.name || 'Ny vare'}</strong><small
								>{labels[line.kind]}{line.kind === 'product'
									? ` · ${categoryById.get(line.categoryId ?? '')?.name ?? 'Ukjent kategori'}`
									: ''}{line.issues.length ? ' · Må kontrolleres' : ''}</small
							></span
						><strong>{formatMoney(line.amountOre)}</strong><ChevronDown size={16} /></summary
					>
					<div class="line-fields">
						<p class="original-text">Original: {line.originalText || 'Manuelt lagt til'}</p>
						<label>Navn<input bind:value={line.name} /></label>
						<div class="field-row">
							<label
								>Linjetype<select
									bind:value={line.kind}
									onchange={() => {
										line.categoryId = line.kind === 'product' ? 'fallback.unclear' : null;
									}}
									>{#each lineKinds as kind (kind)}<option value={kind}>{labels[kind]}</option
										>{/each}</select
								></label
							><label
								>Linjesum (kr)<input
									inputmode="decimal"
									value={moneyInput(line.amountOre)}
									onchange={(event) => setAmount(line, 'amountOre', event)}
								/></label
							>
						</div>
						{#if line.kind === 'product'}<label
								>Kategori<select bind:value={line.categoryId}
									>{#each categoryGroups as [group, name] (group)}<optgroup label={name}
											>{#each categories.filter((c) => c.group === group) as category (category.id)}<option
													value={category.id}>{category.name}</option
												>{/each}</optgroup
										>{/each}</select
								></label
							><label class="check-label"
								><input
									type="checkbox"
									checked={remember.includes(line.id)}
									onchange={(event) =>
										(remember = event.currentTarget.checked
											? [...remember, line.id]
											: remember.filter((id) => id !== line.id))}
								/>Husk kategori for samme vare i denne butikken</label
							>
							<div class="field-row">
								<label
									>Mengde<input
										type="number"
										min="0.001"
										step="any"
										value={line.quantity ?? ''}
										onchange={(event) =>
											(line.quantity =
												event.currentTarget.value === ''
													? null
													: Number(event.currentTarget.value))}
									/></label
								><label
									>Enhet<select bind:value={line.unit}
										><option value={null}>Ukjent</option><option value="stk">stk</option><option
											value="kg">kg</option
										><option value="l">l</option></select
									></label
								>
							</div>
							<label
								>Enhetspris (kr)<input
									inputmode="decimal"
									value={moneyInput(line.unitPriceOre)}
									onchange={(event) => setAmount(line, 'unitPriceOre', event)}
								/></label
							>
							<div class="field-row">
								<label
									>Pakkestørrelse<input
										type="number"
										min="0.001"
										step="any"
										value={line.packageSize ?? ''}
										onchange={(event) =>
											(line.packageSize =
												event.currentTarget.value === ''
													? null
													: Number(event.currentTarget.value))}
									/></label
								><label
									>Pakkeenhet<select bind:value={line.packageUnit}
										><option value={null}>Ukjent</option
										>{#each ['g', 'kg', 'ml', 'l', 'stk'] as unit (unit)}<option value={unit}
												>{unit}</option
											>{/each}</select
									></label
								>
							</div>
							<label>Merke<input bind:value={line.brand} /></label><label
								>Etiketter (kommadelt)<input
									value={line.tags.join(', ')}
									placeholder="Jobblunsj, felles, personlig"
									onchange={(event) =>
										(line.tags = event.currentTarget.value
											.split(',')
											.map((tag) => tag.trim())
											.filter(Boolean))}
								/></label
							>
						{:else if line.kind === 'item_discount'}<label
								>Rabatten gjelder<select bind:value={line.relatedLineId}
									><option value={null}>Uavklart</option
									>{#each data.lines.filter((item) => item.kind === 'product') as product (product.id)}<option
											value={product.id}>{product.name}</option
										>{/each}</select
								></label
							>{/if}
						{#if line.issues.length}<div class="notice warning">
								<div>
									{#each line.issues as issue, i (i)}<p>{issue}</p>{/each}<button
										class="text-button"
										onclick={() => (line.issues = [])}>Linjen er kontrollert</button
									>
								</div>
							</div>{/if}
						<button class="text-button danger" onclick={() => data!.lines.splice(index, 1)}
							><Trash2 size={15} />Fjern linje</button
						>
					</div>
				</details>{/each}
			<button class="secondary wide" onclick={() => data!.lines.push(emptyLine())}
				><Plus size={18} />Legg til manglende linje</button
			>
			<div class="panel reconciliation">
				<h2>Stemmer beløpene?</h2>
				<dl>
					<div>
						<dt>Varer før rabatt</dt>
						<dd>{formatMoney(totals.products)}</dd>
					</div>
					<div>
						<dt>Rabatter</dt>
						<dd>{formatMoney(totals.discounts)}</dd>
					</div>
					<div>
						<dt>Pant og pantretur</dt>
						<dd>{formatMoney(totals.deposits + totals.returns)}</dd>
					</div>
					<div>
						<dt>Andre justeringer</dt>
						<dd>{formatMoney(totals.adjustments)}</dd>
					</div>
					<div class="total-row">
						<dt>Beregnet</dt>
						<dd>{formatMoney(totals.calculated)}</dd>
					</div>
					<div>
						<dt>Betalt</dt>
						<dd>{formatMoney(data.totalOre)}</dd>
					</div>
				</dl>
				{#if totals.issues.length}<div class="notice warning">
						<div>
							{#each totals.issues as issue, index (index)}<p>{issue}</p>{/each}
						</div>
					</div>{:else}<p class="success-text"><Check size={17} />Beløpene stemmer</p>{/if}
				<p class="footnote">
					MVA og gjentatte sparesummer telles ikke på nytt. Foreløpig til du har kontrollert
					kvitteringen.
				</p>
			</div>
			{#if error}<p class="error" role="alert">{error}</p>{/if}{#if message}<p
					class="success-text"
					role="status"
				>
					{message}
				</p>{/if}
			<div class="review-actions">
				<button
					class="secondary"
					onclick={() => save(false)}
					disabled={busy || invalidMoney.length > 0}>Lagre endringer</button
				><button
					class="primary"
					onclick={() => save(true)}
					disabled={busy || invalidMoney.length > 0 || totals.issues.length > 0}
					><Check size={18} />Marker kontrollert</button
				>
			</div>
		{:else}<div class="panel">
				<h2>
					{['processing', 'uploaded'].includes(detail.data?.receipt.status ?? initial.status)
						? 'Kvitteringen behandles'
						: 'Ingen resultater ennå'}
				</h2>
				<p>Du kan gå tilbake. Resultatet kommer i innboksen.</p>
				{#if detail.data?.receipt.data}<button class="primary" onclick={reload}
						>Vis resultatet</button
					>{/if}
			</div>{/if}
		<details class="panel extraction-details">
			<summary>Original uttrekking og behandlingsinfo</summary>
			<p class="footnote">{detail.data?.receipt.provider ?? initial.provider}</p>
			{#each detail.data?.extractions ?? [] as extraction (extraction._id)}<h3>
					Uttrekking {extraction.generation}
				</h3>
				<pre>{JSON.stringify(extraction.data, null, 2)}</pre>{/each}
			<p class="footnote">
				Ved ny behandling beholdes manuelle endringer. Ny uttrekking lagres her til sammenligning.
			</p>
		</details>
		<button
			class="text-button"
			onclick={retry}
			disabled={busy ||
				['processing', 'uploaded', 'uploading'].includes(
					detail.data?.receipt.status ?? initial.status
				)}><RotateCcw size={15} />Les bildene på nytt</button
		>
	</section>
</div>
