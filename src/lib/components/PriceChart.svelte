<script lang="ts">
	import { formatMoney } from '#lib/domain/receipt.js';
	import { BarChart } from 'layerchart';
	import * as Chart from '#lib/components/ui/chart/index.js';
	import type { productPrices, Receipt } from '#lib/domain/insights.js';
	let {
		prices,
		onopen
	}: { prices: ReturnType<typeof productPrices>; onopen: (receipt: Receipt) => void } = $props();
	const data = $derived(
		prices.observations.map((item, index) => ({
			label: `${index + 1}`,
			value: item.ore / 100,
			receipt: item.contribution.receipt
		}))
	);
	const config = { value: { label: 'Kroner', color: 'var(--chart-1)' } };
</script>

<Chart.Container {config} class="h-52 w-full aspect-auto">
	<BarChart
		{data}
		x="label"
		y="value"
		series={[
			{
				key: 'value',
				label: prices.unit ? `kr/${prices.unit}` : 'Beløp per kjøp',
				color: 'var(--chart-1)'
			}
		]}
		onTooltipClick={(_, detail) => onopen(detail.data.receipt)}
	>
		{#snippet tooltip()}<Chart.Tooltip
				>{#snippet formatter({ value })}<span>{formatMoney(Math.round(Number(value) * 100))}</span
					>{/snippet}</Chart.Tooltip
			>{/snippet}
	</BarChart>
</Chart.Container>
<p class="footnote">
	Kjøp i datorekkefølge, eldste først. Trykk på en søyle eller et kjøp nedenfor for å åpne
	kvitteringen.
</p>
