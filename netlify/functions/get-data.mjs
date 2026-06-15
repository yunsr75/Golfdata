import { loadAll } from '../../lib/store.mjs';

export const config = { path: '/api/data' };

export default async () => {
  try {
    const { rounds, holeData, streak } = await loadAll();
    return Response.json({ rounds, holeData, streak }, {
      headers: { 'cache-control': 'no-store' },
    });
  } catch (e) {
    return Response.json({ error: String(e?.message || e) }, { status: 500 });
  }
};
