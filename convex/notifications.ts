import { v } from 'convex/values';
import { query, mutation, internalQuery, internalMutation, env } from './_generated/server';
import { requireMember } from './access';
import schema from './schema';

const subscriptionFields = {
	endpoint: v.string(),
	keys: v.object({ p256dh: v.string(), auth: v.string() })
};

/** Only browser push services are valid destinations for server-side requests. */
export function validPushEndpoint(endpoint: string) {
	try {
		const url = new URL(endpoint);
		return (
			endpoint.length <= 2048 &&
			url.protocol === 'https:' &&
			!url.port &&
			!url.username &&
			!url.password &&
			!url.hash &&
			(['web.push.apple.com', 'fcm.googleapis.com', 'updates.push.services.mozilla.com'].includes(
				url.hostname
			) ||
				url.hostname.endsWith('.notify.windows.com'))
		);
	} catch {
		return false;
	}
}
export const configuration = query({
	args: {},
	returns: v.union(v.string(), v.null()),
	handler: async (ctx) => {
		await requireMember(ctx);
		return env.VAPID_PUBLIC_KEY ?? null;
	}
});
export const enabled = query({
	args: { endpoint: v.string() },
	returns: v.boolean(),
	handler: async (ctx, { endpoint }) => {
		const member = await requireMember(ctx);
		const subscription = await ctx.db
			.query('pushSubscriptions')
			.withIndex('by_endpoint', (q) => q.eq('endpoint', endpoint))
			.unique();
		return (
			subscription?.identity === member.identity && subscription.householdId === member.householdId
		);
	}
});
export const subscribe = mutation({
	args: subscriptionFields,
	returns: v.null(),
	handler: async (ctx, args) => {
		const member = await requireMember(ctx);
		if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY)
			throw new Error('Varsler er ikke tilgjengelige ennå.');
		if (
			!validPushEndpoint(args.endpoint) ||
			!/^[A-Za-z0-9_-]{87}$/.test(args.keys.p256dh) ||
			!/^[A-Za-z0-9_-]{22}$/.test(args.keys.auth)
		)
			throw new Error('Ugyldig varslingsabonnement.');
		const existing = await ctx.db
			.query('pushSubscriptions')
			.withIndex('by_endpoint', (q) => q.eq('endpoint', args.endpoint))
			.unique();
		if (existing && existing.identity !== member.identity)
			throw new Error('Slå av varsler for forrige konto på denne enheten først.');
		const values = { ...args, identity: member.identity, householdId: member.householdId };
		if (existing) await ctx.db.replace('pushSubscriptions', existing._id, values);
		else {
			const subscriptions = await ctx.db
				.query('pushSubscriptions')
				.withIndex('by_identity', (q) => q.eq('identity', member.identity))
				.take(10);
			if (subscriptions.length >= 10)
				throw new Error('Varsler er allerede aktivert på ti enheter.');
			await ctx.db.insert('pushSubscriptions', values);
		}
		return null;
	}
});
export const unsubscribe = mutation({
	args: { endpoint: v.string() },
	returns: v.null(),
	handler: async (ctx, { endpoint }) => {
		const member = await requireMember(ctx);
		const subscription = await ctx.db
			.query('pushSubscriptions')
			.withIndex('by_endpoint', (q) => q.eq('endpoint', endpoint))
			.unique();
		if (subscription?.identity === member.identity)
			await ctx.db.delete('pushSubscriptions', subscription._id);
		return null;
	}
});
export const delivery = internalQuery({
	args: { receiptId: v.id('receipts'), subscriptionId: v.id('pushSubscriptions') },
	returns: v.union(
		v.object({
			subscription: schema.doc('pushSubscriptions'),
			store: v.union(v.string(), v.null())
		}),
		v.null()
	),
	handler: async (ctx, args) => {
		const receipt = await ctx.db.get('receipts', args.receiptId);
		const subscription = await ctx.db.get('pushSubscriptions', args.subscriptionId);
		if (
			!receipt ||
			!subscription ||
			receipt.status !== 'needs_review' ||
			receipt.excluded ||
			receipt.uploadedBy !== subscription.identity ||
			receipt.householdId !== subscription.householdId
		)
			return null;
		const member = await ctx.db
			.query('members')
			.withIndex('by_identity', (q) => q.eq('identity', subscription.identity))
			.unique();
		if (member?.householdId !== receipt.householdId) return null;
		return { subscription, store: receipt.data?.store ?? null };
	}
});
export const removeExpired = internalMutation({
	args: { id: v.id('pushSubscriptions') },
	returns: v.null(),
	handler: async (ctx, { id }) => {
		if (await ctx.db.get('pushSubscriptions', id)) await ctx.db.delete('pushSubscriptions', id);
		return null;
	}
});
