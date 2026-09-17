<script lang="ts">
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
		monthlyInsights,
		monthBefore,
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
	const totals = $derived(monthlyInsights(receipts, month, reviewedOnly));
	const previous = $derived(monthlyInsights(receipts, monthBefore(month), reviewedOnly));
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
	const max = $derived(Math.max(1, ...rows.map((row) => Math.abs(row.amountOre))));
	const monthLabel = $derived(
		new Intl.DateTimeFormat('nb-NO', {
			month: 'long',
			year: 'numeric',
			timeZone: 'Europe/Oslo'
		}).format(new Date(month + '-01T12:00:00Z'))
	);
	function moveMonth(offset: number) {
		const [year, value] = month.split('-').map(Number);
		month = new Date(Date.UTC(year, value - 1 + offset, 1)).toISOString().slice(0, 7);
		selected = null;
		group = null;
	}
	function selectTotal(name: string, amountOre: number, contributions: Contribution[]) {
		selected = { id: name, name, amountOre, contributions };
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
		<h1>Det lille blir til noe.</h1>
		<p class="muted">Se hvor dagligvarepengene går.</p>
	</div>
</div>
<div class="month-control">
	<button class="icon-button" aria-label="Forrige måned" onclick={() => moveMonth(-1)}
		><ChevronLeft size={19} /></button
	><strong>{monthLabel}</strong><button
		class="icon-button"
		aria-label="Neste måned"
		onclick={() => moveMonth(1)}><ChevronRight size={19} /></button
	>
</div>
<label class="check-label"
	><input type="checkbox" bind:checked={reviewedOnly} /> Bare kontrollerte kvitteringer</label
>
<div class="spending-hero">
	<span>Vareforbruk, uten pant</span><strong>{formatMoney(totals.products)}</strong>
	<div class="comparison">
		{#if change !== null}{#if change > 0}<ArrowUpRight size={16} />{:else}<ArrowDownRight
					size={16}
				/>{/if}{Math.abs(change)} % {change > 0 ? 'mer' : 'mindre'} enn forrige måned{:else}Ingen
			sammenligning for forrige måned{/if}
	</div>
	<div class="hero-footer">
		<span>{totals.selected.length} kvitteringer</span><span
			>{totals.provisional ? `${totals.provisional} foreløpige` : 'Alle kontrollert'}</span
		>
	</div>
</div>
<div class="metric-grid">
	<button
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
		></button
	>
	<button
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
		></button
	>
	<button
		class="metric"
		onclick={() =>
			selectTotal(
				'Pant betalt',
				totals.deposits,
				accounting.filter((c) => c.line?.kind === 'deposit')
			)}
		><span>Pant betalt</span><strong>{formatMoney(totals.deposits)}</strong><small
			>Holdes utenfor varer <ChevronRight size={12} /></small
		></button
	>
	<button
		class="metric"
		onclick={() =>
			selectTotal(
				'Pant returnert',
				totals.returns,
				accounting.filter((c) => c.line?.kind === 'deposit_return')
			)}
		><span>Pant returnert</span><strong>{formatMoney(totals.returns)}</strong><small
			>Tilbakebetalt <ChevronRight size={12} /></small
		></button
	>
</div>
{#if totals.unconverted.length}<div class="notice warning">
		<div>
			<strong>{totals.unconverted.length} kvittering(er) har ukjent eller annen valuta</strong>
			<p>Disse er utenfor NOK-summene. Kontroller valutaen på kvitteringen.</p>
			{#each totals.unconverted as receipt (receipt._id)}<button
					class="text-button"
					onclick={() => onopen(receipt)}
					>{receipt.data?.store ?? 'Ukjent butikk'} · Åpne kvittering</button
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
			{#each totals.undated as receipt (receipt._id)}<button
					class="text-button"
					onclick={() => onopen(receipt)}
					>{receipt.data?.store ?? 'Ukjent butikk'} · Åpne kvittering</button
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
			>{#each totals.suspectedDuplicates as receipt (receipt._id)}<button
					class="text-button"
					onclick={() => onopen(receipt)}>Kontroller {receipt.data?.store ?? 'kvittering'}</button
				>{/each}
		</div>
	</div>{/if}
{#if totals.discrepancies.length}<div class="notice warning">
		<div>
			<strong
				>Varer og betalt beløp stemmer ikke på {totals.discrepancies.length} kvittering(er).</strong
			>{#each totals.discrepancies as receipt (receipt._id)}<button
					class="text-button"
					onclick={() => onopen(receipt)}>Kontroller {receipt.data?.store ?? 'kvittering'}</button
				>{/each}
		</div>
	</div>{/if}
<section class="panel breakdown">
	<div class="section-header">
		<h2>{group ? totals.groups.find((row) => row.id === group)?.name : 'Fordeling'}</h2>
		<div class="segmented">
			<button
				class:active={breakdown === 'type'}
				onclick={() => {
					breakdown = 'type';
					group = null;
				}}>Varetype</button
			>
			<button
				class:active={breakdown === 'category'}
				onclick={() => {
					breakdown = 'category';
					group = null;
				}}>Kategori</button
			><button
				class:active={breakdown === 'store'}
				onclick={() => {
					breakdown = 'store';
					group = null;
				}}>Butikk</button
			>
		</div>
	</div>
	{#if group}<button class="text-button" onclick={() => (group = null)}
			><ArrowLeft size={15} />Alle kategorier</button
		>{/if}
	{#each rows as row (row.id)}<button
			class="breakdown-row"
			onclick={() => {
				if (breakdown === 'category' && !group) group = row.id;
				else selected = row;
			}}
			><span class="bar-label"
				><span>{row.name}</span><strong
					>{formatMoney(row.amountOre)}<ChevronRight size={14} /></strong
				></span
			><span class="bar-track"
				><span style={`width:${Math.max(1, (Math.abs(row.amountOre) / max) * 100)}%`}></span></span
			></button
		>{:else}<div class="empty-state">
			<ShoppingBasket size={30} />
			<h3>En ny måned, et blankt ark.</h3>
			<p>Forbruket vises her når den første kvitteringen er lest.</p>
		</div>{/each}
	<p class="footnote">
		Trykk på en kategori eller butikk for å se varene. Uavklart forbruk er alltid med. Foreløpige
		verdier kan endres ved kontroll.
	</p>
</section>
{#if selected}<section class="panel contribution-panel">
		<div class="section-header">
			<h2>{selected.name}</h2>
			<button class="text-button" onclick={() => (selected = null)}>Lukk</button>
		</div>
		<p class="selected-total">{formatMoney(selected.amountOre)}</p>
		{#each selected.contributions as contribution, index (`${contribution.receipt._id}-${index}`)}<button
				class="contribution-row"
				onclick={() => onopen(contribution.receipt)}
				><ReceiptText size={17} /><span
					><strong
						>{contribution.line?.name ?? contribution.receipt.data?.store ?? 'Kvittering'}</strong
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
				><ChevronRight size={16} /></button
			>{:else}<p class="muted">Ingen linjer i denne perioden.</p>{/each}
	</section>{/if}
