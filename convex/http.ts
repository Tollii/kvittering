import { httpRouter } from 'convex/server';
import { httpAction, env } from './_generated/server';
import { internal } from './_generated/api';
import { authComponent, createAuth } from './auth';
import type { Id } from './_generated/dataModel';
const http = httpRouter();
authComponent.registerRoutes(http, createAuth);
function headers(request: Request) {
	return {
		'Access-Control-Allow-Origin':
			request.headers.get('Origin') === env.SITE_URL ? env.SITE_URL : '',
		Vary: 'Origin',
		'Access-Control-Allow-Headers': 'Authorization, Content-Type',
		'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
		'Cache-Control': 'no-store'
	};
}
http.route({
	path: '/receipt-image',
	method: 'OPTIONS',
	handler: httpAction(
		async (_ctx, request) => new Response(null, { status: 204, headers: headers(request) })
	)
});
http.route({
	path: '/receipt-image',
	method: 'POST',
	handler: httpAction(async (ctx, request) => {
		const responseHeaders = headers(request);
		try {
			const url = new URL(request.url);
			const id = url.searchParams.get('receipt') as Id<'receipts'>;
			const position = Number(url.searchParams.get('position'));
			const access = await ctx.runQuery(internal.receipts.imageAccess, { id, position });
			if (access.image) return Response.json({ uploaded: true }, { headers: responseHeaders });
			if (access.receipt.status !== 'uploading')
				return new Response('Opplasting er avsluttet.', { status: 409, headers: responseHeaders });
			const type = request.headers.get('Content-Type')?.split(';')[0];
			if (!type || !['image/jpeg', 'image/png', 'image/webp'].includes(type))
				return new Response('Bruk JPEG, PNG eller WebP.', {
					status: 415,
					headers: responseHeaders
				});
			if (Number(request.headers.get('Content-Length')) > 10 * 1024 * 1024)
				return new Response('Bildet er for stort.', { status: 413, headers: responseHeaders });
			const blob = await request.blob();
			if (blob.size > 10 * 1024 * 1024 || blob.size === 0)
				return new Response('Ugyldig bildestørrelse.', { status: 413, headers: responseHeaders });
			const storageId = await ctx.storage.store(blob);
			try {
				await ctx.runMutation(internal.receipts.attachImage, { id, position, storageId });
			} catch (error) {
				await ctx.storage.delete(storageId);
				throw error;
			}
			return Response.json({ uploaded: true }, { headers: responseHeaders });
		} catch {
			return new Response('Bildet kunne ikke lagres. Kontroller innloggingen.', {
				status: 403,
				headers: responseHeaders
			});
		}
	})
});
http.route({
	path: '/receipt-image',
	method: 'GET',
	handler: httpAction(async (ctx, request) => {
		try {
			const url = new URL(request.url);
			const { image } = await ctx.runQuery(internal.receipts.imageAccess, {
				id: url.searchParams.get('receipt') as Id<'receipts'>,
				position: Number(url.searchParams.get('position'))
			});
			if (!image) return new Response(null, { status: 404, headers: headers(request) });
			const blob = await ctx.storage.get(image.storageId);
			return new Response(blob, {
				headers: { ...headers(request), 'Content-Type': blob?.type ?? 'image/jpeg' }
			});
		} catch {
			return new Response(null, { status: 403, headers: headers(request) });
		}
	})
});
export default http;
