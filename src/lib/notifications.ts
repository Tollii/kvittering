import type { ConvexClient } from 'convex/browser';
import { api } from '../../convex/_generated/api';

export async function disableNotifications(client: ConvexClient) {
	if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
	const registration = await navigator.serviceWorker.getRegistration();
	const subscription = await registration?.pushManager.getSubscription();
	if (!subscription) return;
	await client.mutation(api.notifications.unsubscribe, { endpoint: subscription.endpoint });
	await subscription.unsubscribe();
	for (const notification of await registration!.getNotifications()) notification.close();
}

export function applicationServerKey(value: string): Uint8Array<ArrayBuffer> {
	const decoded = atob(value.replace(/-/g, '+').replace(/_/g, '/'));
	return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
}
