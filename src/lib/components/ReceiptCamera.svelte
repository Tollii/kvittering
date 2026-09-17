<script lang="ts">
	import { onMount, onDestroy, untrack } from 'svelte';
	import { Camera, ImagePlus, Images } from '@lucide/svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	let {
		active,
		oncapture,
		onimport,
		onfallback,
		onreview,
		photoCount = 0
	}: {
		active: boolean;
		oncapture: (file: File) => Promise<void>;
		onimport: () => void;
		onfallback: () => void;
		onreview: () => void;
		photoCount?: number;
	} = $props();
	let video = $state<HTMLVideoElement>();
	let mounted = $state(false);
	let visible = $state(false);
	let starting = $state(false);
	let ready = $state(false);
	let capturing = $state(false);
	let error = $state('');
	let stream: MediaStream | null = null;
	let request = 0;
	function stop() {
		request++;
		stream?.getTracks().forEach((track) => track.stop());
		stream = null;
		if (video) video.srcObject = null;
		ready = false;
		starting = false;
	}
	async function start() {
		if (!active || !visible || !video || starting || stream) return;
		const current = ++request;
		starting = true;
		error = '';
		try {
			if (!navigator.mediaDevices?.getUserMedia) throw new Error('unsupported');
			const acquired = await navigator.mediaDevices.getUserMedia({
				audio: false,
				video: {
					facingMode: { ideal: 'environment' },
					width: { ideal: 2560 },
					height: { ideal: 1920 }
				}
			});
			if (current !== request || !active || !visible) {
				acquired.getTracks().forEach((track) => track.stop());
				return;
			}
			stream = acquired;
			acquired.getVideoTracks().forEach((track) =>
				track.addEventListener(
					'ended',
					() => {
						if (stream !== acquired) return;
						stop();
						error = 'Kameraet ble stoppet. Trykk for å starte igjen.';
					},
					{ once: true }
				)
			);
			video.srcObject = acquired;
			await video.play();
			if (current === request) ready = true;
		} catch (cause) {
			if (current !== request) return;
			stop();
			error =
				cause instanceof DOMException && cause.name === 'NotAllowedError'
					? 'Tillat kameratilgang for å vise kameraet her.'
					: 'Kameraet kunne ikke startes her.';
		} finally {
			if (current === request) starting = false;
		}
	}
	async function takePhoto() {
		if (!video || !ready || capturing || !video.videoWidth || !video.videoHeight) return;
		capturing = true;
		try {
			const canvas = document.createElement('canvas');
			const scale = Math.min(1, 2400 / Math.max(video.videoWidth, video.videoHeight));
			canvas.width = Math.round(video.videoWidth * scale);
			canvas.height = Math.round(video.videoHeight * scale);
			const context = canvas.getContext('2d');
			if (!context) throw new Error('canvas');
			context.drawImage(video, 0, 0, canvas.width, canvas.height);
			const blob = await new Promise<Blob>((resolve, reject) =>
				canvas.toBlob(
					(value) => (value ? resolve(value) : reject(new Error('image'))),
					'image/jpeg',
					0.92
				)
			);
			await oncapture(new File([blob], 'receipt.jpg', { type: 'image/jpeg' }));
		} catch {
			error = 'Bildet kunne ikke tas. Prøv igjen eller bruk systemkameraet.';
		} finally {
			capturing = false;
		}
	}
	onMount(() => {
		mounted = true;
		visible = document.visibilityState === 'visible';
		const visibility = () => {
			visible = document.visibilityState === 'visible';
		};
		const hide = () => {
			visible = false;
			stop();
		};
		document.addEventListener('visibilitychange', visibility);
		window.addEventListener('pagehide', hide);
		window.addEventListener('pageshow', visibility);
		return () => {
			document.removeEventListener('visibilitychange', visibility);
			window.removeEventListener('pagehide', hide);
			window.removeEventListener('pageshow', visibility);
		};
	});
	$effect(() => {
		const enabled = mounted && active && visible;
		untrack(() => {
			if (enabled) {
				if (!error) void start();
			} else stop();
		});
	});
	onDestroy(stop);
</script>

<section class="receipt-camera" aria-label="Kvitteringskamera">
	<div class="camera-preview">
		<video bind:this={video} autoplay muted playsinline aria-label="Direkte kamerabilde"></video>
		{#if !ready}
			<div class="camera-placeholder">
				<Camera size={40} class="size-10" />
				{#if starting}<p role="status">Starter kamera …</p>
				{:else}<p>{error || 'Ta bilde av kvitteringen'}</p>
					<Button variant="outline" onclick={start}>Start kamera</Button>{/if}
				<Button variant="ghost" onclick={onfallback}>Bruk systemkameraet</Button>
			</div>
		{/if}
	</div>
	<div class="camera-controls">
		<Button variant="ghost" class="camera-import" onclick={onimport} disabled={capturing}
			><ImagePlus class="size-6" /><span>Velg bilder</span></Button
		>
		<Button
			variant="ghost"
			class="camera-shutter"
			aria-label="Ta bilde av kvittering"
			onclick={takePhoto}
			disabled={!ready || capturing}><span></span></Button
		>
		{#if photoCount}<Button variant="ghost" class="camera-import" onclick={onreview}
				><Images class="size-6" /><span>{photoCount} bilder</span></Button
			>{:else}<span></span>{/if}
	</div>
	{#if ready && error}<p class="error" role="alert">{error}</p>{/if}
</section>
