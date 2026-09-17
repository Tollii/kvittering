<script lang="ts">
	import { Search, ArrowLeft, ChevronRight } from '@lucide/svelte';
	import { productHistory, comparableUnitPrice, type Receipt } from '#lib/domain/insights.js';
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
</script>

<div class="page-heading">
	<div class="section-eyebrow">DET DERE HAR HANDLET</div>
	<h1>Alt på ett sted.</h1>
	<p class="muted">Finn igjen en kvittering, en vare eller en pris.</p>
</div>
<label class="search-field"
	><Search size={19} /><input
		aria-label="Søk i historikk"
		placeholder="Søk etter butikk, vare eller etikett"
		bind:value={search}
	/></label
>
<div class="section-header">
	<div class="segmented">
		<button
			class:active={tab === 'receipts'}
			onclick={() => {
				tab = 'receipts';
				selectedKey = null;
			}}>Kvitteringer</button
		><button class:active={tab === 'products'} onclick={() => (tab = 'products')}>Varer</button>
	</div>
	<span class="muted small">{tab === 'receipts' ? filtered.length : products.length} treff</span>
</div>
{#if selected && tab === 'products'}
	<section class="panel">
		<button class="text-button" onclick={() => (selectedKey = null)}
			><ArrowLeft size={16} />Alle varer</button
		>
		<h2>{selected.name}</h2>
		<p>{selected.purchases.size} kjøp · {formatMoney(selected.amountOre)} til sammen</p>
		<p class="footnote">
			{selected.confirmed
				? 'Prisene gjelder en bekreftet vare fra samme butikk.'
				: 'Varen er ikke bekreftet som en match. Den vises separat.'} Enhetspriser vises bare når mengde
			og størrelse er oppgitt.
		</p>
		{#each [...selected.contributions].sort( (a, b) => (a.receipt.data?.purchaseDate ?? '').localeCompare(b.receipt.data?.purchaseDate ?? '') ) as contribution, index (index)}{@const unit =
				contribution.line
					? comparableUnitPrice(contribution.line, contribution.amountOre)
					: null}<button class="contribution-row" onclick={() => onopen(contribution.receipt)}
				><span
					><strong>{contribution.receipt.data?.purchaseDate ?? 'Dato ukjent'}</strong><small
						>{contribution.receipt.data?.store} · {contribution.receipt.status === 'reviewed'
							? 'Kontrollert'
							: 'Foreløpig'}</small
					>{#if unit}<small>{formatMoney(unit.ore)} / {unit.unit}</small>{/if}</span
				><strong>{formatMoney(contribution.amountOre)}</strong><ChevronRight size={16} /></button
			>{/each}
	</section>
{:else if tab === 'products'}
	<div class="panel">
		{#each products as product (product.key)}<button
				class="contribution-row"
				onclick={() => (selectedKey = product.key)}
				><span
					><strong>{product.name || 'Ukjent vare'}</strong><small
						>{product.purchases.size} kjøp · {product.confirmed
							? 'Bekreftet match'
							: 'Enkeltvare, ikke slått sammen'}</small
					></span
				><strong>{formatMoney(product.amountOre)}</strong><ChevronRight size={16} /></button
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
