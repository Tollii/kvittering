<script lang="ts">
	import { Button } from '#lib/components/ui/button/index.js';
	import { BarChart } from 'layerchart';
	import * as Chart from '#lib/components/ui/chart/index.js';
	import { ChevronRight } from '@lucide/svelte';
	import type { SpendingGroup } from '#lib/domain/insights.js';
	import { formatMoney } from '#lib/domain/receipt.js';
	let { rows, onselect }: { rows: SpendingGroup[]; onselect: (row: SpendingGroup) => void } =
		$props();
	const data = $derived(rows.map((row) => ({ ...row, value: row.amountOre / 100 })));
	const config = { value: { label: 'Kroner', color: 'var(--chart-1)' } };
</script>

{#if data.some((row) => row.value !== 0)}
	<Chart.Container
		{config}
		class="w-full aspect-auto"
		style={`height:${Math.max(180, rows.length * 36)}px`}
	>
		<BarChart
			{data}
			orientation="horizontal"
			padding={{ left: 108, right: 8, top: 8, bottom: 24 }}
			x="value"
			y="name"
			props={{
				yAxis: {
					format: (value: string) => (value.length > 15 ? value.slice(0, 14) + '…' : value)
				},
				xAxis: { format: (value: number) => new Intl.NumberFormat('nb-NO').format(value) }
			}}
			series={[{ key: 'value', label: 'Kroner', color: 'var(--chart-1)' }]}
			onTooltipClick={(_, detail) => onselect(detail.data)}
		>
			{#snippet tooltip()}<Chart.Tooltip labelFormatter={() => 'Registrert forbruk'}
					>{#snippet formatter({ value })}<span>{formatMoney(Math.round(Number(value) * 100))}</span
						>{/snippet}</Chart.Tooltip
				>{/snippet}
		</BarChart>
	</Chart.Container>
{/if}
<div class="divide-y divide-border">
	{#each rows as row (row.id)}<Button
			variant="ghost"
			class="flex min-h-11 w-full items-center gap-3 py-3 text-left text-sm hover:bg-muted rounded-lg"
			onclick={() => onselect(row)}
			><span class="flex-1">{row.name}</span><strong class="tabular-nums"
				>{formatMoney(row.amountOre)}</strong
			><ChevronRight class="size-4 text-muted-foreground" /></Button
		>{/each}
</div>
