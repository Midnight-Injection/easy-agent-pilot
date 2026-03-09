# 代码审查报告 - mcp 模块

> 审查日期: 2026-03-09
> 审查范围: `src-tauri/src/commands/mcp.rs`, `builtin_mcp.rs`, `mcp_market.rs`

## 文件概览

| 文件 | 行数 | 说明 |
|------|------|------|
| `mcp.rs` | 1360 | MCP 服务器管理核心逻辑 |
| `builtin_mcp.rs` | 229 | 内置 MCP 服务器实现 |
| `mcp_market.rs` | 1895 | MCP 市场相关功能 |
| **总计** | **3484** | |

---

## 架构分析

### MCP 服务器类型支持

```
┌─────────────────────────────────────────────────────────────┐
│                      McpServer                              │
│  - stdio: 通过命令行启动的本地 MCP 服务器                    │
│  - http/sse: 通过 HTTP 连接的远程 MCP 服务器                 │
│  - builtin: 内置的 MCP 服务器（无需外部依赖）                │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   rmcp SDK (官方 Rust 实现)                  │
│  - TokioChildProcess: stdio 传输                            │
│  - StreamableHttpClientTransport: HTTP 传输                  │
└─────────────────────────────────────────────────────────────┘
```

---

## 问题分析

### 🔴 高优先级问题

#### 1. stdio/http 逻辑大量重复

- **位置**: `mcp.rs` L570-709, L855-1033, L1083-1260
- **问题**: `test_mcp_connection`, `list_mcp_tools`, `call_mcp_tool` 三个操作都有相似的 stdio/http 分支逻辑

**重复模式**:
```rust
// test_mcp_connection
match server_type.as_str() {
    "http" => test_http_mcp(...).await,
    _ => test_stdio_mcp(...).await,
}

// list_mcp_tools
match server_type.as_str() {
    "http" => list_http_mcp_tools(...).await,
    _ => list_stdio_mcp_tools(...).await,
}

// call_mcp_tool
match server_type.as_str() {
    "http" => call_http_mcp_tool(...).await,
    _ => call_stdio_mcp_tool(...).await,
}
```

**建议**: 使用策略模式或 trait 统一抽象

```rust
#[async_trait]
trait McpTransport {
    async fn connect(&self) -> Result<McpConnection>;
    async fn list_tools(&self) -> Result<Vec<McpTool>>;
    async fn call_tool(&self, name: &str, params: Value) -> Result<Value>;
    async fn disconnect(&self);
}

struct StdioTransport { ... }
struct HttpTransport { ... }
```

#### 2. mcp_market.rs 文件过大

- **位置**: 整个文件
- **问题**: 1895 行，包含大量模拟数据
- **影响**: 可维护性差

**建议**: 拆分文件

```
mcp_market/
├── mod.rs           # 主要命令和类型定义
├── types.rs         # 数据结构
├── api.rs           # API 调用逻辑
└── mock_data.rs     # 模拟数据
```

### 🟡 中优先级问题

#### 3. 未使用的枚举 McpCategory

- **位置**: `mcp_market.rs` L9-43
- **问题**: `McpCategory` 枚举定义但被标记为 `#[allow(dead_code)]`

```rust
#[allow(dead_code)]
pub enum McpCategory {
    Database,
    FileSystem,
    // ...
}
```

**建议**: 删除或在代码中使用

#### 4. 使用 eprintln! 而非日志框架

- **位置**: 多处
- **问题**: 使用 `eprintln!` 输出日志

```rust
eprintln!("[MCP] Using rmcp HTTP transport to test HTTP MCP server: {}", url);
```

**建议**: 使用 `tracing` 或 `log` crate

```rust
use tracing::{info, error};

info!(url = %url, "Using rmcp HTTP transport to test MCP server");
```

#### 5. 错误处理不一致

- **位置**: `mcp.rs` L383-387, L466-473
- **问题**: 部分错误被忽略，只打印警告

```rust
if let Err(e) = write_mcp_to_config_file(&server) {
    eprintln!("警告: 写入 MCP 配置文件失败: {}", e);
    // 继续返回成功，因为数据库写入已成功
}
```

**建议**: 根据业务需求决定是否应该回滚数据库操作

#### 6. URL 编码实现简陋

- **位置**: `mcp_market.rs` L153-158
- **问题**: 手动实现 URL 编码，不完整

```rust
let encoded = search
    .replace(' ', "%20")
    .replace('&', "%26")
    .replace('=', "%3D")
    .replace('+', "%2B");
```

**建议**: 使用 `urlencoding` crate

```rust
let encoded = urlencoding::encode(search);
```

### 🟢 低优先级问题

#### 7. 硬编码的配置路径

- **位置**: `mcp.rs` L113-127
- **问题**: MCP 配置路径硬编码

```rust
fn get_mcp_config_path(server_type: &str) -> Result<PathBuf, String> {
    match server_type {
        "stdio" => Ok(home.join(".claude.json")),
        "http" => Ok(config_dir.join("mcp-http.json")),
        // ...
    }
}
```

**建议**: 使用配置常量

#### 8. 缺少超时控制

- **位置**: `mcp.rs` L662-684
- **问题**: MCP 连接没有超时控制

**建议**: 添加超时包装

```rust
match tokio::time::timeout(
    std::time::Duration::from_secs(30),
    service.list_tools(Default::default())
).await {
    Ok(result) => result,
    Err(_) => return McpTestResult {
        success: false,
        message: "连接超时".to_string(),
        tool_count: None,
    },
}
```

---

## 设计亮点

### 1. 内置 MCP 服务器

`builtin_mcp.rs` 设计良好：
- 无需外部依赖
- 提供基础测试工具
- 有完整的单元测试

```rust
#[cfg(test)]
mod tests {
    #[tokio::test]
    async fn test_echo_tool() { ... }
    #[tokio::test]
    async fn test_add_tool() { ... }
}
```

### 2. 跨平台命令构建

`build_platform_command` 函数处理了 Windows 上 npx/npm 的特殊情况：

```rust
#[cfg(target_os = "windows")]
{
    let script_commands = ["npx", "npm", "yarn", "pnpm", "bun"];
    if script_commands.contains(&command) {
        // 使用 cmd.exe /C 来执行脚本命令
    }
}
```

### 3. 配置文件同步

数据库和配置文件同步更新的设计：

```rust
// 更新数据库
conn.execute(...)?;

// 同步更新配置文件
if let Some((old_type, old_name)) = old_server {
    if old_type != server_type || old_name != input.name {
        let _ = remove_mcp_from_config_file(&old_type, &old_name);
    }
}
let _ = write_mcp_to_config_file(&updated_server);
```

---

## 优化建议

### 1. 引入 MCP Transport Trait

```rust
#[async_trait]
pub trait McpTransport: Send + Sync {
    async fn list_tools(&self) -> Result<Vec<McpTool>, String>;
    async fn call_tool(&self, name: &str, params: Value) -> Result<Value, String>;
}

pub struct StdioMcpTransport { ... }
pub struct HttpMcpTransport { ... }
pub struct BuiltinMcpTransport;

impl McpTransport for StdioMcpTransport { ... }
impl McpTransport for HttpMcpTransport { ... }
impl McpTransport for BuiltinMcpTransport { ... }
```

### 2. 统一错误类型

```rust
#[derive(Debug, thiserror::Error)]
pub enum McpError {
    #[error("Connection failed: {0}")]
    ConnectionFailed(String),
    #[error("Tool not found: {0}")]
    ToolNotFound(String),
    #[error("Configuration error: {0}")]
    ConfigError(String),
}
```

### 3. 添加连接池

对于频繁调用的 HTTP MCP 服务器，考虑添加连接复用：

```rust
use std::sync::Arc;
use tokio::sync::RwLock;

pub struct McpConnectionPool {
    connections: RwLock<HashMap<String, Arc<McpConnection>>>,
}
```

---

## 设计模式重构方案

### 问题分析

`mcp.rs` 中存在大量的 if-else 分支模式，主要用于区分不同的 MCP 传输类型（stdio、http、builtin）：

```rust
// 重复模式 1: test_mcp_connection (L546-548)
match server_type.as_str() {
    "http" => test_http_mcp(&name, url, headers).await,
    _ => test_stdio_mcp(&name, &command, args, env).await,
}

// 重复模式 2: list_mcp_tools (L849-852)
match server_type.as_str() {
    "http" => list_http_mcp_tools(&name, url, headers).await,
    _ => list_stdio_mcp_tools(&name, &command, args, env).await,
}

// 重复模式 3: call_mcp_tool (L1077-1079)
match server_type.as_str() {
    "http" => call_http_mcp_tool(&name, url, headers, &tool_name, params).await,
    _ => call_stdio_mcp_tool(&name, &command, args, env, &tool_name, params).await,
}

// 重复模式 4: list_mcp_tools_by_config (L1303-1314)
match server_type.as_str() {
    "http" | "sse" => list_http_mcp_tools(&name, config.url, headers_str).await,
    _ => list_stdio_mcp_tools(...).await,
}
```

**问题**:
- 相同的 match 分支逻辑在 4 处重复
- stdio 和 http 的函数内部逻辑相似（连接→操作→断开）
- 每次新增传输类型需要修改 4+ 处代码
- 违反开闭原则（OCP）

### 策略模式 (Strategy Pattern) 重构

#### 1. 定义 MCP 传输 Trait

```rust
// src-tauri/src/commands/mcp/transport.rs

use async_trait::async_trait;
use serde_json::Value;

/// MCP 传输层抽象
#[async_trait]
pub trait McpTransport: Send + Sync {
    /// 连接到 MCP 服务器
    async fn connect(&mut self) -> Result<(), McpError>;

    /// 获取工具列表
    async fn list_tools(&self) -> Result<Vec<McpTool>, McpError>;

    /// 调用工具
    async fn call_tool(&self, name: &str, params: Value) -> Result<Value, McpError>;

    /// 断开连接
    async fn disconnect(&mut self) -> Result<(), McpError>;

    /// 获取传输类型名称
    fn transport_type(&self) -> &'static str;
}

/// MCP 工具定义
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpTool {
    pub name: String,
    pub description: String,
    pub input_schema: Value,
}

/// MCP 错误类型
#[derive(Debug, thiserror::Error)]
pub enum McpError {
    #[error("连接失败: {0}")]
    ConnectionFailed(String),

    #[error("工具未找到: {0}")]
    ToolNotFound(String),

    #[error("调用失败: {0}")]
    CallFailed(String),

    #[error("配置错误: {0}")]
    ConfigError(String),

    #[error("超时")]
    Timeout,
}
```

#### 2. 实现 Stdio 传输

```rust
// src-tauri/src/commands/mcp/transport/stdio.rs

use super::{McpError, McpTool, McpTransport};
use rmcp::{transport::TokioChildProcess, ServiceExt};
use tokio::process::Command;

pub struct StdioTransport {
    command: String,
    args: Vec<String>,
    env: HashMap<String, String>,
    service: Option<RmcpService>,
}

impl StdioTransport {
    pub fn new(command: String, args: Vec<String>, env: HashMap<String, String>) -> Self {
        Self {
            command,
            args,
            env,
            service: None,
        }
    }

    fn build_command(&self) -> Command {
        let mut cmd = build_platform_command(&self.command, &self.args);
        for (key, value) in &self.env {
            cmd.env(key, value);
        }
        cmd
    }
}

#[async_trait]
impl McpTransport for StdioTransport {
    async fn connect(&mut self) -> Result<(), McpError> {
        let cmd = self.build_command();
        let transport = TokioChildProcess::new(cmd)
            .map_err(|e| McpError::ConnectionFailed(e.to_string()))?;

        self.service = Some(
            ().serve(transport)
                .await
                .map_err(|e| McpError::ConnectionFailed(e.to_string()))?
        );
        Ok(())
    }

    async fn list_tools(&self) -> Result<Vec<McpTool>, McpError> {
        let service = self.service.as_ref()
            .ok_or(McpError::ConfigError("未连接".into()))?;

        let result = service.list_tools(Default::default())
            .await
            .map_err(|e| McpError::CallFailed(e.to_string()))?;

        Ok(result.tools.into_iter().map(|t| McpTool {
            name: t.name.to_string(),
            description: t.description.unwrap_or_default().to_string(),
            input_schema: serde_json::to_value(&t.input_schema).unwrap_or_default(),
        }).collect())
    }

    async fn call_tool(&self, name: &str, params: Value) -> Result<Value, McpError> {
        let service = self.service.as_ref()
            .ok_or(McpError::ConfigError("未连接".into()))?;

        let call_params = CallToolRequestParams {
            meta: None,
            name: name.to_string().into(),
            arguments: params.as_object().cloned(),
            task: None,
        };

        let result = service.call_tool(call_params)
            .await
            .map_err(|e| McpError::CallFailed(e.to_string()))?;

        Ok(format_call_tool_result(&result))
    }

    async fn disconnect(&mut self) -> Result<(), McpError> {
        if let Some(service) = self.service.take() {
            let _ = service.cancel().await;
        }
        Ok(())
    }

    fn transport_type(&self) -> &'static str {
        "stdio"
    }
}
```

#### 3. 实现 HTTP 传输

```rust
// src-tauri/src/commands/mcp/transport/http.rs

use super::{McpError, McpTool, McpTransport};
use rmcp::{transport::StreamableHttpClientTransport, ServiceExt};

pub struct HttpTransport {
    url: String,
    headers: Option<HashMap<String, String>>,
    service: Option<RmcpService>,
}

impl HttpTransport {
    pub fn new(url: String, headers: Option<HashMap<String, String>>) -> Self {
        Self { url, headers, service: None }
    }
}

#[async_trait]
impl McpTransport for HttpTransport {
    async fn connect(&mut self) -> Result<(), McpError> {
        let transport = StreamableHttpClientTransport::from_uri(&self.url);

        self.service = Some(
            ().serve(transport)
                .await
                .map_err(|e| McpError::ConnectionFailed(e.to_string()))?
        );
        Ok(())
    }

    async fn list_tools(&self) -> Result<Vec<McpTool>, McpError> {
        // 与 StdioTransport 相同的实现...
    }

    async fn call_tool(&self, name: &str, params: Value) -> Result<Value, McpError> {
        // 与 StdioTransport 相同的实现...
    }

    async fn disconnect(&mut self) -> Result<(), McpError> {
        if let Some(service) = self.service.take() {
            let _ = service.cancel().await;
        }
        Ok(())
    }

    fn transport_type(&self) -> &'static str {
        "http"
    }
}
```

#### 4. 实现 Builtin 传输

```rust
// src-tauri/src/commands/mcp/transport/builtin.rs

use super::{McpError, McpTool, McpTransport};

pub struct BuiltinTransport;

#[async_trait]
impl McpTransport for BuiltinTransport {
    async fn connect(&mut self) -> Result<(), McpError> {
        // 内置服务器无需连接
        Ok(())
    }

    async fn list_tools(&self) -> Result<Vec<McpTool>, McpError> {
        Ok(get_builtin_tools())
    }

    async fn call_tool(&self, name: &str, params: Value) -> Result<Value, McpError> {
        call_builtin_tool(name, params)
            .await
            .map_err(|e| McpError::CallFailed(e))
    }

    async fn disconnect(&mut self) -> Result<(), McpError> {
        Ok(())
    }

    fn transport_type(&self) -> &'static str {
        "builtin"
    }
}
```

#### 5. 传输工厂

```rust
// src-tauri/src/commands/mcp/transport/factory.rs

use super::{McpTransport, StdioTransport, HttpTransport, BuiltinTransport};
use std::collections::HashMap;

/// MCP 传输配置
pub enum TransportConfig {
    Stdio {
        command: String,
        args: Vec<String>,
        env: HashMap<String, String>,
    },
    Http {
        url: String,
        headers: Option<HashMap<String, String>>,
    },
    Builtin,
}

/// 传输工厂
pub struct TransportFactory;

impl TransportFactory {
    /// 根据配置创建传输实例
    pub fn create(config: TransportConfig) -> Box<dyn McpTransport> {
        match config {
            TransportConfig::Stdio { command, args, env } => {
                Box::new(StdioTransport::new(command, args, env))
            }
            TransportConfig::Http { url, headers } => {
                Box::new(HttpTransport::new(url, headers))
            }
            TransportConfig::Builtin => {
                Box::new(BuiltinTransport)
            }
        }
    }

    /// 从数据库服务器配置创建传输
    pub fn from_server(server: &McpServer) -> Box<dyn McpTransport> {
        match server.server_type.as_str() {
            "builtin" => Box::new(BuiltinTransport),
            "http" | "sse" => {
                let url = server.url.clone().unwrap_or_default();
                let headers = server.headers.as_ref()
                    .and_then(|h| serde_json::from_str(h).ok());
                Box::new(HttpTransport::new(url, headers))
            }
            _ => {
                let command = server.command.clone();
                let args = server.args.as_ref()
                    .map(|a| a.split_whitespace().map(|s| s.to_string()).collect())
                    .unwrap_or_default();
                let env = server.env.as_ref()
                    .and_then(|e| serde_json::from_str(e).ok())
                    .unwrap_or_default();
                Box::new(StdioTransport::new(command, args, env))
            }
        }
    }
}
```

#### 6. 重构后的调用代码

```rust
// 重构后的 test_mcp_connection
#[tauri::command]
pub async fn test_mcp_connection(id: String) -> Result<McpTestResult, String> {
    let server = get_server_by_id(&id)?;

    // 使用工厂创建传输
    let mut transport = TransportFactory::from_server(&server);

    // 统一的操作流程
    match transport.connect().await {
        Ok(()) => {
            let tools = transport.list_tools().await.unwrap_or_default();
            let _ = transport.disconnect().await;

            Ok(McpTestResult {
                success: true,
                message: format!("连接成功，服务器「{}」可用", server.name),
                tool_count: Some(tools.len() as i32),
            })
        }
        Err(e) => Ok(McpTestResult {
            success: false,
            message: e.to_string(),
            tool_count: None,
        }),
    }
}

// 重构后的 list_mcp_tools
#[tauri::command]
pub async fn list_mcp_tools(server_id: String) -> Result<McpToolsListResult, String> {
    let server = get_server_by_id(&server_id)?;
    let mut transport = TransportFactory::from_server(&server);

    transport.connect().await.map_err(|e| e.to_string())?;
    let tools = transport.list_tools().await.map_err(|e| e.to_string())?;
    let _ = transport.disconnect().await;

    Ok(McpToolsListResult {
        success: true,
        message: format!("成功获取 {} 个工具", tools.len()),
        tools,
    })
}

// 重构后的 call_mcp_tool
#[tauri::command]
pub async fn call_mcp_tool(
    server_id: String,
    tool_name: String,
    params: Value,
) -> Result<McpToolCallResult, String> {
    let server = get_server_by_id(&server_id)?;
    let mut transport = TransportFactory::from_server(&server);

    transport.connect().await.map_err(|e| e.to_string())?;
    let result = transport.call_tool(&tool_name, params).await;
    let _ = transport.disconnect().await;

    match result {
        Ok(value) => Ok(McpToolCallResult {
            success: true,
            message: "工具调用成功".to_string(),
            result: value,
            error: None,
        }),
        Err(e) => Ok(McpToolCallResult {
            success: false,
            message: e.to_string(),
            result: Value::Null,
            error: Some(e.to_string()),
        }),
    }
}
```

### 重构收益

| 方面 | 重构前 | 重构后 |
|------|--------|--------|
| 代码重复 | 4处相同 match 逻辑 | 工厂统一创建 |
| 新增传输类型 | 修改 4+ 处代码 | 新增一个实现类 |
| 测试难度 | 需要模拟多种场景 | 可独立测试每个传输 |
| 可维护性 | 低 | 高 |
| 代码行数 | ~1360 行 | ~800 行 (预估) |

### 文件结构建议

```
src-tauri/src/commands/mcp/
├── mod.rs              # 公共接口和 Tauri 命令
├── types.rs            # 数据结构定义
├── transport/
│   ├── mod.rs          # Trait 定义
│   ├── factory.rs      # 工厂
│   ├── stdio.rs        # Stdio 实现
│   ├── http.rs         # HTTP 实现
│   └── builtin.rs      # Builtin 实现
├── config.rs           # 配置文件操作
└── db.rs               # 数据库操作
```

---

## 优化优先级

| 优先级 | 问题 | 工作量 | 影响 |
|--------|------|--------|------|
| P0 | 引入策略模式重构 | 高 | 减少重复、提高可维护性 |
| P0 | 拆分 mcp_market.rs | 高 | 可维护性 |
| P1 | 添加超时控制 | 低 | 健壮性 |
| P2 | 使用日志框架 | 中 | 可观测性 |
| P2 | 统一错误处理 | 中 | 代码质量 |
| P3 | 删除未使用枚举 | 低 | 代码整洁 |
| P3 | URL 编码改进 | 低 | 正确性 |
