# Easy Agent Pilot

<div align="center">
  <img src="images/main-interface.png" alt="Easy Agent Pilot" width="800">
</div>

一个基于 **Tauri 2 + Vue 3** 构建的 AI Agent 桌面管理工具，提供智能对话、项目管理、计划管理、记忆管理等功能，帮助开发者更高效地与 AI 协作。

## 特性

### 核心功能

- **智能对话** - 支持多种 AI 模型，流式输出，代码高亮显示
- **项目管理** - 多项目支持，快速切换，文件树浏览
- **计划管理** - 创建开发计划，任务看板，进度跟踪
- **记忆管理** - 分类存储重要信息，快速检索
- **文件编辑** - 内置 Monaco 编辑器，支持语法高亮

### 高级特性

- **MCP 插件** - 支持 Model Context Protocol，扩展 AI 能力
- **技能市场** - 一键安装各种技能扩展
- **多智能体** - 支持配置多个 AI Agent，灵活切换
- **主题定制** - 支持亮色/暗色主题，自定义配色
- **国际化** - 支持中文/英文多语言

## 截图

### 主界面

<div align="center">
  <img src="images/main-interface.png" alt="主界面" width="700">
</div>

工作区包含文件树、会话列表和消息区域，提供完整的开发工作流支持。

### 智能对话

<div align="center">
  <img src="images/chat-session.png" alt="会话聊天" width="700">
</div>

支持流式输出、代码高亮、智能体选择等功能。

### 智能体选择

<div align="center">
  <img src="images/agent-selector.png" alt="智能体选择器" width="700">
</div>

轻松切换不同的 AI Agent 和模型。

### 计划管理

<div align="center">
  <img src="images/plan-mode.png" alt="计划模式" width="700">
</div>

创建和管理开发计划，支持任务分解和进度跟踪。

### 任务看板

<div align="center">
  <img src="images/task-board.png" alt="任务看板" width="700">
</div>

可视化任务管理，支持待办、进行中、已完成等状态。

### 记忆管理

<div align="center">
  <img src="images/memory-mode.png" alt="记忆管理" width="700">
</div>

分类存储重要信息，支持快速检索和编辑。

### 文件编辑器

<div align="center">
  <img src="images/file-editor.png" alt="文件编辑器" width="700">
</div>

内置 Monaco 编辑器，支持语法高亮和代码编辑。

### 设置

| 通用设置 | Agent 配置 |
|:---:|:---:|
| <img src="images/settings-general.png" alt="通用设置" width="350"> | <img src="images/settings-agents.png" alt="Agent 配置" width="350"> |

| 技能配置 | 主题设置 |
|:---:|:---:|
| <img src="images/settings-lsp.png" alt="技能配置" width="350"> | <img src="images/settings-theme.png" alt="主题设置" width="350"> |

### 技能市场

<div align="center">
  <img src="images/marketplace.png" alt="技能市场" width="700">
</div>

浏览和安装各种技能扩展，增强 AI 能力。

## 安装

### 系统要求

- **macOS**: 10.15 (Catalina) 或更高版本
- **Windows**: Windows 10 或更高版本
- **Linux**: 主流发行版 (Ubuntu 20.04+, Fedora 36+ 等)

### 下载安装

前往 [Releases](https://github.com/your-username/easy-agent-pilot/releases) 页面下载对应平台的安装包：

- **macOS**: `.dmg` 或 `.app`
- **Windows**: `.msi` 或 `.exe`
- **Linux**: `.AppImage` 或 `.deb`

## 快速开始

### 1. 导入项目

点击侧边栏的"工作区"按钮，然后点击"导入项目"选择你的项目目录。

### 2. 配置智能体

使用 `Cmd+,` (macOS) 或 `Ctrl+,` (Windows/Linux) 打开设置，在"Agent 配置"中添加你的 AI API 密钥。

### 3. 开始对话

选择一个智能体，在输入框中输入你的问题或任务，即可开始与 AI 协作。

## 技术栈

- **[Tauri 2](https://tauri.app/)** - 跨平台桌面应用框架
- **[Vue 3](https://vuejs.org/)** - 渐进式 JavaScript 框架
- **[TypeScript](https://www.typescriptlang.org/)** - 类型安全的 JavaScript
- **[Naive UI](https://www.naiveui.com/)** - Vue 3 组件库
- **[Tailwind CSS](https://tailwindcss.com/)** - 原子化 CSS 框架
- **[Monaco Editor](https://microsoft.github.io/monaco-editor/)** - 代码编辑器
- **[Pinia](https://pinia.vuejs.org/)** - Vue 状态管理
- **[SQLite](https://www.sqlite.org/)** - 本地数据库

## 开发

### 环境准备

1. 安装 [Node.js](https://nodejs.org/) (v18+)
2. 安装 [pnpm](https://pnpm.io/)
3. 安装 [Rust](https://www.rust-lang.org/)
4. 安装 Tauri CLI 依赖（参考 [Tauri 官方文档](https://tauri.app/start/create-project/)）

### 本地开发

```bash
# 克隆仓库
git clone https://github.com/your-username/easy-agent-pilot.git
cd easy-agent-pilot

# 安装依赖
pnpm install

# 启动开发服务器
pnpm tauri dev
```

### 构建发布

```bash
# 构建生产版本
pnpm tauri build
```

### 项目结构

```
easy-agent-pilot/
├── src/                    # Vue 前端源码
│   ├── components/         # Vue 组件
│   ├── stores/             # Pinia 状态管理
│   ├── services/           # 服务层
│   ├── locales/            # 国际化文件
│   └── types/              # TypeScript 类型定义
├── src-tauri/              # Tauri 后端源码
│   ├── src/                # Rust 源码
│   └── tauri.conf.json     # Tauri 配置
├── images/                 # 文档截图
└── package.json            # 项目配置
```

## 许可证

[MIT License](LICENSE)

---

<div align="center">
  Made with ❤️ by Easy Agent Team
</div>
