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

worker.addEventListener('push', (event) => {
	event.waitUntil(
		(async () => {
			let payload: { title?: string; body?: string; receiptId?: string } = {};
			try {
				payload = event.data?.json() ?? {};
			} catch {
				/* Show a useful notification even if a payload is unreadable. */
			}
			const id =
				typeof payload.receiptId === 'string' && /^[a-z0-9]{20,64}$/.test(payload.receiptId)
					? payload.receiptId
					: null;
			await worker.registration.showNotification(
				typeof payload.title === 'string' ? payload.title : 'Kvittering',
				{
					body:
						typeof payload.body === 'string' ? payload.body : 'En kvittering er klar til kontroll.',
					icon: '/icon-192.png',
					tag: id ? `receipt-${id}` : 'receipt-ready',
					data: { url: id ? `/?receipt=${encodeURIComponent(id)}` : '/' }
				}
			);
		})()
	);
});
worker.addEventListener('notificationclick', (event) => {
	event.notification.close();
	event.waitUntil(
		(async () => {
			const url = new URL(event.notification.data?.url ?? '/', worker.location.origin);
			if (url.origin !== worker.location.origin) return;
			const windows = await worker.clients.matchAll({ type: 'window', includeUncontrolled: true });
			const existing = windows.find(
				(client) => new URL(client.url).origin === worker.location.origin
			);
			if (existing) {
				await existing.navigate(url.href);
				await existing.focus();
			} else await worker.clients.openWindow(url.href);
		})()
	);
});
