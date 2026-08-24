# DeskCalendar

一个面向 Windows 的网易邮箱大师桌面月历。程序直接读取网易邮箱大师客户端的本地 `calendar.db`，在桌面层按月展示日程和待办，并支持切换待办的完成状态。

> 本项目是非官方第三方工具，与网易及网易邮箱大师没有隶属或授权关系。

![Tauri](https://img.shields.io/badge/Tauri-2-24C8DB?logo=tauri&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=111)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![Platform](https://img.shields.io/badge/platform-Windows-0078D4?logo=windows)
![License](https://img.shields.io/badge/license-MIT-green)

## 功能

- 桌面月视图：每一天是独立单元格，直接显示当天日程和待办。
- 网易邮箱大师数据源：自动检测、手动选择并检查 `calendar.db` 是否可读。
- 日期信息：显示公历、农历和自定义周序号。
- 星期标题：支持 `星期一`、`Monday`、`Mon` 三种风格，默认 `Mon`。
- 灵活范围：显示 4～8 周，可调整首行对应的自然周和自定义第 1 周。
- 当日代办列表：单击日期或事项后，显示当天全部内容、时间、所属日历、地点和描述。
- 完成状态：
  - 双击月历中的待办切换完成/未完成；
  - 在代办列表中使用复选框切换；
  - 已完成待办显示删除线，并排在未完成待办下方。
- 外观设置：背景颜色、透明度、标题/日期/农历/事项的颜色和字号，以及事项圆点/竖线标记。
- 窗口行为：固定位置和大小、桌面底层显示、系统托盘显示/隐藏/退出。
- 开机启动：可在设置中启用或关闭。
- 单实例：重复启动只会唤起已经运行的程序。

## 适用条件

本项目适合以下环境：

- Windows 10 或 Windows 11，x64 架构；
- 已安装并登录网易邮箱大师 Windows 客户端；
- 邮箱大师已经在本地生成日历数据库；
- 希望继续使用邮箱大师创建、编辑和同步日程，只在桌面上增加常驻月历；
- 能接受第三方工具读取本地日历数据库，并在切换待办状态时修改两个状态字段。

默认数据库位置：

```text
%LOCALAPPDATA%\Netease\MailMaster\data\calendar.db
```

不同版本或安装环境可能使用其他位置，可在“显示设置 → 日历数据”中自动检测或手动选择。

## 数据读写说明

日程内容以只读方式查询。只有切换待办完成状态时会写入邮箱大师数据库，并且只针对 `IsTodo != 0` 的记录修改：

- 完成：`Status = 5`，`CompletedTime = 当前 Unix 时间`；
- 未完成：`Status = 4`，`CompletedTime = 0`。

写入使用 SQLite 事务和数据库忙锁等待。该方式已在当前版本的网易邮箱大师 Windows 客户端上验证能够被客户端识别，但网易没有公开此数据库格式，因此未来版本可能改变字段或同步行为。

建议在重要日历上使用前先备份 `calendar.db`。不要在程序运行期间手工复制、替换或编辑 `calendar.db-wal`、`calendar.db-shm`。

## 使用便携版

1. 获取 `DeskCalendar.exe`。
2. 确保网易邮箱大师至少启动并同步过一次日历。
3. 双击运行 `DeskCalendar.exe`。
4. 打开设置，在“日历数据”中点击“自动检测”。
5. 如果自动检测失败，手动选择邮箱大师的 `calendar.db`。
6. 点击“检查读取”，确认日历数量和事项数量可以正常读取。

程序依赖 Microsoft Edge WebView2 Runtime。Windows 10/11 和新版 Edge 通常已经包含；如果程序无法显示界面，请先安装或修复 WebView2 Runtime。

便携版没有代码签名，Windows SmartScreen 可能显示未知发布者提示。请从可信来源获取，并自行核对文件哈希。

## 开发环境

### 必需依赖

- Windows 10/11 x64；
- Node.js 20 LTS 或更高版本；
- npm；
- Rust stable MSVC 工具链；
- Visual Studio 2022 Build Tools：
  - Desktop development with C++；
  - Windows 10/11 SDK；
- Microsoft Edge WebView2 Runtime。

建议安装 Rust：

```powershell
winget install Rustlang.Rustup
rustup default stable-msvc
```

### 安装依赖

```powershell
git clone https://github.com/tianjiashu/desktop-calendar-tauri.git
cd desktop-calendar-tauri
npm install
```

### 开发运行

```powershell
npm run tauri dev
```

仅运行浏览器前端可以使用 `npm run dev`，但浏览器环境无法调用 Tauri IPC，也不能读取邮箱大师数据库。

### 测试

```powershell
npm test
cargo test --manifest-path .\src-tauri\Cargo.toml
```

### 构建免安装 EXE

```powershell
npm run tauri build -- --no-bundle
```

输出文件：

```text
src-tauri\target\release\desktop-calendar-tauri.exe
```

如果内存有限，可限制 Rust 并行任务：

```powershell
$env:CARGO_BUILD_JOBS = "1"
npm run tauri build -- --no-bundle
```

### 构建安装包

```powershell
npm run tauri build -- --bundles nsis
```

## 技术栈

| 层级 | 技术 |
| --- | --- |
| 桌面壳 | Tauri 2 |
| 前端 | React 18、TypeScript、Vite 6 |
| 月历 | FullCalendar 6 DayGrid |
| 图标与字体 | Phosphor Icons、Geist Sans/Mono |
| 本地数据库 | SQLite、rusqlite |
| 测试 | Vitest、Cargo test |

## 主要目录

```text
src/
├─ components/MonthView/       月历、代办列表和设置面板
├─ hooks/                      数据读取、设置和窗口状态
├─ services/                   Tauri IPC 封装
├─ types/                      TypeScript 数据类型
└─ utils/                      日期、周序号和列表排序逻辑

src-tauri/
├─ src/commands/               Tauri 命令
├─ src/db/mailmaster_repo.rs   邮箱大师 SQLite 读取和待办状态写入
├─ src/models/                 Rust 数据模型
└─ capabilities/               Tauri 权限配置
```

仓库中仍保留部分早期 DayPilot/MCP/周视图实验代码，但当前应用入口只启用 `MonthView`，这些实验模块不属于当前产品功能。

## 已知限制

- 仅在 Windows 版网易邮箱大师的当前本地数据库结构上验证。
- 暂不支持创建、编辑、删除日程或修改待办描述。
- 完成状态写回依赖网易邮箱大师未公开的 SQLite 字段，客户端升级后可能失效。
- 云端同步是否立即发生由网易邮箱大师自身决定；本项目不直接调用网易服务器接口。
- 重复日程、共享日历和第三方账户的边界情况尚未完整覆盖。
- 便携版未签名、未提供自动更新。

## 隐私与安全

- 日历数据直接在本机读取，不会由本项目上传到第三方服务。
- 数据库路径等设置保存在应用 WebView 的本地存储中。
- 仓库已忽略数据库、WAL/SHM、备份、日志、环境变量、构建目录和便携版产物。
- 提交 Issue 时请勿上传真实 `calendar.db`、日志中的个人日程、邮箱地址或本机绝对路径。

## 免责声明

本项目使用网易邮箱大师未公开的本地数据库结构，可能因客户端升级而失效。使用写回功能前请自行备份数据。作者不对数据丢失、同步冲突或第三方客户端行为变化承担责任。

## License

[MIT](LICENSE)
