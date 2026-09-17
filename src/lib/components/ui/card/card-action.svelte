<script lang="ts">
	import { untrack } from 'svelte';
	import { cn, type WithElementRef } from '#lib/utils.js';
	import type { HTMLAttributes } from 'svelte/elements';

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> = $props();
</script>

<div
	{@attach (element: HTMLElement) => {
		untrack(() => {
			if (ref !== element) ref = element;
		});
		return () => {
			ref = null;
		};
	}}
	data-slot="card-action"
	class={cn('col-start-2 row-span-2 row-start-1 self-start justify-self-end', className)}
	{...restProps}
>
	{@render children?.()}
</div>
