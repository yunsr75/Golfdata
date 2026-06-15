import { getStore } from '@netlify/blobs';
import seedRounds from '../data/golf_data.json' with { type: 'json' };
import seedHole from '../data/hole_data.json' with { type: 'json' };
import seedStreak from '../data/streak_data.json' with { type: 'json' };

const K = { rounds: 'rounds', holeData: 'holeData', streak: 'streak', holeRecords: 'holeRecords' };
const store = () => getStore({ name: 'golf', consistency: 'strong' });

// 최초 호출 시 번들된 JSON으로 Blobs를 시드한다. 이후엔 Blobs가 원본(source of truth).
export async function loadAll() {
  const s = store();
  let rounds = await s.get(K.rounds, { type: 'json' });
  if (!rounds) {
    rounds = seedRounds;
    await Promise.all([
      s.setJSON(K.rounds, seedRounds),
      s.setJSON(K.holeData, seedHole),
      s.setJSON(K.streak, seedStreak),
      s.setJSON(K.holeRecords, []),
    ]);
  }
  const [holeData, streak, holeRecords] = await Promise.all([
    s.get(K.holeData, { type: 'json' }),
    s.get(K.streak, { type: 'json' }),
    s.get(K.holeRecords, { type: 'json' }),
  ]);
  return {
    rounds,
    holeData: holeData || seedHole,
    streak: streak || seedStreak,
    holeRecords: holeRecords || [],
  };
}

export async function saveAll({ rounds, holeData, streak, holeRecords }) {
  const s = store();
  const ops = [];
  if (rounds) ops.push(s.setJSON(K.rounds, rounds));
  if (holeData) ops.push(s.setJSON(K.holeData, holeData));
  if (streak) ops.push(s.setJSON(K.streak, streak));
  if (holeRecords) ops.push(s.setJSON(K.holeRecords, holeRecords));
  await Promise.all(ops);
}
