export default {
  async fetch(request, env) {
    const response = await env.ASSETS.fetch(request);

    if (response.status === 404 && request.method === 'GET') {
      const fallback = new URL('/', request.url);
      return env.ASSETS.fetch(new Request(fallback, request));
    }

    return response;
  },
};
