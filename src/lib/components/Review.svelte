<script lang="ts">
	import * as NativeSelect from '#lib/components/ui/native-select/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	let showSummaryLines = $state(false);
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
	import ProductSelector from './ProductSelector.svelte';
	import type { Id } from '../../../convex/_generated/dataModel';
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
	let productChanges = $state<Record<string, string>>({});
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
	function setAmount(line: ReceiptLine, field: 'amountOre', event: Event) {
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
				productChanges: Object.entries(productChanges)
					.filter(([, value]) => value)
					.map(([lineId, value]) => ({
						lineId,
						productId: value === 'new' || value === 'separate' ? null : (value as Id<'products'>),
						createNew: value === 'new'
					})),
				duplicateResolved,
				excluded
			});
			const saved = await client.query(api.receipts.detail, { id: initial._id });
			data = saved.receipt.data;
			revision = saved.receipt.revision;
			productChanges = {};
			remember = [];
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
			productChanges = {};
		}
	}
</script>

<Button variant="ghost" class="text-button back-button" onclick={onclose}
	><ArrowLeft size={17} />Tilbake</Button
>
<div class="page-heading">
	<div class="section-eyebrow">KONTROLLER KVITTERING</div>
	<h1>{data?.store ?? 'Ny kvittering'}</h1>
	<p class="muted">Lastet opp av {initial.uploaderName}. Dette angir ikke hvem som betalte.</p>
</div>
{#if detail.data?.receipt.revision !== undefined && detail.data.receipt.revision !== revision}<div
		class="notice warning"
	>
		Kvitteringen har nye endringer.<Button variant="ghost" class="text-button" onclick={reload}
			>Hent siste versjon</Button
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
			<details class="panel">
				<summary>Butikk, dato og betalingsdetaljer</summary>
				<div class="receipt-fields">
					<label>Butikk<Input bind:value={data.store} /></label><label
						>Avdeling / sted<Input bind:value={data.branch} /></label
					>
					<div class="field-row">
						<label>Kjøpsdato<Input type="date" bind:value={data.purchaseDate} /></label><label
							>Klokkeslett<Input type="time" bind:value={data.purchaseTime} /></label
						>
					</div>
					<div class="field-row">
						<label
							>Betalt (kr)<Input
								inputmode="decimal"
								value={moneyInput(data.totalOre)}
								onchange={setTotal}
							/></label
						><label>Valuta<Input bind:value={data.currency} /></label>
					</div>
					<label>Kvitteringsnummer<Input bind:value={data.receiptNumber} /></label>
				</div>
			</details>
			{#if data.issues.length}<div class="notice warning">
					<div>
						<strong>Uklare felt</strong>{#each data.issues as issue, index (index)}<p>
								{issue}
							</p>{/each}<Button
							variant="ghost"
							class="text-button"
							onclick={() => (data!.issues = [])}>Feltene er kontrollert</Button
						>
					</div>
				</div>{/if}
			<div class="section-header">
				<h2>Varer og beløp</h2>
				<span class="muted small"
					>{data.lines.filter((line) => !['summary', 'vat'].includes(line.kind)).length} vare- og beløpslinjer</span
				>
			</div>
			<label class="check-label"
				><input type="checkbox" bind:checked={showSummaryLines} /> Vis også betalings- og avgiftssammendrag</label
			>
			{#each data.lines.filter((line) => showSummaryLines || !['summary', 'vat'].includes(line.kind) || line.issues.length > 0) as line (line.id)}<details
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
						<label>Navn<Input bind:value={line.name} /></label>
						<div class="field-row">
							<label
								>Linjetype<NativeSelect.Root
									bind:value={line.kind}
									onchange={() => {
										line.categoryId = line.kind === 'product' ? 'fallback.unclear' : null;
									}}
									>{#each lineKinds as kind (kind)}<option value={kind}>{labels[kind]}</option
										>{/each}</NativeSelect.Root
								></label
							><label
								>Linjesum (kr)<Input
									inputmode="decimal"
									value={moneyInput(line.amountOre)}
									onchange={(event) => setAmount(line, 'amountOre', event)}
								/></label
							>
						</div>
						{#if line.kind === 'product'}
							<ProductSelector
								receiptId={initial._id}
								retailer={data.store ?? ''}
								{line}
								value={productChanges[line.id] ?? ''}
								onchange={(value) => {
									productChanges[line.id] = value;
								}}
							/>
							<label
								>Kategori<NativeSelect.Root bind:value={line.categoryId}
									>{#each categoryGroups as [group, name] (group)}<optgroup label={name}
											>{#each categories.filter((c) => c.group === group) as category (category.id)}<option
													value={category.id}>{category.name}</option
												>{/each}</optgroup
										>{/each}</NativeSelect.Root
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
							<details open={line.issues.length > 0}>
								<summary>Andre detaljer</summary>
								<div class="grid gap-4">
									<label>Merke<Input bind:value={line.brand} /></label><label
										>Etiketter (kommadelt)<Input
											value={line.tags.join(', ')}
											placeholder="Jobblunsj, felles, personlig"
											onchange={(event) =>
												(line.tags = event.currentTarget.value
													.split(',')
													.map((tag) => tag.trim())
													.filter(Boolean))}
										/></label
									>
								</div>
							</details>{:else if line.kind === 'item_discount'}<label
								>Rabatten gjelder<NativeSelect.Root bind:value={line.relatedLineId}
									><option value={null}>Uavklart</option
									>{#each data.lines.filter((item) => item.kind === 'product') as product (product.id)}<option
											value={product.id}>{product.name}</option
										>{/each}</NativeSelect.Root
								></label
							>{/if}
						{#if line.issues.length}<div class="notice warning">
								<div>
									{#each line.issues as issue, i (i)}<p>{issue}</p>{/each}<Button
										variant="ghost"
										class="text-button"
										onclick={() => (line.issues = [])}>Linjen er kontrollert</Button
									>
								</div>
							</div>{/if}
						<Button
							variant="ghost"
							class="text-button danger"
							onclick={() =>
								data!.lines.splice(
									data!.lines.findIndex((item) => item.id === line.id),
									1
								)}><Trash2 size={15} />Fjern linje</Button
						>
					</div>
				</details>{/each}
			<Button variant="outline" class="secondary wide" onclick={() => data!.lines.push(emptyLine())}
				><Plus size={18} />Legg til manglende linje</Button
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
				<Button
					variant="outline"
					class="secondary"
					onclick={() => save(false)}
					disabled={busy || invalidMoney.length > 0}>Lagre endringer</Button
				><Button
					variant="default"
					class="primary"
					onclick={() => save(true)}
					disabled={busy || invalidMoney.length > 0 || totals.issues.length > 0}
					><Check size={18} />Marker kontrollert</Button
				>
			</div>
		{:else}<div class="panel">
				<h2>
					{['processing', 'uploaded'].includes(detail.data?.receipt.status ?? initial.status)
						? 'Kvitteringen behandles'
						: 'Ingen resultater ennå'}
				</h2>
				<p>Du kan gå tilbake. Resultatet kommer i innboksen.</p>
				{#if detail.data?.receipt.data}<Button variant="default" class="primary" onclick={reload}
						>Vis resultatet</Button
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
		<Button
			variant="ghost"
			class="text-button"
			onclick={retry}
			disabled={busy ||
				['processing', 'uploaded', 'uploading'].includes(
					detail.data?.receipt.status ?? initial.status
				)}><RotateCcw size={15} />Les bildene på nytt</Button
		>
	</section>
</div>
