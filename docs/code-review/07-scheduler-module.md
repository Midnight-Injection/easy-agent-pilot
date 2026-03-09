# 代码审查报告 - scheduler 模块

> 审查日期: 2026-03-09
> 审查范围: `src-tauri/src/scheduler/mod.rs`, `plan_scheduler.rs`

## 文件概览

| 文件 | 行数 | 说明 |
|------|------|------|
| `mod.rs` | 3 | 模块导出 |
| `plan_scheduler.rs` | 209 | 定时计划调度器 |
| **总计** | **212** | |

---

## 架构分析

### 调度器工作流程

```
┌─────────────────────────────────────────────────────────────┐
│                   Plan Scheduler                            │
├─────────────────────────────────────────────────────────────┤
│  1. start_scheduler() - 后台循环（60秒检查一次）            │
│     └── check_and_trigger_scheduled_plans()                │
│                                                             │
│  2. restore_scheduled_plans() - 应用启动时恢复              │
│     └── register_plan_timer() / trigger_plan_execution()   │
│                                                             │
│  3. register_plan_timer() - 注册单个定时器                  │
│     └── tokio::spawn + sleep                                │
│                                                             │
│  4. cancel_plan_timer() - 取消定时器                        │
│     └── handle.abort()                                      │
└─────────────────────────────────────────────────────────────┘
```

### 定时器存储

```rust
lazy_static! {
    static ref ACTIVE_TIMERS: Arc<RwLock<HashMap<String, JoinHandle<()>>>> =
        Arc::new(RwLock::new(HashMap::new()));
}
```

---

## 问题分析

### 🔴 高优先级问题

#### 1. 定时器句柄泄漏

- **位置**: `plan_scheduler.rs` L144-155
- **问题**: 定时器完成后从 map 中移除，但如果任务执行失败，句柄仍会被移除，无法重试

```rust
let handle = tokio::spawn(async move {
    tokio::time::sleep(duration).await;

    if let Err(e) = trigger_plan_execution(&app_handle, &plan_id_owned).await {
        eprintln!("Failed to trigger plan {}: {}", plan_id_owned, e);
        // 失败后句柄仍被移除，无法追踪
    }

    // 从活动定时器中移除
    let mut timers = ACTIVE_TIMERS.write().await;
    timers.remove(&plan_id_owned);
});
```

**建议**: 添加重试机制或错误状态记录

#### 2. 重复触发风险

- **位置**: `plan_scheduler.rs` L91-118
- **问题**: 后台循环和独立定时器可能同时触发同一计划

```rust
// check_and_trigger_scheduled_plans 中
if timers.contains_key(&plan_id) {
    continue;  // 只检查了定时器，但定时器可能已经触发
}
```

**建议**: 在数据库层面添加原子性检查

### 🟡 中优先级问题

#### 3. 使用 println!/eprintln! 而非日志框架

- **位置**: 多处
- **问题**: 所有日志输出使用 println!

```rust
println!("Found {} scheduled plans to restore", scheduled_plans.len());
eprintln!("Failed to check scheduled plans: {}", e);
```

**建议**: 使用 `tracing` crate

#### 4. 硬编码的检查间隔

- **位置**: `plan_scheduler.rs` L22
- **问题**: 60 秒间隔硬编码

```rust
tokio::time::sleep(Duration::from_secs(60)).await;
```

**建议**: 配置化

```rust
const SCHEDULER_INTERVAL_SECS: u64 = 60;
// 或从配置读取
```

#### 5. 缺少时区处理

- **位置**: `plan_scheduler.rs` L70, L95
- **问题**: 直接使用 UTC，未考虑用户时区

**建议**: 添加时区支持或在前端处理时区转换

### 🟢 低优先级问题

#### 6. get_db_path 重复定义

- **位置**: `plan_scheduler.rs` L204-208
- **问题**: 与其他模块中的相同函数重复

**建议**: 提取到公共模块

#### 7. 缺少定时器状态查询

- **问题**: 没有公开的函数查询当前活动的定时器

**建议**: 添加状态查询函数

```rust
pub async fn get_active_timer_count() -> usize {
    ACTIVE_TIMERS.read().await.len()
}

pub async fn is_timer_active(plan_id: &str) -> bool {
    ACTIVE_TIMERS.read().await.contains_key(plan_id)
}
```

---

## 设计亮点

### 1. 懒加载定时器

只在需要时创建定时器，而不是为所有计划预创建：

```rust
pub async fn register_plan_timer(app_handle: AppHandle, plan_id: &str, scheduled_at: DateTime<Utc>) {
    // 只在计划到期时创建定时器
}
```

### 2. 应用恢复机制

`restore_scheduled_plans` 在应用启动时恢复待执行的计划：

```rust
pub async fn restore_scheduled_plans(app_handle: &AppHandle) {
    // 查询所有待执行的定时计划
    // 处理过期和未来的计划
}
```

### 3. 可取消的定时器

```rust
pub async fn cancel_plan_timer(plan_id: &str) {
    if let Some(handle) = timers.remove(plan_id) {
        handle.abort();  // 使用 tokio 的 abort 机制
    }
}
```

---

## 优化建议

### 1. 添加错误恢复机制

```rust
async fn trigger_plan_execution(app_handle: &AppHandle, plan_id: &str) -> Result<(), Box<dyn std::error::Error>> {
    // 使用事务
    let tx = conn.transaction()?;

    // 检查状态（原子性）
    let current_status: String = tx.query_row(
        "SELECT schedule_status FROM plans WHERE id = ?1",
        [&plan_id],
        |row| row.get(0)
    )?;

    if current_status != "scheduled" {
        return Ok(());  // 已被处理
    }

    // 更新状态...
    tx.commit()?;
}
```

### 2. 添加配置支持

```rust
pub struct SchedulerConfig {
    pub check_interval_secs: u64,
    pub max_concurrent_timers: usize,
    pub retry_on_failure: bool,
    pub retry_delay_secs: u64,
}

impl Default for SchedulerConfig {
    fn default() -> Self {
        Self {
            check_interval_secs: 60,
            max_concurrent_timers: 100,
            retry_on_failure: true,
            retry_delay_secs: 300,
        }
    }
}
```

### 3. 添加监控指标

```rust
lazy_static! {
    static ref SCHEDULER_METRICS: Arc<RwLock<SchedulerMetrics>> =
        Arc::new(RwLock::new(SchedulerMetrics::default()));
}

pub struct SchedulerMetrics {
    pub total_triggered: u64,
    pub total_failed: u64,
    pub active_timers: usize,
    pub last_check_at: Option<DateTime<Utc>>,
}
```

---

## 优化优先级

| 优先级 | 问题 | 工作量 | 影响 |
|--------|------|--------|------|
| P0 | 防止重复触发 | 中 | 正确性 |
| P1 | 添加错误恢复 | 中 | 健壮性 |
| P1 | 使用日志框架 | 低 | 可观测性 |
| P2 | 配置化检查间隔 | 低 | 灵活性 |
| P3 | 提取 get_db_path | 低 | 代码整洁 |
| P3 | 添加状态查询 | 低 | 可观测性 |

---

## 设计模式深化建议

### 问题分析

当前调度器实现中存在以下问题：

```rust
// 问题 1: 触发逻辑硬编码
async fn trigger_plan_execution(...) {
    // 直接调用执行逻辑，无法切换触发策略
}

// 问题 2: 定时器类型单一
// 只有基于时间延迟的触发，没有 cron 表达式等高级功能

// 问题 3: 错误处理分散
// 各处的错误处理逻辑不统一
```

### 策略模式 (Strategy Pattern) - 触发策略

#### 1. 定义触发策略接口

```rust
// scheduler/trigger_strategy.rs

use async_trait::async_trait;
use chrono::{DateTime, Utc};

/// 触发策略 Trait
#[async_trait]
pub trait TriggerStrategy: Send + Sync {
    /// 计算下次触发时间
    fn next_trigger_time(&self, last_triggered: Option<DateTime<Utc>>) -> Option<DateTime<Utc>>;

    /// 策略名称
    fn name(&self) -> &str;

    /// 验证策略配置
    fn validate(&self) -> Result<(), String>;
}

/// 一次性触发（延迟指定时间后执行）
pub struct DelayTrigger {
    pub delay_seconds: u64,
}

#[async_trait]
impl TriggerStrategy for DelayTrigger {
    fn next_trigger_time(&self, last_triggered: Option<DateTime<Utc>>) -> Option<DateTime<Utc>> {
        let base_time = last_triggered.unwrap_or_else(Utc::now);
        Some(base_time + chrono::Duration::seconds(self.delay_seconds as i64))
    }

    fn name(&self) -> &str { "delay" }

    fn validate(&self) -> Result<(), String> {
        if self.delay_seconds == 0 {
            return Err("delay_seconds must be greater than 0".to_string());
        }
        Ok(())
    }
}

/// Cron 表达式触发
pub struct CronTrigger {
    pub expression: String,
    cron_schedule: Option<cron::Schedule>,
}

impl CronTrigger {
    pub fn new(expression: String) -> Result<Self, String> {
        let schedule = expression.parse::<cron::Schedule>()
            .map_err(|e| format!("Invalid cron expression: {}", e))?;
        Ok(Self {
            expression,
            cron_schedule: Some(schedule),
        })
    }
}

#[async_trait]
impl TriggerStrategy for CronTrigger {
    fn next_trigger_time(&self, _last_triggered: Option<DateTime<Utc>>) -> Option<DateTime<Utc>> {
        self.cron_schedule.as_ref()?.upcoming(Utc).next()
    }

    fn name(&self) -> &str { "cron" }

    fn validate(&self) -> Result<(), String> {
        self.cron_schedule.as_ref()?;
        Ok(())
    }
}

/// 间隔触发（每隔固定时间执行）
pub struct IntervalTrigger {
    pub interval_seconds: u64,
}

#[async_trait]
impl TriggerStrategy for IntervalTrigger {
    fn next_trigger_time(&self, last_triggered: Option<DateTime<Utc>>) -> Option<DateTime<Utc>> {
        let base_time = last_triggered.unwrap_or_else(Utc::now);
        Some(base_time + chrono::Duration::seconds(self.interval_seconds as i64))
    }

    fn name(&self) -> &str { "interval" }

    fn validate(&self) -> Result<(), String> {
        if self.interval_seconds == 0 {
            return Err("interval_seconds must be greater than 0".to_string());
        }
        Ok(())
    }
}
```

#### 2. 策略工厂

```rust
// scheduler/strategy_factory.rs

use super::trigger_strategy::{TriggerStrategy, DelayTrigger, CronTrigger, IntervalTrigger};

/// 触发策略配置
pub enum TriggerConfig {
    Delay { seconds: u64 },
    Cron { expression: String },
    Interval { seconds: u64 },
}

/// 策略工厂
pub struct TriggerStrategyFactory;

impl TriggerStrategyFactory {
    pub fn create(config: TriggerConfig) -> Result<Box<dyn TriggerStrategy>, String> {
        match config {
            TriggerConfig::Delay { seconds } => {
                let strategy = DelayTrigger { delay_seconds: seconds };
                strategy.validate()?;
                Ok(Box::new(strategy))
            }
            TriggerConfig::Cron { expression } => {
                let strategy = CronTrigger::new(expression)?;
                Ok(Box::new(strategy))
            }
            TriggerConfig::Interval { seconds } => {
                let strategy = IntervalTrigger { interval_seconds: seconds };
                strategy.validate()?;
                Ok(Box::new(strategy))
            }
        }
    }
}
```

### 命令模式 (Command Pattern) - 任务执行

#### 1. 定义执行命令

```rust
// scheduler/command.rs

use async_trait::async_trait;
use tauri::AppHandle;

/// 可执行命令 Trait
#[async_trait]
pub trait ExecutableCommand: Send + Sync {
    /// 执行命令
    async fn execute(&self) -> Result<(), String>;

    /// 命令标识
    fn id(&self) -> &str;

    /// 命令描述
    fn description(&self) -> &str;
}

/// 计划执行命令
pub struct PlanExecutionCommand {
    pub app_handle: AppHandle,
    pub plan_id: String,
    pub plan_name: String,
}

#[async_trait]
impl ExecutableCommand for PlanExecutionCommand {
    async fn execute(&self) -> Result<(), String> {
        log::info!("Executing plan: {} ({})", self.plan_name, self.plan_id);

        // 调用实际的计划执行逻辑
        crate::commands::task::execute_plan(&self.app_handle, &self.plan_id).await
    }

    fn id(&self) -> &str {
        &self.plan_id
    }

    fn description(&self) -> &str {
        &self.plan_name
    }
}
```

#### 2. 命令队列和执行器

```rust
// scheduler/executor.rs

use std::collections::VecDeque;
use std::sync::Arc;
use tokio::sync::{Mutex, RwLock};
use super::command::ExecutableCommand;

/// 命令执行状态
#[derive(Debug, Clone)]
pub enum CommandStatus {
    Pending,
    Running,
    Completed,
    Failed(String),
}

/// 命令执行记录
pub struct CommandRecord {
    pub command: Box<dyn ExecutableCommand>,
    pub status: CommandStatus,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

/// 命令执行器
pub struct CommandExecutor {
    queue: Arc<Mutex<VecDeque<CommandRecord>>>,
    running: Arc<RwLock<HashMap<String, CommandRecord>>>,
    max_concurrent: usize,
}

impl CommandExecutor {
    pub fn new(max_concurrent: usize) -> Self {
        Self {
            queue: Arc::new(Mutex::new(VecDeque::new())),
            running: Arc::new(RwLock::new(HashMap::new())),
            max_concurrent,
        }
    }

    /// 添加命令到队列
    pub async fn enqueue(&self, command: Box<dyn ExecutableCommand>) {
        let record = CommandRecord {
            command,
            status: CommandStatus::Pending,
            created_at: chrono::Utc::now(),
        };
        self.queue.lock().await.push_back(record);
    }

    /// 执行下一个命令
    pub async fn execute_next(&self) -> Option<Result<(), String>> {
        let running_count = self.running.read().await.len();
        if running_count >= self.max_concurrent {
            return None;
        }

        let record = self.queue.lock().await.pop_front()?;
        let command_id = record.command.id().to_string();

        // 标记为运行中
        self.running.write().await.insert(command_id.clone(), record);

        // 执行命令
        let running = self.running.clone();
        let result = {
            let mut running_guard = running.write().await;
            let record = running_guard.get_mut(&command_id)?;
            record.status = CommandStatus::Running;
            record.command.execute().await
        };

        // 更新状态
        let mut running_guard = running.write().await;
        if let Some(record) = running_guard.get_mut(&command_id) {
            record.status = match &result {
                Ok(()) => CommandStatus::Completed,
                Err(e) => CommandStatus::Failed(e.clone()),
            };
        }

        // 移除已完成的命令
        if result.is_ok() {
            running_guard.remove(&command_id);
        }

        Some(result)
    }

    /// 获取队列状态
    pub async fn status(&self) -> ExecutorStatus {
        ExecutorStatus {
            pending_count: self.queue.lock().await.len(),
            running_count: self.running.read().await.len(),
            max_concurrent: self.max_concurrent,
        }
    }
}

pub struct ExecutorStatus {
    pub pending_count: usize,
    pub running_count: usize,
    pub max_concurrent: usize,
}
```

### 重构后的调度器

```rust
// scheduler/plan_scheduler.rs (重构后)

use super::trigger_strategy::{TriggerStrategy, TriggerConfig};
use super::command::{PlanExecutionCommand, ExecutableCommand};
use super::executor::CommandExecutor;

lazy_static! {
    static ref SCHEDULED_PLANS: Arc<RwLock<HashMap<String, ScheduledPlan>>> =
        Arc::new(RwLock::new(HashMap::new()));
    static ref EXECUTOR: CommandExecutor = CommandExecutor::new(5);
}

pub struct ScheduledPlan {
    pub plan_id: String,
    pub plan_name: String,
    pub trigger: Box<dyn TriggerStrategy>,
    pub next_trigger: Option<DateTime<Utc>>,
}

pub async fn schedule_plan(
    app_handle: AppHandle,
    plan_id: String,
    plan_name: String,
    trigger_config: TriggerConfig,
) -> Result<(), String> {
    let trigger = TriggerStrategyFactory::create(trigger_config)?;
    let next_trigger = trigger.next_trigger_time(None);

    let scheduled = ScheduledPlan {
        plan_id: plan_id.clone(),
        plan_name,
        trigger,
        next_trigger,
    };

    SCHEDULED_PLANS.write().await.insert(plan_id, scheduled);
    Ok(())
}

/// 后台调度循环
async fn scheduler_loop(app_handle: AppHandle) {
    loop {
        tokio::time::sleep(Duration::from_secs(60)).await;

        let now = Utc::now();
        let mut plans = SCHEDULED_PLANS.write().await;

        for (plan_id, plan) in plans.iter_mut() {
            if let Some(next) = plan.next_trigger {
                if next <= now {
                    // 创建执行命令
                    let command = Box::new(PlanExecutionCommand {
                        app_handle: app_handle.clone(),
                        plan_id: plan_id.clone(),
                        plan_name: plan.plan_name.clone(),
                    });

                    // 加入执行队列
                    EXECUTOR.enqueue(command).await;

                    // 计算下次触发时间
                    plan.next_trigger = plan.trigger.next_trigger_time(Some(now));
                }
            }
        }

        // 执行队列中的命令
        while let Some(result) = EXECUTOR.execute_next().await {
            if let Err(e) = result {
                log::error!("Command execution failed: {}", e);
            }
        }
    }
}
```

### 重构收益

| 方面 | 重构前 | 重构后 |
|------|--------|--------|
| 触发策略 | 仅延迟触发 | 支持延迟、Cron、间隔等 |
| 执行方式 | 直接 spawn | 命令队列 + 并发控制 |
| 扩展性 | 需修改核心代码 | 新增策略实现即可 |
| 可测试性 | 难以测试 | 策略和命令可独立测试 |
| 监控 | 无 | ExecutorStatus 提供状态 |

---

## 总结

scheduler 模块通过引入策略模式和命令模式，可以：
1. **策略模式**: 支持多种触发策略（延迟、Cron、间隔）
2. **命令模式**: 将任务执行封装为命令，支持队列和并发控制
3. **可扩展**: 新增触发策略只需实现 TriggerStrategy trait
4. **可测试**: 策略和命令可独立测试

主要优化方向：
1. 防止重复触发（添加原子性检查）
2. 添加错误恢复机制
3. 使用日志框架替代 println
4. 添加配置支持
5. 引入策略模式和命令模式
