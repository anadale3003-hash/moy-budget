// Separate Cloudflare Worker for the 'Мой бюджет' PWA.
// Stage 1: GitHub deployment/health check. NO push delivery yet.
// Do not store user budget records here.
export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (request.method !== 'GET') return new Response('Method not allowed', { status: 405 });
    if (url.pathname !== '/' && url.pathname !== '/health') return new Response('Not found', { status: 404 });
    return Response.json({
      app: 'moy-budget-push',
      status: 'deployed',
      pushEnabled: false,
      note: 'GitHub deployment is ready. Subscription, VAPID secrets and push scheduling will be configured next.'
    }, { headers: { 'Cache-Control': 'no-store' } });
  },
  async scheduled(_event, _env, ctx) {
    // Placeholder: no notifications are sent before the client opts in.
    // Configured to wake at 08:30 Europe/Moscow (05:30 UTC).
    ctx.waitUntil(Promise.resolve());
  }
};
