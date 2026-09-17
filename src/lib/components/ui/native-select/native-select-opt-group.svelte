<script lang="ts">
	import { untrack } from 'svelte';
	import type { WithElementRef } from '#lib/utils.js';
	import type { HTMLOptgroupAttributes } from 'svelte/elements';

	let {
		ref = $bindable(null),
		children,
		...restProps
	}: WithElementRef<HTMLOptgroupAttributes> = $props();
</script>

<optgroup
	{@attach (element: HTMLElement) => {
		untrack(() => {
			if (ref !== element) ref = element;
		});
		return () => {
			ref = null;
		};
	}}
	data-slot="native-select-opt-group"
	{...restProps}
>
	{@render children?.()}
</optgroup>
