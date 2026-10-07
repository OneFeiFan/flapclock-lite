# 翻牌钟简化版 · 接口与实时协议

服务端是 Node（Express + WebSocket），数据存放在 `server/data/`，均为 JSON 文件：

- `tournaments/*.json`：赛事。
- `displays.json`：屏幕。
- `schemes.json`：盲注方案。

页面地址：

- **遥控页（手机）**：`/`
- **大屏页（电视）**：`/tv/`。安卓外壳只允许加载这个路径，页面内默认进入 `#/display`。没有指定比赛时显示待机页：二维码指向 `/#/?screen=设备编号`，手机打开后直接为这块屏幕选择比赛；页面上同时显示本机编号（设备编号的后 6 位），方便在手机上找到这块屏幕。

## 访问与操作人

暂时不需要登录，任何能访问这个地址的设备都能操作，适合在局域网内使用。以后部署到公网时，需要另外加上访问控制。

操作日志里的“操作人”是手机自己的名称。手机首次打开时在本地自动生成，比如“手机 3F2A”，之后可以修改。

- **REST 请求**：放在请求头 `X-Client` 里，值为 `encodeURIComponent(名称)`。
- **WebSocket**：放在 `hello` 消息的 `name` 字段里。

没有提供名称时，记为“手机”。

## 规则（`shared/structure.mjs`，前后端共用）

| 规则 | 值 |
|---|---|
| 盲注方案数量 | 最多 5 套 |
| 每套结构行数 | 最多 50 行（含休息），至少一个盲注级别 |
| 截止买入休息 | 带 `regEnd: true` 的休息，每套最多一个 |
| 常驻信息栏 | 最多 3 行，每行 24 字 |
| 走字灯文字 | 最多 200 字 |
| 进行中修改 | 比赛进行中或暂停时，当前项及之前的行锁定（不能修改，也不能在前面插入或删除）；未开始和已结束的比赛不锁 |

## 数据结构

**级别**：

```
{ id, type: 'level' | 'break', no, sb, bb, ante, minutes, note, regEnd }
```

- `no` 是盲注级别的序号，休息为 `null`。
- `regEnd` 只对休息有意义，表示截止买入休息。

**方案**：

```
{ id, name, endMode: 'overtime' | 'stop', levels, version, updatedAt,
  rows, plays, minutes, regEnd, usedBy: [{ id, name, status, locked }] }
```

- `rows`、`plays`、`minutes`、`regEnd` 是统计值：总行数、盲注级别数、总时长（分钟）、是否有截止买入休息。
- `usedBy` 列出正在使用这套方案的比赛，`locked` 是该比赛当前锁定的行数。编辑页据此把前面的行置灰。

**赛事设置 `settings`**：

```
{ name, club, theme, numberFormat, flash,
  infoText,                              // 常驻信息栏，用 \n 分行
  marquee: { text, enabled },            // 走字灯的常驻循环文字
  modules: { next, brk } }               // 大屏统计项：下一级、距休息
```

**走字带**：一次性公告（`notice` 命令）和常驻循环文字共用一条走字带。

- **播放顺序**：排队的公告优先，依次播放；没有公告时循环播放常驻文字。
- **安静规则**：升级后 3 秒，以及每级最后 10 秒，不放新内容。
- **多屏同步**：每段内容由服务端定好开始时刻 `startAt`，各屏按同步后的服务器时间计算位置，所以多块屏同步滚动。
- **修改循环文字**：正在播放的旧文字会立即撤下，新内容马上开始。

**赛事结构 `structure`**：

```
{ version, endMode, levels, schemeId, schemeName }
```

`endMode` 是旧字段，已经不再使用：最后一级的时间走完，比赛就自动结束（见下文）。

`schemeId` 为 `null` 表示不跟随任何方案（来源方案被删除了）。

**赛事状态 `state`**：

```
{ status: 'pristine' | 'running' | 'paused' | 'finished', levelIndex, remainingAtAnchorMs, anchorServerMs }
```

当前级和剩余时间用 `shared/clock.mjs` 的 `advance(state, structure, 服务器时间)` 计算。

**自动结束**：最后一级的时间走完，比赛就结束，不再有超时正计时。`advance` 返回 `ended: true`，剩余时间停在 0；服务端在结束的那一刻自动记一条 `end` 命令（`payload.auto` 为 `true`，操作人为“系统”，日志显示“比赛结束（自动）”）。`endsAt(state, structure)` 返回进行中的比赛预计在哪一刻结束。

## REST 接口

错误统一返回 `{ error: 给用户看的原因, code }`：

| code | HTTP 状态 | 含义 |
|---|---|---|
| `conflict` | 409 | 版本落后：别人刚改过，请重新加载 |
| `locked` | 409 | 进行中的比赛不能改这一行（原因里会写明是哪一级） |
| `invalid` | 400 | 内容不合规 |
| `limit` | 400 | 超出数量上限 |
| `notfound` | 404 | 不存在 |

| 方法与路径 | 说明 |
|---|---|
| `GET /api/time` | 服务器时间 `{ serverMs }` |
| `GET /api/schemes` | 方案列表（首次启动时为空） |
| `GET /api/schemes/recommended` | 推荐方案 `{ name, endMode, levels }`：18 级、每级 20 分钟、每 4 级休息 15 分钟。只返回内容不保存，手机上选择“使用推荐方案”后再用 `POST /api/schemes` 保存 |
| `POST /api/schemes` `{ name, levels, endMode }` | 新建方案 |
| `PUT /api/schemes/:id` `{ name?, levels?, endMode?, baseVersion }` | 修改方案，并同步到正在使用它的比赛。只要有一场比赛不满足锁定规则，就整体拒绝 |
| `POST /api/schemes/:id/duplicate` | 复制方案，副本使用新的行 id |
| `DELETE /api/schemes/:id` | 删除方案；使用它的比赛保留自己的结构，不再跟随更新 |
| `POST /api/structures/generate` `{ startStack, levelMinutes, targetHours, breakEvery, breakMinutes, anteMode }` | 按参数生成一套结构（只返回结果，不保存） |
| `GET /api/tournaments` | 赛事列表，每项带 `screens`（绑定的屏幕数） |
| `POST /api/tournaments` `{ name, club?, schemeId? }` | 新建赛事；不指定方案时使用第一套；方案库为空时返回 `invalid`（请先创建一套盲注方案） |
| `GET /api/tournaments/:id` | 赛事详情，带 `locked` |
| `DELETE /api/tournaments/:id?moveTo=赛事ID` | 删除赛事。正在显示它的屏幕改为显示 `moveTo` 指定的赛事；不带 `moveTo` 时回到待机页。返回 `{ ok, moved }` |
| `PUT /api/tournaments/:id/settings` | 修改设置（只传要改的字段） |
| `PUT /api/tournaments/:id/structure` `{ levels, endMode, baseVersion }` | 直接修改这场比赛的结构，同样受锁定规则约束 |
| `POST /api/tournaments/:id/scheme` `{ schemeId }` | 把方案用到这场比赛上 |
| `POST /api/tournaments/:id/commands` `{ cmd }` | 下发命令（和实时通道里的 `cmd` 等价） |
| `GET /api/tournaments/:id/log` | 最近 300 条操作日志，从新到旧，每条带 `label` 和 `issuer` |
| `GET /api/displays` | 屏幕列表：在线的屏幕，以及已指定比赛的离线屏幕。每项为 `{ id, name, label（本机编号）, tid, online }`，`tid` 为空表示待机 |
| `PUT /api/displays/:id` `{ name?, tid? }` | 改名；`tid` 为某场比赛时让这块屏幕显示它，为 `null` 时停止显示（回到待机页） |
| `POST /api/displays/:id/identify` | 让这块屏大字显示自己的名字 |
| `DELETE /api/displays/:id` | 停止显示，屏幕回到待机页 |

**命令 `cmd`**：

```
{ opId, type, payload, baseVersion, pressedAt? }
```

`type` 可以是：`start`、`resume`、`pause`、`next`、`prev`、`jump`（`{ index, remainingMs? }`）、`add`（`{ deltaMs }`）、`setRemaining`（`{ ms }`）、`end`、`reset`，以及一次性公告 `notice`（`{ text }`，最多 40 字，内容为空时返回 `empty`）。

- **相对命令要检查版本**：`next`、`prev`、`jump`、`add`、`setRemaining` 的 `baseVersion` 必须等于当前版本，否则返回 `conflict`。这样两个人同时按“下一级”只会跳一级。
- **重复提交只执行一次**：同一个 `opId` 重复提交时只执行一次。
- **断网补发的暂停**：带上 `pressedAt`，60 秒内送达、并且期间没有人改动过，就按按下的时刻生效。

## 实时通道 `/ws`

| 方向 | 消息 | 说明 |
|---|---|---|
| 双向 | `ping { c0 }` → `pong { c0, s }` | 对时：客户端发出时的 `performance.now()` 原样带回，`s` 为服务器时间 |
| 大屏 → | `hello { role: 'display', deviceId, label }` | 待机时回 `hello { paired: false }`；已指定比赛时回 `hello { paired: true }` + `display { name }` + `snap` + `msgs` |
| 手机 → | `hello { role: 'admin', name, tid? }` | 回 `hello { name }` + `presence`；带 `tid` 等同于再发一次 `watch` |
| 手机 → | `watch { tid }` | 查看某场赛事，之后会收到它的 `snap`；赛事不存在时回 `gone` |
| 手机 → | `cmd { tid, cmd }` | 回 `ack { opId, ok, reason, version, type }` |
| → 双方 | `snap { tid, version, state, structure, settings, recent, serverMs }` | 赛事有变化时推送，另外每 10 秒推送一次全量快照当作心跳 |
| → 大屏 | `msg { m: { id, type: 'notice' \| 'loop', from, text, startAt, estW } }` | 走字带上新的一段内容；`msgs { list }` 是加入时正在播放的内容；`retract { id }` 表示撤下某段内容 |
| → 手机 | `presence { displays }` | 屏幕上线、下线、绑定、改名时推送 |
| → 手机 | `schemes` / `tournaments` | 方案库或赛事列表有变化，手机重新拉取 |
| → 大屏 | `paired` / `unpaired` / `identify { name, label }` / `replaced` | 开始显示某场比赛、停止显示（回到待机页）、识别；同一设备在别处打开时，旧连接收到 `replaced` |
| → | `error { reason }` | `forbidden`：未知角色 |
