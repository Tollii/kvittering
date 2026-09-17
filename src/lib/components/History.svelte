<script lang="ts">
	import { Input } from '#lib/components/ui/input/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import PriceChart from './PriceChart.svelte';
	import * as Tabs from '#lib/components/ui/tabs/index.js';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Search, ArrowLeft, ChevronRight } from '@lucide/svelte';
	import { productHistory, productPrices, matchLabel, type Receipt } from '#lib/domain/insights.js';
	import { formatMoney } from '#lib/domain/receipt.js';
	import ReceiptCard from './ReceiptCard.svelte';
	let { receipts, onopen }: { receipts: Receipt[]; onopen: (receipt: Receipt) => void } = $props();
	let search = $state('');
	let tab = $state<'receipts' | 'products'>('receipts');
	let selectedKey = $state<string | null>(null);
	const filtered = $derived(
		receipts.filter((receipt) =>
			[
				receipt.data?.store,
				receipt.data?.purchaseDate,
				...(receipt.data?.lines.flatMap((line) => [line.name, line.originalText, ...line.tags]) ??
					[])
			]
				.join(' ')
				.toLocaleLowerCase('nb-NO')
				.includes(search.toLocaleLowerCase('nb-NO'))
		)
	);
	const products = $derived(
		productHistory(receipts).filter((product) =>
			product.name.toLocaleLowerCase('nb-NO').includes(search.toLocaleLowerCase('nb-NO'))
		)
	);
	const selected = $derived(products.find((product) => product.key === selectedKey));
	const prices = $derived(selected ? productPrices(selected.contributions) : null);
</script>

<div class="page-heading">
	<div class="section-eyebrow">DET DERE HAR HANDLET</div>
	<h1>Historikk</h1>
	<p class="muted">Finn igjen en kvittering, en vare eller en pris.</p>
</div>
<label class="search-field"
	><Search size={19} /><Input
		aria-label="Søk i historikk"
		placeholder="Søk etter butikk, vare eller etikett"
		bind:value={search}
	/></label
>
<div class="section-header">
	<Tabs.Root bind:value={tab}
		><Tabs.List
			><Tabs.Trigger value="receipts" onclick={() => (selectedKey = null)}
				>Kvitteringer</Tabs.Trigger
			><Tabs.Trigger value="products">Varer</Tabs.Trigger></Tabs.List
		></Tabs.Root
	>
	<span class="muted small">{tab === 'receipts' ? filtered.length : products.length} treff</span>
</div>
{#if selected && tab === 'products'}
	<section class="panel">
		<Button variant="ghost" class="text-button" onclick={() => (selectedKey = null)}
			><ArrowLeft size={16} />Alle varer</Button
		>
		<h2>{selected.name}</h2>
		<p>{selected.purchases.size} kjøp · {formatMoney(selected.amountOre)} til sammen</p>
		<p class="footnote">
			{selected.linked
				? 'Prisene gjelder samme koblede produkt fra denne butikken.'
				: 'Varen er ikke bekreftet som en match. Den vises separat.'}
		</p>
		{#if prices && prices.observations.length}
			<h3>Beløp per kjøp</h3>
			<p class="footnote">
				Rabatter på varen er trukket fra. Typisk er medianen av kjøpssummene. Ufordelte
				kvitteringsrabatter inngår ikke.
			</p>
			<div class="grid grid-cols-3 gap-3 my-5">
				{#each [{ label: 'Siste', value: prices.latest }, { label: 'Typisk', value: prices.typical }, { label: 'Laveste', value: prices.lowest }] as metric (metric.label)}<div
					>
						<p class="text-xs text-muted-foreground">{metric.label}</p>
						<strong class="text-base tabular-nums">{formatMoney(metric.value)}</strong>
					</div>{/each}
			</div>
			<PriceChart {prices} {onopen} />
			{#if prices.omitted}<p class="footnote">
					{prices.omitted} kjøp uten dato eller positivt beløp er utelatt fra diagrammet.
				</p>{/if}
		{/if}

		{#each [...selected.contributions].sort( (a, b) => (a.receipt.data?.purchaseDate ?? '').localeCompare(b.receipt.data?.purchaseDate ?? '') ) as contribution, index (index)}<Button
				variant="ghost"
				class="contribution-row"
				onclick={() => onopen(contribution.receipt)}
				><span
					><strong>{contribution.receipt.data?.purchaseDate ?? 'Dato ukjent'}</strong
					>{#if contribution.line}<Badge variant="secondary">{matchLabel(contribution.line)}</Badge
						>{/if}<small
						>{contribution.receipt.data?.store} · {contribution.receipt.status === 'reviewed'
							? 'Kontrollert'
							: 'Foreløpig'}</small
					></span
				><strong>{formatMoney(contribution.amountOre)}</strong><ChevronRight size={16} /></Button
			>{/each}
	</section>
{:else if tab === 'products'}
	<div class="panel">
		{#each products as product (product.key)}<Button
				variant="ghost"
				class="contribution-row"
				onclick={() => (selectedKey = product.key)}
				><span
					><strong>{product.name || 'Ukjent vare'}</strong><small
						>{product.purchases.size} kjøp · {product.linked
							? 'Koblet produkt'
							: 'Enkeltvare, ikke slått sammen'}</small
					></span
				><strong>{formatMoney(product.amountOre)}</strong><ChevronRight size={16} /></Button
			>{:else}<div class="empty-state">
				<Search size={28} />
				<h3>Ingen varer funnet</h3>
				<p>Prøv et annet søk, eller legg til en kvittering.</p>
			</div>{/each}
	</div>
{:else}<div class="receipt-list">
		{#each filtered as receipt (receipt._id)}<ReceiptCard {receipt} {onopen} />{:else}<div
				class="empty-state"
			>
				<Search size={28} />
				<h3>Ingen kvitteringer funnet</h3>
				<p>De lagrede kvitteringene kommer hit.</p>
			</div>{/each}
	</div>{/if}
