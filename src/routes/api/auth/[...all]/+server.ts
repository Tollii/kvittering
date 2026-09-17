import { PUBLIC_CONVEX_SITE_URL } from '$app/env/public';
import type { RequestHandler } from '@sveltejs/kit';
const handler: RequestHandler = async ({ request, url }) => {
	const destination = new URL(url.pathname + url.search, PUBLIC_CONVEX_SITE_URL);
	const headers = new Headers(request.headers);
	headers.delete('host');
	headers.delete('content-length');
	headers.set('accept-encoding', 'identity');
	const response = await fetch(destination, {
		method: request.method,
		headers,
		body: request.method === 'GET' ? undefined : await request.arrayBuffer(),
		redirect: 'manual'
	});
	const output = new Headers(response.headers);
	output.delete('content-encoding');
	output.delete('content-length');
	output.set('cache-control', 'no-store');
	return new Response(response.body, { status: response.status, headers: output });
};
export const GET = handler;
export const POST = handler;
