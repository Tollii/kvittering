<script lang="ts">
	import { useQuery } from 'convex-svelte';
	import { api } from '../../convex/_generated/api';

	const samples = useQuery(api.samples.list, {});
</script>

<svelte:head>
	<title>Convex connection</title>
</svelte:head>

<main>
	<h1>Convex connection</h1>
	<p>Sample records from the Convex database. Changes appear automatically.</p>

	{#if samples.isLoading}
		<p role="status">Loading sample records…</p>
	{:else if samples.error}
		<p role="alert">Could not load sample records. {samples.error.message}</p>
	{:else}
		<p role="status">Received {samples.data.length} records from Convex.</p>
		<ul aria-label="Sample records">
			{#each samples.data as sample (sample._id)}
				<li><strong>{sample.name}</strong>: {sample.description}</li>
			{:else}
				<li>No sample records. Run the sample seed command to add them.</li>
			{/each}
		</ul>
	{/if}
</main>
