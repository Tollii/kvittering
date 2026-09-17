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
	data-slot="sheet-footer"
	class={cn('gap-2 p-4 mt-auto flex flex-col', className)}
	{...restProps}
>
	{@render children?.()}
</div>
