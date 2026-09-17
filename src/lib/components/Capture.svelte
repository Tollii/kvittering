<script lang="ts">
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Sheet from '#lib/components/ui/sheet/index.js';
	import { Camera, ImagePlus, X, Check, WifiOff } from '@lucide/svelte';
	import { prepareImage, saveLocalReceipts } from '#lib/upload-queue.js';
	import { onDestroy } from 'svelte';
	let {
		householdId,
		onsaved,
		offline = false
	}: { householdId: string; onsaved: () => void; offline?: boolean } = $props();
	let photos = $state<{ blob: Blob; url: string }[]>([]);
	let working = $state(false);
	let error = $state('');
	let open = $state(false);
	let opener: HTMLElement | null = null;
	let combined = $state(false);
	const inputId = $props.id();
	export function openPicker() {
		opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
		open = true;
	}
	function openCamera() {
		if (!working) document.getElementById(`${inputId}-camera`)?.click();
	}
	async function addImages(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const chosen = Array.from(input.files ?? []);
		working = true;
		error = '';
		try {
			if (photos.length + chosen.length > 8)
				throw new Error('Du kan ha opptil åtte bilder om gangen.');
			for (const file of chosen) {
				const blob = await prepareImage(file);
				photos.push({ blob, url: URL.createObjectURL(blob) });
			}
		} catch (cause) {
			error = cause instanceof Error ? cause.message : 'Bildet kunne ikke åpnes.';
		} finally {
			working = false;
			input.value = '';
		}
	}
	function remove(index: number) {
		URL.revokeObjectURL(photos[index].url);
		photos.splice(index, 1);
		if (photos.length < 2) combined = false;
	}
	async function save() {
		working = true;
		error = '';
		try {
			await saveLocalReceipts(
				householdId,
				photos.map((photo) => photo.blob),
				combined
			);
			photos.forEach((photo) => URL.revokeObjectURL(photo.url));
			photos = [];
			combined = false;
			open = false;
			onsaved();
			navigator.storage?.persist?.().catch(() => false);
		} catch {
			error = 'Kunne ikke lagre på denne enheten. Frigjør lagringsplass og prøv igjen.';
		} finally {
			working = false;
		}
	}
	onDestroy(() => photos.forEach((photo) => URL.revokeObjectURL(photo.url)));
</script>

<input
	class="visually-hidden"
	tabindex="-1"
	type="file"
	accept="image/*"
	capture="environment"
	id={`${inputId}-camera`}
	onchange={addImages}
/>
<input
	class="visually-hidden"
	tabindex="-1"
	type="file"
	accept="image/*"
	multiple
	id={`${inputId}-files`}
	onchange={addImages}
/>
<Sheet.Root bind:open>
	<Sheet.Content
		side="bottom"
		class="capture-sheet"
		onCloseAutoFocus={(event) => {
			event.preventDefault();
			opener?.focus();
		}}
	>
		<Sheet.Header
			><Sheet.Title>{photos.length ? 'Valgte bilder' : 'Legg til kvittering'}</Sheet.Title
			></Sheet.Header
		>
		<div class="capture-sheet-body">
			{#if offline}<div class="notice">
					<WifiOff size={18} /><span>Uten nett. Du kan fortsatt lagre kvitteringer.</span>
				</div>{/if}
			{#if photos.length}
				<div class="photo-previews">
					{#each photos as photo, index (photo.url)}<div class="photo-preview">
							<img src={photo.url} alt={`Kvitteringsbilde ${index + 1}`} /><span>{index + 1}</span
							><Button
								variant="ghost"
								class="icon-button"
								aria-label={`Fjern bilde ${index + 1}`}
								disabled={working}
								onclick={() => remove(index)}><X size={16} /></Button
							>
						</div>{/each}
				</div>
				{#if !combined}<p class="muted small">Hvert bilde lagres som en egen kvittering.</p>{/if}
				{#if photos.length > 1}
					<label class="flex min-h-12 items-center gap-3 py-3">
						<input type="checkbox" bind:checked={combined} disabled={working} />
						<span>Bildene er deler av samme kvittering</span>
					</label>
				{/if}
				<Button variant="default" class="primary wide" onclick={save} disabled={working}
					>{#if working}Lagrer …{:else}<Check size={20} />Lagre {photos.length === 1 || combined
							? 'kvittering'
							: `${photos.length} kvitteringer`}{/if}</Button
				>
			{/if}
			<div class="grid grid-cols-2 gap-3">
				<Button
					variant="outline"
					class="secondary capture-option"
					onclick={openCamera}
					disabled={working}><Camera class="size-6" /><span>Ta bilde</span></Button
				>
				<Button
					variant="outline"
					class="secondary capture-option"
					onclick={() => document.getElementById(`${inputId}-files`)?.click()}
					disabled={working}><ImagePlus class="size-6" /><span>Velg bilder</span></Button
				>
			</div>
			{#if working}<p role="status">Klargjør bilder …</p>{/if}
			{#if error}<p class="error" role="alert">{error}</p>{/if}
		</div>
	</Sheet.Content>
</Sheet.Root>
