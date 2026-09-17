<script lang="ts">
	import { useQuery } from 'convex-svelte';
	import { api } from '../../../convex/_generated/api';
	import type { Id } from '../../../convex/_generated/dataModel';
	import type { ReceiptLine } from '#lib/domain/receipt.js';
	let {
		receiptId,
		retailer,
		line,
		value,
		onchange
	}: {
		receiptId: Id<'receipts'>;
		retailer: string;
		line: ReceiptLine;
		value: string;
		onchange: (value: string) => void;
	} = $props();
	let search = $state('');
	const products = useQuery(api.products.search, () => ({ receiptId, retailer, search }));
</script>

<div class="panel">
	<label
		>Søk etter lagret produkt<input
			bind:value={search}
			placeholder="Varenavn, smak eller størrelse"
		/></label
	>
	<label
		>Koblet produkt<select
			aria-label="Koblet produkt"
			{value}
			onchange={(event) => onchange(event.currentTarget.value)}
		>
			<option value=""
				>{line.productId ? line.productName || line.name : 'Ingen sikker produktkobling'}</option
			>
			<option value="new">Opprett et eget produkt fra denne varen</option>
			<option value="separate">Hold varen separat</option>
			{#each products.data ?? [] as product (product._id)}<option value={product._id}
					>{product.name}{product.packageSize !== null
						? ` · ${product.packageSize} ${product.packageUnit ?? ''}`
						: ''}</option
				>{/each}
		</select></label
	>
	<p class="footnote">
		Koblingen lagres med «Lagre endringer» og huskes for samme kvitteringsnavn i denne butikken.
		Smak, størrelse og zero skal stemme. Søk for å finne eldre produkter.
	</p>
	{#if products.error}<p class="error">Kunne ikke hente produkter. Prøv igjen.</p>{/if}
</div>
