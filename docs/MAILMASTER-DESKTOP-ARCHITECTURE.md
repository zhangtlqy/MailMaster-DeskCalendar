# DeskCalendar 架构与开发说明

## 产品边界

- 只读展示网易邮箱大师本地日历。
- 不提供创建、修改、删除、拖拽改期或写回。
- 不启动上游 DayPilot MCP Server。
- 不创建第二份运行时日历数据库。
- 每 60 秒自动刷新，也可手动刷新。

## 架构

```text
FullCalendar React dayGridMonth
              │
       useMailMasterEvents
              │ Tauri IPC
       list_mailmaster_events
              │
       mailmaster_repo (Rust)
              │ SQLite OPEN_READ_ONLY
 calendar.db + calendar.db-wal
```

数据库默认位置：

```text
%LOCALAPPDATA%\Netease\MailMaster\data\calendar.db
```

Rust 层每次查询建立 `SQLITE_OPEN_READ_ONLY` 连接，只查询 `Events` 与 `Calendars`。日期范围采用重叠判断，避免漏掉跨日事项：

```sql
e.DTEnd > range_start AND e.DTStart < range_end
```

## UI

- FullCalendar `dayGridMonth` 固定六周网格。
- 周一作为每周第一天，使用简体中文 locale。
- 日期格显示公历日和浏览器 `Intl` 中国农历日。
- 全天、定时和跨日事项由 FullCalendar 布局。
- 单元格空间不足时显示“更多”入口。
- 点击事项仅打开只读详情卡片。

## 桌面行为

Tauri 窗口默认尺寸为 `1180 × 760`，最小尺寸为 `860 × 560`：

- `decorations: false`
- `skipTaskbar: true`
- `alwaysOnBottom: true`
- `resizable: true`

没有关闭按钮，也不会因失焦隐藏。托盘菜单只提供“显示日历”和明确的“退出”。

## 构建

```powershell
npm install
npm run build
npm test

$env:PATH = "$env:USERPROFILE\.cargo\bin;$env:PATH"
npm run tauri build -- --debug --no-bundle
```

Debug 可执行文件：

```text
src-tauri\target\debug\desktop-calendar-tauri.exe
```

## 验证

- TypeScript/Vite 生产构建通过。
- 前端原有 239 项测试通过。
- Rust 单元和集成测试通过。
- 本机真实邮箱大师数据库只读查询通过。
- 查询前后 `calendar.db` 和 `calendar.db-wal` 的长度及修改时间保持不变。
