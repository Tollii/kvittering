import { immutable, assets as staticAssets } from '$app/manifest';
import { version } from '$app/env';
import { self as worker } from '$app/service-worker';
const cacheName = `receipt-application-${version}`;
const assets = new Set(
	[...immutable, ...staticAssets].map(
		(file) => new URL(file.path, worker.location.origin + '/').pathname
	)
);
worker.addEventListener('install', (event) => {
	event.waitUntil(
		(async () => {
			const cache = await caches.open(cacheName);
			await cache.addAll([...assets, '/']);
			await worker.skipWaiting();
		})()
	);
});
worker.addEventListener('activate', (event) => {
	event.waitUntil(
		(async () => {
			for (const name of await caches.keys())
				if (name.startsWith('receipt-application-') && name !== cacheName)
					await caches.delete(name);
			await worker.clients.claim();
		})()
	);
});
worker.addEventListener('fetch', (event) => {
	const request = event.request;
	const url = new URL(request.url);
	if (
		request.method !== 'GET' ||
		url.origin !== worker.location.origin ||
		url.pathname.startsWith('/api/')
	)
		return;
	// Cache only the public shell and static assets. Receipt data and photos stay private.
	if (request.mode === 'navigate')
		event.respondWith(
			fetch(request).catch(async () => {
				const cached = await caches.match('/', { ignoreVary: true });
				return (
					cached ??
					new Response('Åpne appen med nett én gang for å aktivere frakoblet bruk.', {
						status: 503,
						headers: { 'Content-Type': 'text/plain;charset=utf-8' }
					})
				);
			})
		);
	else if (assets.has(url.pathname))
		event.respondWith(
			(async () => {
				const cache = await caches.open(cacheName);
				return (await cache.match(request, { ignoreVary: true })) ?? fetch(request);
			})()
		);
});
