/*
 * 盲注结构与方案的规则（前后端共用：后端校验，遥控端据此提示和置灰）。
 *  - 每套结构最多 50 行（含休息），至少一个盲注级别；
 *  - “截止买入休息”是带 regEnd 标记的休息，每套最多一个；
 *  - 比赛进行中（含暂停）修改结构时，当前项及之前的行锁定，只能改后面的。
 */
export var MAX_ROWS = 50;
export var MAX_SCHEMES = 5;
export var INFO_LINES = 3;
export var INFO_LINE_MAX = 24;
export var MARQUEE_MAX = 200;

/** 校验一套结构，通过返回 null，否则返回给用户看的原因 */
export function structureError(levels) {
  if (!Array.isArray(levels) || !levels.length) return '盲注结构至少需要一级';
  if (levels.length > MAX_ROWS) return '盲注结构最多 ' + MAX_ROWS + ' 行（含休息）';
  var plays = 0, regEnds = 0;
  for (var i = 0; i < levels.length; i++) {
    if (levels[i].type === 'break') { if (levels[i].regEnd) regEnds++; } else plays++;
  }
  if (!plays) return '盲注结构至少需要一个盲注级别';
  if (regEnds > 1) return '截止买入休息只能有一个';
  return null;
}

/** 锁定的行数：进行中或暂停时，当前项及之前都不能改；未开始和已结束不锁 */
export function lockedCount(status, currentIndex) {
  return status === 'running' || status === 'paused' ? currentIndex + 1 : 0;
}

export function rowLabel(e) {
  if (!e) return '';
  if (e.type === 'break') return e.regEnd ? '截止买入休息' : '休息';
  return '第 ' + e.no + ' 级';
}

function sameRow(a, b) {
  return !!a && !!b && a.id === b.id && a.type === b.type && a.minutes === b.minutes &&
    (a.sb | 0) === (b.sb | 0) && (a.bb | 0) === (b.bb | 0) && (a.ante | 0) === (b.ante | 0) && !!a.regEnd === !!b.regEnd;
}

/**
 * 进行中修改：前 locked 行必须原样保留（同一行、同样的数值，顺序不变）。
 * 违反时返回原因，否则返回 null。两边都应是 normalizeLevels 之后的结构。
 */
export function lockViolation(oldLevels, newLevels, locked) {
  for (var i = 0; i < locked; i++) {
    if (!sameRow(oldLevels[i], newLevels[i])) {
      var label = rowLabel(oldLevels[i]);
      return i === locked - 1 ? label + '正在进行，不能修改，也不能在它前面插入或删除' : label + '已经结束，不能修改';
    }
  }
  return null;
}
