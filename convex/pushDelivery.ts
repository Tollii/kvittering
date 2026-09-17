'use node';
import webpush from 'web-push';
import { v } from 'convex/values';
import { internalAction, env } from './_generated/server';
import { internal } from './_generated/api';

export const send = internalAction({
	args: {
		receiptId: v.id('receipts'),
		subscriptionId: v.id('pushSubscriptions'),
		attempt: v.number()
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const target = await ctx.runQuery(internal.notifications.delivery, {
			receiptId: args.receiptId,
			subscriptionId: args.subscriptionId
		});
		if (!target || !env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY || !env.SITE_URL) return null;
		try {
			await webpush.sendNotification(
				{ endpoint: target.subscription.endpoint, keys: target.subscription.keys },
				JSON.stringify({
					title: 'Kvitteringen er klar',
					body: target.autoAccepted
						? 'Kvitteringen er behandlet og automatisk godkjent.'
						: target.store
							? `Kvitteringen fra ${target.store.slice(0, 80)} er klar til kontroll.`
							: 'Kvitteringen er klar til kontroll.',
					receiptId: args.receiptId
				}),
				{
					vapidDetails: {
						subject: env.SITE_URL,
						publicKey: env.VAPID_PUBLIC_KEY,
						privateKey: env.VAPID_PRIVATE_KEY
					},
					TTL: 3600,
					timeout: 10000,
					urgency: 'normal'
				}
			);
		} catch (error) {
			const status = error instanceof webpush.WebPushError ? error.statusCode : null;
			if (status === 404 || status === 410)
				await ctx.runMutation(internal.notifications.removeExpired, { id: args.subscriptionId });
			else if ((status === null || status === 429 || status >= 500) && args.attempt < 2) {
				await ctx.scheduler.runAfter(
					args.attempt === 0 ? 10000 : 60000,
					internal.pushDelivery.send,
					{ ...args, attempt: args.attempt + 1 }
				);
			} else console.warn('Receipt notification delivery failed', { status });
		}
		return null;
	}
});
