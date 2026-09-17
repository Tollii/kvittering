<script lang="ts">
	import { untrack } from 'svelte';
	import { cn, type WithElementRef } from '#lib/utils.js';
	import type { HTMLAttributes } from 'svelte/elements';

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLParagraphElement>> = $props();
</script>

<p
	{@attach (element: HTMLElement) => {
		untrack(() => {
			if (ref !== element) ref = element;
		});
		return () => {
			ref = null;
		};
	}}
	data-slot="card-description"
	class={cn('text-muted-foreground text-sm', className)}
	{...restProps}
>
	{@render children?.()}
</p>
