/* 盲注结构模板与生成器（PRD 6.2） */
import { normalizeLevels, clamp } from '../shared/clock.mjs';

var LADDER = [[25, 50], [50, 100], [100, 200], [150, 300], [200, 400], [300, 600], [400, 800], [500, 1000], [600, 1200], [800, 1600],
  [1000, 2000], [1200, 2400], [1500, 3000], [2000, 4000], [2500, 5000], [3000, 6000], [4000, 8000], [5000, 10000], [6000, 12000],
  [8000, 16000], [10000, 20000], [12000, 24000], [15000, 30000], [20000, 40000], [25000, 50000], [30000, 60000], [40000, 80000],
  [50000, 100000], [60000, 120000], [80000, 160000], [100000, 200000], [120000, 240000], [150000, 300000], [200000, 400000],
  [250000, 500000], [300000, 600000], [400000, 800000], [500000, 1000000]];

export function generateStructure(o) {
  o = o || {};
  var stack = clamp(+o.startStack || 30000, 100, 1e9);
  var minutes = clamp(Math.round(+o.levelMinutes || 20), 1, 120);
  var hours = clamp(+o.targetHours || 6, 1, 24);
  var every = clamp(Math.round(+o.breakEvery || 0), 0, 20);
  var bmin = clamp(Math.round(+o.breakMinutes || 15), 1, 60);
  var ante = o.anteMode === 'none' ? 'none' : 'bb';
  var count = Math.max(4, Math.round(hours * 60 / minutes));
  var start = 0;
  while (start < LADDER.length - 1 && LADDER[start][1] < stack / 150) start++;   // 起始大盲约为起始记分牌的 1/150
  var levels = [];
  for (var i = 0; i < count; i++) {
    var pair = LADDER[Math.min(start + i, LADDER.length - 1)];
    levels.push({ type: 'level', sb: pair[0], bb: pair[1], ante: ante === 'bb' ? pair[1] : 0, minutes: minutes });
    if (every && (i + 1) % every === 0 && i < count - 1) levels.push({ type: 'break', minutes: bmin, note: '' });
  }
  for (var k = 0; k < levels.length; k++) if (levels[k].type === 'break') { levels[k].note = '清小码'; break; }
  return normalizeLevels(levels);
}

export var TEMPLATES = {
  turbo: { name: '极速赛', desc: '每级 10 分钟，约 3 小时', params: { startStack: 20000, levelMinutes: 10, targetHours: 3, breakEvery: 6, breakMinutes: 10 } },
  regular: { name: '常规赛', desc: '每级 20 分钟，约 6 小时', params: { startStack: 30000, levelMinutes: 20, targetHours: 6, breakEvery: 4, breakMinutes: 15 } },
  deep: { name: '深筹赛', desc: '每级 30 分钟，约 9 小时', params: { startStack: 50000, levelMinutes: 30, targetHours: 9, breakEvery: 4, breakMinutes: 15 } }
};
export function presetStructure(key) {
  var t = TEMPLATES[key] || TEMPLATES.regular;
  return { levels: generateStructure(t.params), startStack: t.params.startStack };
}
export function listTemplates() {
  return Object.keys(TEMPLATES).map(function (k) { return { key: k, name: TEMPLATES[k].name, desc: TEMPLATES[k].desc, params: TEMPLATES[k].params }; });
}
