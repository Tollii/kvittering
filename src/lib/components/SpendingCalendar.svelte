<script lang="ts">
	import { CalendarDays } from '@lucide/svelte';
	import * as Card from '#lib/components/ui/card/index.js';
	import { spendingCalendar, type Receipt, type SpendingGroup } from '#lib/domain/insights.js';
	import { formatMoney, osloDate } from '#lib/domain/receipt.js';
	let {
		receipts,
		year,
		reviewedOnly,
		onselect
	}: {
		receipts: Receipt[];
		year: number;
		reviewedOnly: boolean;
		onselect: (group: SpendingGroup) => void;
	} = $props();
	const uid = $props.id();
	const days = $derived(spendingCalendar(receipts, year, reviewedOnly));
	const offset = $derived((new Date(Date.UTC(year, 0, 1)).getUTCDay() + 6) % 7);
	const weeks = $derived(Math.ceil((offset + days.length) / 7));
	let focused = $state<string | null>(null);
	const initial = $derived(
		days.find((day) => day.date === osloDate())?.date ?? days.find((day) => !day.future)?.date
	);
	const focusDate = $derived(days.some((day) => day.date === focused) ? focused : initial);
	const active = $derived(days.filter((day) => day.contributions.length).length);
	const formatDate = (date: string) =>
		new Intl.DateTimeFormat('nb-NO', {
			day: 'numeric',
			month: 'long',
			year: 'numeric',
			timeZone: 'Europe/Oslo'
		}).format(new Date(date + 'T12:00:00Z'));
	function description(day: (typeof days)[number]) {
		return `${formatDate(day.date)}: ${day.future ? 'Fremtidig dato' : !day.contributions.length ? 'Ingen registrerte kjøp' : `${formatMoney(day.amountOre)} · ${day.contributions.length} kvitteringer${day.provisional ? ' · foreløpig' : ''}${day.unknown ? ' · mangler beløp' : ''}`}`;
	}
	let tooltip = $state<{ day: (typeof days)[number]; left: number; bottom: number } | null>(null);
	function showDay(day: (typeof days)[number], element: HTMLElement) {
		const bounds = element.getBoundingClientRect();
		tooltip = {
			day,
			left: Math.max(120, Math.min(window.innerWidth - 120, bounds.left + bounds.width / 2)),
			bottom: window.innerHeight - bounds.top + 8
		};
	}

	function move(event: KeyboardEvent, index: number) {
		if (event.key === 'Escape') {
			tooltip = null;
			return;
		}
		const steps: Record<string, number> = {
			ArrowLeft: -7,
			ArrowRight: 7,
			ArrowUp: -1,
			ArrowDown: 1
		};
		if (!(event.key in steps)) return;
		event.preventDefault();
		const target = days[Math.max(0, Math.min(days.length - 1, index + steps[event.key]))];
		if (target.future) return;
		focused = target.date;
		document.getElementById(`${uid}-${target.date}`)?.focus();
	}
</script>

<Card.Root class="panel gap-4">
	<div class="flex flex-wrap items-center justify-between gap-2">
		<h2 class="flex items-center gap-2">
			<CalendarDays class="size-4 text-muted-foreground" />Handleåret
			<span class="text-muted-foreground">{year}</span>
		</h2>
		<span class="text-xs text-muted-foreground">{active} dager med registrerte kjøp</span>
	</div>
	<p class="text-sm text-muted-foreground">Vareforbruk uten pant.</p>
	<div class="overflow-x-auto pb-2" aria-label={`Forbrukskalender ${year}`}>
		<div class="calendar-grid" style={`--weeks:${weeks}`}>
			<div class="calendar-months" aria-hidden="true">
				{#each Array.from({ length: 12 }, (_, month) => month) as month (month)}
					{@const first = new Date(Date.UTC(year, month, 1))}
					{@const column =
						Math.floor(
							(Math.round((first.getTime() - Date.UTC(year, 0, 1)) / 86400000) + offset) / 7
						) + 1}
					<span style={`grid-column:${column}`}
						>{new Intl.DateTimeFormat('nb-NO', { month: 'short', timeZone: 'UTC' }).format(
							first
						)}</span
					>
				{/each}
			</div>
			<div class="calendar-weekdays" aria-hidden="true">
				<span>Man</span><span>Ons</span><span>Fre</span>
			</div>
			<div class="calendar-days">
				{#each days as day, index (day.date)}
					<button
						type="button"
						id={`${uid}-${day.date}`}
						class="calendar-day"
						data-level={day.level}
						data-purchase={day.contributions.length > 0}
						disabled={day.future}
						style={`grid-column:${Math.floor((index + offset) / 7) + 1};grid-row:${((index + offset) % 7) + 1}`}
						tabindex={focusDate === day.date ? 0 : -1}
						aria-describedby={tooltip?.day.date === day.date ? `${uid}-tooltip` : undefined}
						aria-label={description(day)}
						onmouseenter={(event) => showDay(day, event.currentTarget)}
						onmouseleave={() => (tooltip = null)}
						onfocus={(event) => {
							focused = day.date;
							showDay(day, event.currentTarget);
						}}
						onblur={() => (tooltip = null)}
						onkeydown={(event) => move(event, index)}
						onclick={() => {
							tooltip = null;
							onselect({
								id: day.date,
								name: description(day),
								amountOre: day.amountOre,
								contributions: day.contributions
							});
						}}
					>
					</button>
				{/each}
			</div>
		</div>
	</div>
	<div class="flex flex-wrap justify-between gap-3 text-xs text-muted-foreground">
		<span>Trykk på en dag for å se kvitteringene. Dra sidelengs for hele året.</span>
		<span class="flex items-center gap-1.5"
			>Mindre {#each [0, 1, 2, 3, 4] as level (level)}<span
					class="calendar-day size-3"
					data-level={level}
					aria-hidden="true"
				></span>{/each} Mer</span
		>
	</div>
	<p class="text-xs text-muted-foreground">Foreløpige beløp kan endres ved kontroll.</p>
</Card.Root>

{#if tooltip}
	<div
		id={`${uid}-tooltip`}
		role="tooltip"
		class="pointer-events-none fixed z-50 w-56 -translate-x-1/2 rounded-lg border border-border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-md"
		style={`left:${tooltip.left}px;bottom:${tooltip.bottom}px`}
	>
		<p class="text-xs text-muted-foreground">{formatDate(tooltip.day.date)}</p>
		<strong class="text-base tabular-nums">{formatMoney(tooltip.day.amountOre)}</strong>
		<p class="text-xs text-muted-foreground">
			{tooltip.day.contributions.length
				? 'Vareforbruk uten pant'
				: 'Ingen registrerte kjøp'}{tooltip.day.provisional ? ' · foreløpig' : ''}{tooltip.day
				.unknown
				? ' · ufullstendig beløp'
				: ''}
		</p>
	</div>
{/if}

<style>
	.calendar-grid {
		--cell: 28px;
		--gap: 4px;
		display: grid;
		grid-template-columns: 30px 1fr;
		grid-template-rows: 20px 1fr;
		gap: 6px;
		width: max-content;
	}
	.calendar-months {
		grid-column: 2;
		display: grid;
		grid-template-columns: repeat(var(--weeks), var(--cell));
		gap: var(--gap);
		font-size: 11px;
		color: var(--muted-foreground);
	}
	.calendar-weekdays {
		display: grid;
		grid-template-rows: repeat(7, var(--cell));
		gap: var(--gap);
		font-size: 10px;
		color: var(--muted-foreground);
		align-items: center;
	}
	.calendar-weekdays span:nth-child(2) {
		grid-row: 3;
	}
	.calendar-weekdays span:nth-child(3) {
		grid-row: 5;
	}
	.calendar-days {
		display: grid;
		grid-template-columns: repeat(var(--weeks), var(--cell));
		grid-template-rows: repeat(7, var(--cell));
		gap: var(--gap);
	}
	.calendar-day {
		border: 1px solid #163f3612;
		border-radius: 4px;
		background: #eef1ed;
		padding: 0;
		transition: background-color 150ms;
	}
	.calendar-day[data-level='1'] {
		background: #cee7d4;
	}
	.calendar-day[data-level='2'] {
		background: #88c69e;
	}
	.calendar-day[data-level='3'] {
		background: #43a573;
	}
	.calendar-day[data-level='4'] {
		background: #167244;
	}
	.calendar-day[data-purchase='true'][data-level='0'] {
		border-color: #718d7c;
	}
	.calendar-day:disabled {
		opacity: 0.3;
		cursor: default;
	}
	.calendar-day:focus-visible {
		outline: 2px solid var(--green);
		outline-offset: 1px;
	}
	@media (min-width: 768px) {
		.calendar-grid {
			--cell: 12px;
			--gap: 3px;
		}
	}
</style>
