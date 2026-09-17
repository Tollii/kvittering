<script lang="ts">
	import { Button } from '#lib/components/ui/button/index.js';
	import { Camera, ImagePlus, Plus, X, Check, WifiOff, ReceiptText } from '@lucide/svelte';
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
	let saved = $state(false);
	let combined = $state(false);
	const inputId = $props.id();
	async function addImages(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const chosen = Array.from(input.files ?? []);
		working = true;
		error = '';
		saved = false;
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
			saved = true;
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

<section class="capture-panel">
	<div class="section-eyebrow">FRA BUTIKKEN TIL OVERSIKTEN</div>
	<h1>Ta bildet.<br /><span class="muted-heading">Resten kan vente.</span></h1>
	<p class="intro">
		Lagre kvitteringen nå. Se hva dere handlet<br class="desktop-break" /> når det passer dere.
	</p>
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
	{#if saved}<div class="notice success" role="status">
			<Check size={20} />
			<div>
				<strong>Lagret på denne enheten</strong>
				<p>Opplastingen fortsetter når appen er åpen og har nett.</p>
			</div>
		</div>{/if}
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
				</div>{/each}<Button
				variant="ghost"
				class="add-photo"
				onclick={() => document.getElementById(`${inputId}-camera`)?.click()}
				disabled={working}><Plus /><span>Flere bilder</span></Button
			>
		</div>
		{#if !combined}<p class="muted small">Hvert bilde lagres som en egen kvittering.</p>{/if}
		{#if photos.length > 1}
			<label class="flex min-h-12 items-center gap-3 py-3">
				<input type="checkbox" bind:checked={combined} disabled={working} />
				<span>Bildene er deler av én lang kvittering</span>
			</label>
			{#if combined}<p class="muted small">Bildene behandles sammen, i valgt rekkefølge.</p>{/if}
		{/if}
		<Button variant="default" class="primary wide" onclick={save} disabled={working}
			>{#if working}Lagrer …{:else}<Check size={20} />Lagre {photos.length === 1 || combined
					? 'kvittering'
					: `${photos.length} kvitteringer`}{/if}</Button
		>
	{:else}
		<Button
			variant="ghost"
			class="camera-button"
			onclick={() => document.getElementById(`${inputId}-camera`)?.click()}
			disabled={working}
			><span class="camera-symbol"><Camera size={34} strokeWidth={1.6} /></span><strong
				>{working ? 'Klargjør bilde …' : 'Ta bilde av kvittering'}</strong
			><span>Kameraet åpnes på telefonen</span></Button
		>
	{/if}
	<Button
		variant="outline"
		class="secondary wide"
		onclick={() => document.getElementById(`${inputId}-files`)?.click()}
		disabled={working}><ImagePlus size={19} />Velg bilder fra enheten</Button
	>
	{#if error}<p class="error" role="alert">{error}</p>{/if}
	<div class="capture-note">
		<span class="note-icon"><ReceiptText size={19} /></span>
		<p>
			<strong>Én kvittering, flere detaljer.</strong><br />Varer, rabatter og pant holdes fra
			hverandre. Du kan kontrollere alt senere.
		</p>
	</div>
</section>
