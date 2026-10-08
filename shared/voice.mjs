/*
 * 升盲语音播报：比较前后两帧的计时状态，判断这一刻要播语音包里的哪一句（返回文件名，如 level-07），不需要播报时返回 null。
 * 语音包放在 web/public/voice/，文件名见其中的 manifest.json。
 *
 * 不播报的情况：第一次看到状态（屏幕刚打开、刚重连）、两帧相隔太久（盒子休眠后醒来）、换了比赛、暂停中。
 * opts（赛事设置 settings.voice）：events 开赛/升级/休息/结束；levelOneMin、breakOneMin、levelFiveMin 剩余时间提醒。
 */
function pad2(n) { return n < 10 ? '0' + n : String(n); }

export var VOICE_MAX_LEVEL = 50;

/** frame：{ tid, at（毫秒，单调时钟）, status, li, rem（剩余毫秒）, entry（当前项：{ type, no, regEnd }） } */
export function voiceClip(prev, cur, opts) {
  if (!prev || !cur || !opts || prev.tid !== cur.tid || cur.at - prev.at > 2000) return null;
  if (cur.status === 'finished') return prev.status !== 'finished' && opts.events ? 'end' : null;
  if (cur.status !== 'running') return null;
  if (prev.status === 'pristine') return opts.events ? 'start' : null;
  if (cur.li !== prev.li) {
    var e = cur.entry;
    if (!opts.events || !e) return null;
    if (e.type === 'break') return e.regEnd ? 'regend' : 'break';
    return e.no >= 1 && e.no <= VOICE_MAX_LEVEL ? 'level-' + pad2(e.no) : null;
  }
  if (prev.status !== 'running') return null;                     // 刚从暂停恢复，不补念
  var crossed = function (t) { return prev.rem > t && cur.rem <= t && cur.rem > t - 3000; };
  if (cur.entry && cur.entry.type === 'break') return opts.breakOneMin && crossed(60000) ? 'break-1min' : null;
  if (opts.levelOneMin && crossed(60000)) return 'level-1min';
  if (opts.levelFiveMin && crossed(300000)) return 'level-5min';
  return null;
}

/** 一场比赛里可能用到、值得提前加载的语音：固定句子 + 当前和下一个级别 */
export function voicePreload(levels, li) {
  var out = ['start', 'end', 'break', 'regend', 'level-1min', 'break-1min', 'level-5min'];
  for (var i = li; i < Math.min(levels.length, li + 3); i++) {
    var e = levels[i];
    if (e && e.type !== 'break' && e.no >= 1 && e.no <= VOICE_MAX_LEVEL) out.push('level-' + pad2(e.no));
  }
  return out;
}
