<script lang="ts">
	import { ChevronRight, ReceiptText, TriangleAlert, LoaderCircle, Check } from '@lucide/svelte';
	import type { Receipt } from '#lib/domain/insights.js';
	import { formatMoney } from '#lib/domain/receipt.js';
	let { receipt, onopen }: { receipt: Receipt; onopen: (receipt: Receipt) => void } = $props();
	const labels = {
		uploading: 'Laster opp',
		uploaded: 'Lastet opp',
		processing: 'Behandler',
		needs_review: 'Til kontroll',
		reviewed: 'Kontrollert',
		failed: 'Behandling feilet'
	};
	const active = $derived(['uploading', 'uploaded', 'processing'].includes(receipt.status));
	const date = $derived(
		receipt.data?.purchaseDate
			? new Intl.DateTimeFormat('nb-NO', {
					day: 'numeric',
					month: 'short',
					timeZone: 'Europe/Oslo'
				}).format(new Date(receipt.data.purchaseDate + 'T12:00:00Z'))
			: 'Dato ukjent'
	);
</script>

<button class="receipt-card" onclick={() => onopen(receipt)}>
	<span class="store-icon"><ReceiptText size={23} /></span>
	<span class="receipt-description"
		><strong>{receipt.data?.store ?? 'Ny kvittering'}</strong><span class="muted small"
			>{date} · {receipt.data?.lines.filter((l) => l.kind === 'product').length ?? '–'} varer</span
		><span class:warning={receipt.status === 'failed' || !!receipt.duplicateOf} class="status-label"
			>{#if active}<LoaderCircle
					size={12}
					class="spin"
				/>{:else if receipt.status === 'reviewed'}<Check
					size={12}
				/>{:else if receipt.status === 'failed' || receipt.duplicateOf}<TriangleAlert
					size={12}
				/>{/if}{receipt.excluded
				? 'Utelatt fra forbruk'
				: receipt.duplicateOf && !receipt.duplicateResolved
					? 'Mulig duplikat'
					: labels[receipt.status]}</span
		></span
	>
	<span class="receipt-price"
		>{formatMoney(receipt.data?.totalOre ?? null)}<ChevronRight size={16} /></span
	>
</button>
