import * as XLSX from 'xlsx';
import { loadAll } from '../../lib/store.mjs';

export const config = { path: '/api/export-xlsx' };

export default async () => {
  try {
    const { rounds, holeRecords } = await loadAll();

    const dataRows = rounds.map(r => ({
      날짜: r.date, 코스: r.course, No: r.no, Gross: r.gross, Net: r.net,
      Putts: r.putts, '3퍼팅': r.p3, GIR: r.gir, 'GIR%': r.girp != null ? Math.round(r.girp * 1000) / 10 : null,
      Alb: r.alb, Eagle: r.egl, Birdie: r.bir, Par: r.par, Bogey: r.bog, Double: r.dbl, 'Triple+': r.trp,
    }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dataRows), 'Data');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
      holeRecords.map(h => ({ No: h.no, 날짜: h.date, 코스: h.course, 홀: h.hole, 파: h.par, 스코어: h.score, 퍼팅: h.putt, 페널티: h.penalty, GIR: h.gir ? 1 : 0 }))
    ), 'HoleData');

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    return new Response(buf, {
      headers: {
        'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'content-disposition': `attachment; filename="golf_${today}.xlsx"`,
      },
    });
  } catch (e) {
    return Response.json({ error: String(e?.message || e) }, { status: 500 });
  }
};
