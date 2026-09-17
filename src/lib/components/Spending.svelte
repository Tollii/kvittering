<script lang="ts">
	import * as Card from '#lib/components/ui/card/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Sheet from '#lib/components/ui/sheet/index.js';
	import * as Tabs from '#lib/components/ui/tabs/index.js';
	import SpendingChart from './SpendingChart.svelte';
	import SpendingCalendar from './SpendingCalendar.svelte';
	import {
		ChevronLeft,
		ChevronRight,
		ArrowUpRight,
		ArrowDownRight,
		ArrowLeft,
		ShoppingBasket,
		ReceiptText
	} from '@lucide/svelte';
	import {
		comparisonInsights,
		receiptCoverage,
		type Receipt,
		type SpendingGroup,
		type Contribution
	} from '#lib/domain/insights.js';
	import { formatMoney, osloDate } from '#lib/domain/receipt.js';
	import { categoryById } from '#lib/domain/categories.js';
	let { receipts, onopen }: { receipts: Receipt[]; onopen: (receipt: Receipt) => void } = $props();
	let month = $state(osloDate().slice(0, 7));
	let reviewedOnly = $state(false);
	let breakdown = $state<'category' | 'store' | 'type'>('category');
	let selected = $state<SpendingGroup | null>(null);
	let group = $state<string | null>(null);
	const comparison = $derived(comparisonInsights(receipts, month, reviewedOnly));
	const totals = $derived(comparison.current);
	const previous = $derived(comparison.previous);
	const coverage = $derived(receiptCoverage(receipts));
	const proteins = $derived(
		['poultry', 'pork', 'lamb', 'beef', 'fish'].map(
			(id) =>
				totals.categories.find((c) => c.id === `meat-fish.${id}`) ?? {
					id: `meat-fish.${id}`,
					name: categoryById.get(`meat-fish.${id}`)?.name ?? id,
					amountOre: 0,
					contributions: []
				}
		)
	);
	let sheetOpen = $state(false);
	const change = $derived(
		previous.products === 0
			? null
			: Math.round(((totals.products - previous.products) / Math.abs(previous.products)) * 100)
	);
	const rows = $derived(
		breakdown === 'type'
			? totals.purchaseTypes
			: breakdown === 'store'
				? totals.stores
				: group
					? totals.categories.filter(
							(c) =>
								categoryById.get(c.id)?.group === group ||
								(group === 'fallback' && c.id === 'unallocated')
						)
					: totals.groups
	);
	const monthLabel = $derived(
		new Intl.DateTimeFormat('nb-NO', {
			month: 'long',
			year: 'numeric',
			timeZone: 'Europe/Oslo'
		}).format(new Date(month + '-01T12:00:00Z'))
	);
	function periodLabel(end: string) {
		return `1.–${new Intl.DateTimeFormat('nb-NO', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/Oslo' }).format(new Date(end + 'T12:00:00Z'))}`;
	}
	function moveMonth(offset: number) {
		const [year, value] = month.split('-').map(Number);
		month = new Date(Date.UTC(year, value - 1 + offset, 1)).toISOString().slice(0, 7);
		selected = null;
		group = null;
	}
	function selectTotal(name: string, amountOre: number, contributions: Contribution[]) {
		selected = { id: name, name, amountOre, contributions };
		sheetOpen = true;
	}
	const accounting = $derived(
		totals.selected.flatMap((receipt) =>
			receipt.data!.lines.map((line) => ({ receipt, line, amountOre: line.amountOre ?? 0 }))
		)
	);
</script>

<div class="page-heading">
	<div>
		<div class="section-eyebrow">HUSSTANDENS FORBRUK</div>
		<h1>Forbruk</h1>
		<p class="muted">Se hvor dagligvarepengene går.</p>
	</div>
</div>
<div class="month-control">
	<Button
		variant="ghost"
		class="icon-button"
		aria-label="Forrige måned"
		onclick={() => moveMonth(-1)}><ChevronLeft size={19} /></Button
	><strong>{monthLabel}</strong><Button
		variant="ghost"
		class="icon-button"
		aria-label="Neste måned"
		onclick={() => moveMonth(1)}><ChevronRight size={19} /></Button
	>
</div>
<label class="check-label"
	><input type="checkbox" bind:checked={reviewedOnly} /> Bare kontrollerte kvitteringer</label
>
<div class="spending-hero">
	<span>Registrert vareforbruk, uten pant</span><strong>{formatMoney(totals.products)}</strong>
	<div class="comparison">
		{#if change !== null}{#if change > 0}<ArrowUpRight size={16} />{:else}<ArrowDownRight
					size={16}
				/>{/if}{Math.abs(change)} % {change > 0 ? 'mer' : 'mindre'} i sammenligningsperioden{:else}Ingen
			sammenligning for forrige måned{/if}
	</div>
	<p class="text-sm opacity-80">
		{periodLabel(comparison.currentEnd)} mot {periodLabel(comparison.previousEnd)}. {comparison.partial
			? 'Samme del av måneden.'
			: 'Hele måneder.'}
	</p>
	<div class="hero-footer">
		<span>{totals.selected.length} kvitteringer</span><span
			>{totals.provisional ? `${totals.provisional} foreløpige` : 'Alle kontrollert'}</span
		>
	</div>
</div>
<Card.Root class="panel gap-0">
	<div class="section-header">
		<h2>Kjøtt og fisk</h2>
		<span class="muted small">Registrerte kjøp</span>
	</div>
	<SpendingChart
		rows={proteins}
		onselect={(row) => {
			selected = row;
			sheetOpen = true;
		}}
	/>
	<p class="footnote">Råvarer i kjøtt og fisk. Pålegg og ferdigretter har egne kategorier.</p>
</Card.Root>
<SpendingCalendar
	{receipts}
	year={Number(month.slice(0, 4))}
	{reviewedOnly}
	onselect={(day) => {
		selected = day;
		sheetOpen = true;
	}}
/>
{#if coverage.pending.length || coverage.unlinkedCount}<section class="panel">
		<h2>Datagrunnlag</h2>
		<p class="footnote">Status for alle registrerte kvitteringer, uavhengig av måned.</p>
		<Button
			variant="ghost"
			class="contribution-row"
			onclick={() =>
				selectTotal(
					'Kvitteringer til kontroll',
					0,
					coverage.pending.map((receipt) => ({
						receipt,
						line: null,
						amountOre: receipt.data?.totalOre ?? 0
					}))
				)}
			><span>{coverage.pending.length} kvitteringer til kontroll</span><ChevronRight
				size={16}
			/></Button
		>
		<Button
			variant="ghost"
			class="contribution-row"
			onclick={() =>
				selectTotal(
					'Varer uten produktkobling',
					0,
					coverage.unlinked.map((receipt) => ({
						receipt,
						line: null,
						amountOre: receipt.data?.totalOre ?? 0
					}))
				)}
			><span>{coverage.unlinkedCount} varer uten produktkobling</span><ChevronRight
				size={16}
			/></Button
		>
	</section>{/if}
{#if previous.selected.length && comparison.changes.length}<section class="panel">
		<h2>Største endringer</h2>
		<p class="footnote">
			Endring i registrert forbruk mellom periodene. Dette kan skyldes både antall kjøp og priser.
		</p>
		{#each comparison.changes.slice(0, 3) as item (item.id)}<Button
				variant="ghost"
				class="contribution-row"
				onclick={() => selectTotal(item.name, item.current, item.currentContributions)}
				><span
					><strong>{item.name}</strong><small
						>{formatMoney(item.previous)} → {formatMoney(item.current)}</small
					></span
				><strong>{item.difference > 0 ? '+' : ''}{formatMoney(item.difference)}</strong
				><ChevronRight size={16} /></Button
			>{/each}
		<Button
			variant="ghost"
			class="text-button"
			onclick={() =>
				selectTotal(
					'Forrige periode',
					previous.products,
					comparison.changes.flatMap((c) => c.previousContributions)
				)}>Se kjøp i forrige periode</Button
		>
	</section>{/if}
<div class="metric-grid">
	<Button
		variant="ghost"
		class="metric"
		onclick={() =>
			selectTotal(
				'Betalt',
				totals.paid,
				totals.selected.map((receipt) => ({
					receipt,
					line: null,
					amountOre: receipt.data?.totalOre ?? 0
				}))
			)}
		><span>Betalt</span><strong>{formatMoney(totals.paid)}</strong><small
			>Inkludert pant <ChevronRight size={12} /></small
		></Button
	>
	<Button
		variant="ghost"
		class="metric"
		onclick={() =>
			selectTotal(
				'Registrerte rabatter',
				totals.discounts,
				accounting.filter(
					(c) => c.line?.kind === 'item_discount' || c.line?.kind === 'receipt_discount'
				)
			)}
		><span>Registrerte rabatter</span><strong>{formatMoney(totals.discounts)}</strong><small
			>Allerede trukket fra <ChevronRight size={12} /></small
		></Button
	>
	<Button
		variant="ghost"
		class="metric"
		onclick={() =>
			selectTotal(
				'Pant betalt',
				totals.deposits,
				accounting.filter((c) => c.line?.kind === 'deposit')
			)}
		><span>Pant betalt</span><strong>{formatMoney(totals.deposits)}</strong><small
			>Holdes utenfor varer <ChevronRight size={12} /></small
		></Button
	>
	<Button
		variant="ghost"
		class="metric"
		onclick={() =>
			selectTotal(
				'Pant returnert',
				totals.returns,
				accounting.filter((c) => c.line?.kind === 'deposit_return')
			)}
		><span>Pant returnert</span><strong>{formatMoney(totals.returns)}</strong><small
			>Tilbakebetalt <ChevronRight size={12} /></small
		></Button
	>
</div>
{#if totals.unconverted.length}<div class="notice warning">
		<div>
			<strong>{totals.unconverted.length} kvittering(er) har ukjent eller annen valuta</strong>
			<p>Disse er utenfor NOK-summene. Kontroller valutaen på kvitteringen.</p>
			{#each totals.unconverted as receipt (receipt._id)}<Button
					variant="ghost"
					class="text-button"
					onclick={() => onopen(receipt)}
					>{receipt.data?.store ?? 'Ukjent butikk'} · Åpne kvittering</Button
				>{/each}
		</div>
	</div>{/if}
{#if totals.unknownTotals}<p class="notice warning">
		{totals.unknownTotals} kvittering(er) mangler betalt beløp. Summen er ufullstendig.
	</p>{/if}
{#if totals.undated.length}<div class="notice warning">
		<div>
			<strong>{totals.undated.length} kvittering(er) mangler dato</strong>
			<p>Disse er utenfor månedsoversikten.</p>
			{#each totals.undated as receipt (receipt._id)}<Button
					variant="ghost"
					class="text-button"
					onclick={() => onopen(receipt)}
					>{receipt.data?.store ?? 'Ukjent butikk'} · Åpne kvittering</Button
				>{/each}
		</div>
	</div>{/if}
{#if totals.unknownAmounts}<p class="notice warning">
		{totals.unknownAmounts} linje(r) mangler beløp. Vareforbruket er ufullstendig.
	</p>{/if}
{#if totals.suspectedDuplicates.length}<div class="notice warning">
		<div>
			<strong
				>{totals.suspectedDuplicates.length} mulig(e) duplikat(er) er med i foreløpige summer.</strong
			>{#each totals.suspectedDuplicates as receipt (receipt._id)}<Button
					variant="ghost"
					class="text-button"
					onclick={() => onopen(receipt)}>Kontroller {receipt.data?.store ?? 'kvittering'}</Button
				>{/each}
		</div>
	</div>{/if}
{#if totals.discrepancies.length}<div class="notice warning">
		<div>
			<strong
				>Varer og betalt beløp stemmer ikke på {totals.discrepancies.length} kvittering(er).</strong
			>{#each totals.discrepancies as receipt (receipt._id)}<Button
					variant="ghost"
					class="text-button"
					onclick={() => onopen(receipt)}>Kontroller {receipt.data?.store ?? 'kvittering'}</Button
				>{/each}
		</div>
	</div>{/if}
<section class="panel breakdown">
	<div class="section-header">
		<h2>{group ? totals.groups.find((row) => row.id === group)?.name : 'Fordeling'}</h2>
		<Tabs.Root bind:value={breakdown}>
			<Tabs.List
				><Tabs.Trigger value="type" onclick={() => (group = null)}>Varetype</Tabs.Trigger
				><Tabs.Trigger value="category" onclick={() => (group = null)}>Kategori</Tabs.Trigger
				><Tabs.Trigger value="store" onclick={() => (group = null)}>Butikk</Tabs.Trigger></Tabs.List
			>
		</Tabs.Root>
	</div>
	{#if group}<Button variant="ghost" class="text-button" onclick={() => (group = null)}
			><ArrowLeft size={15} />Alle kategorier</Button
		>{/if}
	<SpendingChart
		{rows}
		onselect={(row) => {
			if (breakdown === 'category' && !group) group = row.id;
			else {
				selected = row;
				sheetOpen = true;
			}
		}}
	/>
	{#if !rows.length}<div class="empty-state">
			<ShoppingBasket size={30} />
			<h3>Ingen registrerte kjøp</h3>
			<p>Legg til en kvittering for å se forbruket.</p>
		</div>{/if}
	<p class="footnote">
		Trykk på en kategori eller butikk for å se varene. Uavklart forbruk er alltid med. Foreløpige
		verdier kan endres ved kontroll.
	</p>
</section>
<Sheet.Root bind:open={sheetOpen}
	><Sheet.Content
		side="bottom"
		class="mx-auto max-h-[85dvh] max-w-2xl overflow-y-auto rounded-t-2xl p-6"
	>
		{#if selected}<Sheet.Header
				><Sheet.Title>{selected.name}</Sheet.Title><Sheet.Description
					>Varer og kvitteringer som inngår i oversikten.</Sheet.Description
				></Sheet.Header
			>
			<section class="contribution-panel">
				{#each selected.contributions as contribution, index (`${contribution.receipt._id}-${index}`)}<Button
						variant="ghost"
						class="contribution-row"
						onclick={() => {
							sheetOpen = false;
							onopen(contribution.receipt);
						}}
						><ReceiptText size={17} /><span
							><strong
								>{contribution.line?.name ??
									contribution.receipt.data?.store ??
									'Kvittering'}</strong
							><small
								>{contribution.receipt.data?.purchaseDate ?? 'Dato ukjent'} · {contribution.receipt
									.status === 'reviewed'
									? 'Kontrollert'
									: 'Foreløpig'}</small
							></span
						><strong
							>{contribution.line?.amountOre === null
								? 'Ukjent beløp'
								: formatMoney(contribution.amountOre)}</strong
						><ChevronRight size={16} /></Button
					>{:else}<p class="muted">Ingen linjer i denne perioden.</p>{/each}
			</section>{/if}</Sheet.Content
	></Sheet.Root
>
