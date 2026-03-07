use serde::{Deserialize, Serialize};

/// MCP 服务器配置
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpServerConfig {
    /// MCP 配置 ID
    pub id: String,
    /// MCP 名称
    pub name: String,
    /// 传输类型
    pub transport_type: String,
    /// 命令 (stdio 类型)
    pub command: Option<String>,
    /// 参数 (stdio 类型)
    pub args: Option<String>,
    /// 环境变量 (stdio 类型)
    pub env: Option<String>,
    /// URL (sse/http 类型)
    pub url: Option<String>,
    /// 请求头 (sse/http 类型)
    pub headers: Option<String>,
}

/// CLI 执行请求
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CliExecutionRequest {
    /// 会话 ID
    pub session_id: String,
    /// CLI 路径
    pub cli_path: String,
    /// 模型 ID
    pub model_id: Option<String>,
    /// 消息历史
    pub messages: Vec<MessageInput>,
    /// 工作目录
    pub working_directory: Option<String>,
    /// 允许的工具列表
    pub allowed_tools: Option<Vec<String>>,
    /// CLI 输出格式 (text/json/stream-json)
    pub cli_output_format: Option<String>,
    /// JSON Schema（当输出格式为 json 时可选）
    pub json_schema: Option<String>,
    /// 额外 CLI 参数
    pub extra_cli_args: Option<Vec<String>>,
    /// MCP 服务器配置列表
    pub mcp_servers: Option<Vec<McpServerConfig>>,
}

/// SDK 执行请求
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SdkExecutionRequest {
    /// 会话 ID
    pub session_id: String,
    /// API 密钥
    pub api_key: String,
    /// API 端点
    pub base_url: Option<String>,
    /// 模型 ID
    pub model_id: String,
    /// 消息历史
    pub messages: Vec<MessageInput>,
    /// 系统提示
    pub system_prompt: Option<String>,
    /// 最大令牌数
    pub max_tokens: Option<u32>,
    /// 工具定义
    pub tools: Option<Vec<ToolDefinition>>,
    /// MCP 服务器配置列表
    pub mcp_servers: Option<Vec<McpServerConfig>>,
}

/// 统一执行请求
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecutionRequest {
    /// 会话 ID
    pub session_id: String,
    /// 智能体类型 (cli/sdk)
    pub agent_type: String,
    /// 提供者 (claude/codex)
    pub provider: String,
    /// CLI 路径 (仅 CLI 类型需要)
    pub cli_path: Option<String>,
    /// API 密钥 (仅 SDK 类型需要)
    pub api_key: Option<String>,
    /// API 端点
    pub base_url: Option<String>,
    /// 模型 ID
    pub model_id: Option<String>,
    /// 消息历史
    pub messages: Vec<MessageInput>,
    /// 工作目录
    pub working_directory: Option<String>,
    /// 允许的工具列表
    pub allowed_tools: Option<Vec<String>>,
    /// 系统提示
    pub system_prompt: Option<String>,
    /// 最大令牌数
    pub max_tokens: Option<u32>,
    /// 工具定义
    pub tools: Option<Vec<ToolDefinition>>,
    /// CLI 输出格式 (text/json/stream-json)
    pub cli_output_format: Option<String>,
    /// JSON Schema（当输出格式为 json 时可选）
    pub json_schema: Option<String>,
    /// 额外 CLI 参数
    pub extra_cli_args: Option<Vec<String>>,
    /// MCP 服务器配置列表
    pub mcp_servers: Option<Vec<McpServerConfig>>,
    /// 执行模式（chat/task_split）
    pub execution_mode: Option<String>,
    /// 响应模式（stream_text/json_once）
    pub response_mode: Option<String>,
}

/// 消息输入
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MessageInput {
    pub role: String,
    pub content: String,
}

/// 工具定义
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolDefinition {
    pub name: String,
    pub description: String,
    pub input_schema: serde_json::Value,
}

/// CLI 流式事件
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CliStreamEvent {
    /// 事件类型
    #[serde(rename = "type")]
    pub event_type: String,
    /// 会话 ID
    pub session_id: String,
    /// 内容
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
    /// 工具名称
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_name: Option<String>,
    /// 工具调用 ID
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_call_id: Option<String>,
    /// 工具输入
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_input: Option<String>,
    /// 工具结果
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_result: Option<String>,
    /// 错误信息
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    /// 输入 token 数量
    #[serde(skip_serializing_if = "Option::is_none")]
    pub input_tokens: Option<u32>,
    /// 输出 token 数量
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output_tokens: Option<u32>,
    /// 模型名称
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
}

/// SDK 流式事件
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SdkStreamEvent {
    /// 事件类型
    #[serde(rename = "type")]
    pub event_type: String,
    /// 会话 ID
    pub session_id: String,
    /// 内容
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
    /// 工具名称
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_name: Option<String>,
    /// 工具调用 ID
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_call_id: Option<String>,
    /// 工具输入
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_input: Option<String>,
    /// 工具结果
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_result: Option<String>,
    /// 错误信息
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    /// 输入 token 数量
    #[serde(skip_serializing_if = "Option::is_none")]
    pub input_tokens: Option<u32>,
    /// 输出 token 数量
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output_tokens: Option<u32>,
    /// 模型名称
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
}
