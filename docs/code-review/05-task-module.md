# 代码审查报告 - task 模块

> 审查日期: 2026-03-09
> 审查范围: `src-tauri/src/commands/task.rs`, `task_execution.rs`

## 文件概览

| 文件 | 行数 | 说明 |
|------|------|------|
| `task.rs` | 1277 | 任务 CRUD 和管理 |
| `task_execution.rs` | 466 | 任务执行日志和结果 |
| **总计** | **1743** | |

---

## 架构分析

### 任务生命周期

```
┌─────────────────────────────────────────────────────────────┐
│                      Task Lifecycle                         │
│                                                             │
│  pending → in_progress → completed                         │
│      │         │           ↓                               │
│      │         │       failed → retry → in_progress        │
│      │         │           ↓                               │
│      │      blocked ───→ cancelled                         │
│      │                                                     │
│      └─────────────────────────────────────────────────────┤
│                                                             │
│  Execution Logs: task_execution_logs                       │
│  Execution Results: task_execution_results                 │
└─────────────────────────────────────────────────────────────┘
```

### 数据模型

```
Plan (计划)
  └── Task (任务)
        ├── dependencies: Vec<String>      # 依赖任务 ID
        ├── implementation_steps: Vec<String>
        ├── test_steps: Vec<String>
        ├── acceptance_criteria: Vec<String>
        └── ExecutionResult (执行结果)
              └── ExecutionLog (执行日志)
```

---

## 问题分析

### 🔴 高优先级问题

#### 1. task.rs 文件过大

- **位置**: 整个文件
- **问题**: 1277 行单文件，包含数据结构、CRUD、批量操作等
- **建议**: 拆分文件

```
task/
├── mod.rs           # 公共导出
├── types.rs         # Task, RustTask 等数据结构
├── crud.rs          # 基本 CRUD 操作
├── batch.rs         # 批量操作
└── query.rs         # 查询操作
```

#### 2. 未使用的枚举

- **位置**: `task.rs` L5-26
- **问题**: `TaskStatus` 和 `TaskPriority` 枚举定义但未使用

```rust
#[allow(dead_code)]
pub enum TaskStatus {
    Pending,
    InProgress,
    // ...
}

#[allow(dead_code)]
pub enum TaskPriority {
    Low,
    Medium,
    High,
}
```

**建议**: 删除或在代码中使用这些枚举替代字符串

### 🟡 中优先级问题

#### 3. 重复的数据结构定义

- **位置**: `task.rs` L28-54 (Task) 和 L56-86 (RustTask)
- **问题**: 两个结构体字段几乎相同，只是命名风格不同

```rust
// Task (camelCase for frontend)
pub struct Task {
    pub plan_id: String,
    pub parent_id: Option<String>,
    // ...
}

// RustTask (snake_case for internal)
pub struct RustTask {
    pub plan_id: String,
    pub parent_id: Option<String>,
    // ... 几乎相同
}
```

**建议**: 使用单一结构体 + serde 别名

```rust
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Task {
    pub plan_id: String,
    // ...
}
```

#### 4. JSON 解析缺少错误处理

- **位置**: `task_execution.rs` L86-91
- **问题**: JSON 解析失败时静默返回空数组

```rust
fn parse_json_string_array(value: Option<String>) -> Vec<String> {
    match value {
        Some(raw) => serde_json::from_str::<Vec<String>>(&raw).unwrap_or_default(),
        None => Vec::new(),
    }
}
```

**建议**: 记录解析失败的日志

```rust
fn parse_json_string_array(value: Option<String>) -> Vec<String> {
    match value {
        Some(raw) => {
            serde_json::from_str::<Vec<String>>(&raw).unwrap_or_else(|e| {
                log::warn!("Failed to parse JSON array: {}", e);
                Vec::new()
            })
        }
        None => Vec::new(),
    }
}
```

#### 5. 硬编码的状态字符串

- **位置**: 多处
- **问题**: 状态值使用字符串硬编码

```rust
// task_execution.rs L359-365
match task.status.as_str() {
    "pending" => progress.pending_count += 1,
    "in_progress" => progress.in_progress_count += 1,
    "completed" => progress.completed_count += 1,
    // ...
}
```

**建议**: 定义常量

```rust
pub mod task_status {
    pub const PENDING: &str = "pending";
    pub const IN_PROGRESS: &str = "in_progress";
    pub const COMPLETED: &str = "completed";
    pub const BLOCKED: &str = "blocked";
    pub const CANCELLED: &str = "cancelled";
}
```

### 🟢 低优先级问题

#### 6. 缺少事务处理

- **位置**: `task_execution.rs` L202-247
- **问题**: `save_task_execution_result` 执行多个数据库操作，但没有使用事务

**建议**: 使用事务包装

```rust
let tx = conn.transaction().map_err(|e| e.to_string())?;

// 执行多个操作...

tx.commit().map_err(|e| e.to_string())?;
```

#### 7. 批量删除效率问题

- **位置**: `task_execution.rs` L436-445
- **问题**: 循环执行单条删除，效率低

```rust
for task_id in &task_ids {
    let affected = conn.execute(
        "DELETE FROM task_execution_logs WHERE task_id = ?1",
        [task_id],
    )?;
    logs_deleted += affected;
}
```

**建议**: 使用批量删除

```rust
// 使用 IN 子句批量删除
let placeholders: Vec<String> = task_ids.iter().map(|_| "?").collect();
let sql = format!(
    "DELETE FROM task_execution_logs WHERE task_id IN ({})",
    placeholders.join(",")
);
let params: Vec<&String> = task_ids.iter().collect();
let logs_deleted = conn.execute(&sql, params.as_slice())?;
```

---

## 设计亮点

### 1. 任务执行结果快照

`save_task_execution_result` 保存任务标题和描述的快照：

```rust
let (plan_id, task_title_snapshot, task_description_snapshot) = conn.query_row(
    "SELECT plan_id, title, description FROM tasks WHERE id = ?1",
    [&input.task_id],
    |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
)?;
```

这样即使任务后来被修改，历史结果仍然保留正确的上下文。

### 2. 计划执行进度统计

`list_plan_execution_progress` 函数提供了完整的计划进度视图：

```rust
pub struct PlanExecutionProgress {
    pub total_tasks: i32,
    pub pending_count: i32,
    pub in_progress_count: i32,
    pub completed_count: i32,
    pub blocked_count: i32,
    pub cancelled_count: i32,
    pub success_count: i32,
    pub failed_count: i32,
    pub tasks: Vec<PlanExecutionTaskProgress>,
}
```

### 3. 安全的 LIMIT 参数处理

```rust
let safe_limit = limit.unwrap_or(50).clamp(1, 500);
```

---

## 优化建议

### 1. 使用枚举替代状态字符串

```rust
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum TaskStatus {
    Pending,
    InProgress,
    Completed,
    Blocked,
    Cancelled,
}

impl TaskStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            TaskStatus::Pending => "pending",
            TaskStatus::InProgress => "in_progress",
            TaskStatus::Completed => "completed",
            TaskStatus::Blocked => "blocked",
            TaskStatus::Cancelled => "cancelled",
        }
    }
}
```

### 2. 提取数据库操作为 Repository

```rust
pub struct TaskRepository<'a> {
    conn: &'a Connection,
}

impl<'a> TaskRepository<'a> {
    pub fn new(conn: &'a Connection) -> Self {
        Self { conn }
    }

    pub fn find_by_id(&self, id: &str) -> Result<Option<Task>> { ... }
    pub fn find_by_plan(&self, plan_id: &str) -> Result<Vec<Task>> { ... }
    pub fn save(&self, task: &Task) -> Result<()> { ... }
    pub fn delete(&self, id: &str) -> Result<()> { ... }
}
```

### 3. 添加输入验证

```rust
pub fn validate_task_input(input: &CreateTaskInput) -> Result<(), String> {
    if input.title.trim().is_empty() {
        return Err("标题不能为空".to_string());
    }
    if input.title.len() > 200 {
        return Err("标题长度不能超过200字符".to_string());
    }
    Ok(())
}
```

---

## 设计模式深化建议

### 问题分析

任务状态转换涉及复杂的业务逻辑，当前使用字符串匹配：

```rust
// 当前代码 - 分散的状态转换逻辑
if task.status == "pending" {
    // 可以转换到 in_progress
}
if task.status == "in_progress" {
    // 可以转换到 completed, failed, blocked
}
// ... 分散在多处
```

### 状态机模式 (State Machine Pattern)

#### 1. 定义任务状态和转换规则

```rust
// task/state_machine.rs

use std::collections::HashSet;

/// 任务状态
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TaskState {
    Pending,
    InProgress,
    Completed,
    Failed,
    Blocked,
    Cancelled,
}

impl TaskState {
    pub fn as_str(&self) -> &'static str {
        match self {
            TaskState::Pending => "pending",
            TaskState::InProgress => "in_progress",
            TaskState::Completed => "completed",
            TaskState::Failed => "failed",
            TaskState::Blocked => "blocked",
            TaskState::Cancelled => "cancelled",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "pending" => Some(TaskState::Pending),
            "in_progress" => Some(TaskState::InProgress),
            "completed" => Some(TaskState::Completed),
            "failed" => Some(TaskState::Failed),
            "blocked" => Some(TaskState::Blocked),
            "cancelled" => Some(TaskState::Cancelled),
            _ => None,
        }
    }
}

/// 状态转换
pub struct StateTransition {
    pub from: TaskState,
    pub to: TaskState,
    pub requires: Vec<&'static str>,  // 转换所需条件
}

/// 任务状态机
pub struct TaskStateMachine {
    /// 允许的转换: (from_state, to_state)
    allowed_transitions: HashSet<(TaskState, TaskState)>,
}

impl TaskStateMachine {
    pub fn new() -> Self {
        let mut transitions = HashSet::new();

        // 定义允许的状态转换
        // pending -> in_progress, cancelled
        transitions.insert((TaskState::Pending, TaskState::InProgress));
        transitions.insert((TaskState::Pending, TaskState::Cancelled));

        // in_progress -> completed, failed, blocked, cancelled
        transitions.insert((TaskState::InProgress, TaskState::Completed));
        transitions.insert((TaskState::InProgress, TaskState::Failed));
        transitions.insert((TaskState::InProgress, TaskState::Blocked));
        transitions.insert((TaskState::InProgress, TaskState::Cancelled));

        // failed -> pending (重试)
        transitions.insert((TaskState::Failed, TaskState::Pending));

        // blocked -> pending, cancelled (解除阻塞)
        transitions.insert((TaskState::Blocked, TaskState::Pending));
        transitions.insert((TaskState::Blocked, TaskState::Cancelled));

        Self { allowed_transitions: transitions }
    }

    /// 检查状态转换是否有效
    pub fn can_transition(&self, from: TaskState, to: TaskState) -> bool {
        self.allowed_transitions.contains(&(from, to))
    }

    /// 尝试转换状态
    pub fn try_transition(&self, current: TaskState, target: TaskState) -> Result<TaskState, String> {
        if self.can_transition(current, target) {
            Ok(target)
        } else {
            Err(format!(
                "无效的状态转换: {} -> {}",
                current.as_str(),
                target.as_str()
            ))
        }
    }

    /// 获取所有可能的下一个状态
    pub fn get_next_states(&self, current: TaskState) -> Vec<TaskState> {
        TaskState::all()
            .into_iter()
            .filter(|s| self.can_transition(current, *s))
            .collect()
    }
}

impl TaskState {
    pub fn all() -> Vec<Self> {
        vec![
            TaskState::Pending,
            TaskState::InProgress,
            TaskState::Completed,
            TaskState::Failed,
            TaskState::Blocked,
            TaskState::Cancelled,
        ]
    }
}
```

#### 2. 在 CRUD 操作中使用状态机

```rust
// task/crud.rs

use super::state_machine::{TaskStateMachine, TaskState};

lazy_static! {
    static ref STATE_MACHINE: TaskStateMachine = TaskStateMachine::new();
}

/// 更新任务状态
pub fn update_task_status(
    conn: &Connection,
    task_id: &str,
    new_status: &str,
) -> Result<Task, String> {
    // 获取当前任务
    let current_task = get_task_by_id(conn, task_id)?
        .ok_or_else(|| format!("任务不存在: {}", task_id))?;

    let current_state = TaskState::from_str(&current_task.status)
        .ok_or_else(|| format!("无效的当前状态: {}", current_task.status))?;

    let target_state = TaskState::from_str(new_status)
        .ok_or_else(|| format!("无效的目标状态: {}", new_status))?;

    // 使用状态机验证转换
    STATE_MACHINE.try_transition(current_state, target_state)?;

    // 执行状态更新
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE tasks SET status = ?1, updated_at = ?2 WHERE id = ?3",
        rusqlite::params![new_status, now, task_id],
    ).map_err(|e| e.to_string())?;

    // 返回更新后的任务
    get_task_by_id(conn, task_id)?.ok_or_else(|| "任务更新后未找到".to_string())
}
```

### 观察者模式 (Observer Pattern)

任务状态变化时需要通知相关方（如进度更新、事件日志等）：

```rust
// task/observer.rs

use std::sync::{Arc, Mutex};

/// 任务事件
#[derive(Debug, Clone)]
pub enum TaskEvent {
    StatusChanged {
        task_id: String,
        old_status: String,
        new_status: String,
    },
    ProgressUpdated {
        task_id: String,
        progress: f32,
    },
    Completed {
        task_id: String,
        result: String,
    },
    Failed {
        task_id: String,
        error: String,
    },
}

/// 任务事件监听器
pub trait TaskEventListener: Send + Sync {
    fn on_event(&self, event: &TaskEvent);
}

/// 任务事件分发器
pub struct TaskEventDispatcher {
    listeners: Arc<Mutex<Vec<Box<dyn TaskEventListener>>>>,
}

impl TaskEventDispatcher {
    pub fn new() -> Self {
        Self {
            listeners: Arc::new(Mutex::new(Vec::new())),
        }
    }

    /// 添加监听器
    pub fn add_listener<L: TaskEventListener + 'static>(&self, listener: L) {
        self.listeners.lock().unwrap().push(Box::new(listener));
    }

    /// 分发事件
    pub fn dispatch(&self, event: TaskEvent) {
        let listeners = self.listeners.lock().unwrap();
        for listener in listeners.iter() {
            listener.on_event(&event);
        }
    }
}

// 全局事件分发器
lazy_static! {
    static ref EVENT_DISPATCHER: TaskEventDispatcher = TaskEventDispatcher::new();
}

/// 进度更新监听器
pub struct ProgressUpdateListener;

impl TaskEventListener for ProgressUpdateListener {
    fn on_event(&self, event: &TaskEvent) {
        if let TaskEvent::StatusChanged { task_id, new_status, .. } = event {
            // 更新计划进度缓存
            log::info!("Task {} status changed to {}", task_id, new_status);
        }
    }
}

/// 日志记录监听器
pub struct LoggingListener;

impl TaskEventListener for LoggingListener {
    fn on_event(&self, event: &TaskEvent) {
        match event {
            TaskEvent::StatusChanged { task_id, old_status, new_status } => {
                log::info!(
                    "Task status changed: {} from {} to {}",
                    task_id, old_status, new_status
                );
            }
            TaskEvent::Completed { task_id, result } => {
                log::info!("Task completed: {} with result: {}", task_id, result);
            }
            TaskEvent::Failed { task_id, error } => {
                log::error!("Task failed: {} with error: {}", task_id, error);
            }
            _ => {}
        }
    }
}
```

### 重构收益

| 方面 | 重构前 | 重构后 |
|------|--------|--------|
| 状态转换验证 | 分散在各处 | 状态机集中管理 |
| 新增状态 | 修改多处 if-else | 只修改状态机定义 |
| 状态变化通知 | 硬编码在各函数 | 观察者模式解耦 |
| 可测试性 | 难以测试状态逻辑 | 可独立测试状态机 |

---

## 优化优先级

| 优先级 | 问题 | 工作量 | 影响 |
|--------|------|--------|------|
| P0 | 拆分 task.rs + 状态机模式 | 高 | 可维护性 |
| P1 | 删除未使用枚举或使用它们 | 低 | 代码整洁 |
| P1 | 合并重复的数据结构 | 中 | 减少重复 |
| P2 | 添加观察者模式 | 中 | 解耦事件通知 |
| P2 | 添加事务处理 | 中 | 数据一致性 |
| P3 | 优化批量删除 | 低 | 性能 |
