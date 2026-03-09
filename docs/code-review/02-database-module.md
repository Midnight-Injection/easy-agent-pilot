# 代码审查报告 - database 模块

> 审查日期: 2026-03-08
> 审查范围: `src-tauri/src/database/mod.rs`

## 文件概览

| 文件 | 行数 | 说明 |
|------|------|------|
| `database/mod.rs` | 924 | 数据库初始化和迁移 |

---

## 问题分析

### 🔴 高优先级问题

#### 1. 中文注释乱码

- **位置**: 整个文件
- **问题**: 所有中文注释显示为乱码（如 `鏁版嵁搴撳垵濮嬪寲 SQL 鑴氭湰`）
- **原因**: 文件编码问题或 Git 传输编码问题
- **影响**: 可读性极差，难以理解代码意图

**示例**:
```rust
// 当前显示
/// 鏁版嵁搴撳垵濮嬪寲 SQL 鑴氭湰

// 应该是
/// 数据库初始化 SQL 脚本
```

- **建议**: 重新保存文件为 UTF-8 编码

#### 2. 缺少数据库版本控制

- **位置**: 整体架构
- **问题**: 没有版本号管理迁移状态
- **影响**: 无法追踪当前数据库版本，迁移管理混乱

**建议**: 添加版本表和版本管理

```rust
// 建议添加
const DB_VERSION: i32 = 1;

// 在初始化时检查版本
CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL
);
```

#### 3. 迁移逻辑无法回滚

- **位置**: L490-917
- **问题**: 所有迁移都是单向的，无法回滚
- **影响**: 如果迁移出错，无法恢复

### 🟡 中优先级问题

#### 4. 重复的迁移模式

- **位置**: L490-512, L514-547, L549-567 等
- **问题**: 多处相同的迁移循环模式

**当前代码** (重复多次):
```rust
for migration in migrations {
    if let Err(e) = conn.execute(migration, []) {
        let err_str = e.to_string();
        if !err_str.contains("duplicate column name") {
            println!("Migration warning: {}", e);
        }
    }
}
```

**建议**: 提取为辅助函数

```rust
fn run_migration(conn: &Connection, migrations: &[&str], warning_prefix: &str) {
    for migration in migrations {
        if let Err(e) = conn.execute(migration, []) {
            let err_str = e.to_string();
            if !err_str.contains("duplicate column name") {
                println!("{} migration warning: {}", warning_prefix, e);
            }
        }
    }
}
```

#### 5. 表定义分散

- **位置**: L5-465 (INIT_SQL) + L582-865 (迁移中的表创建)
- **问题**: 部分表在 INIT_SQL 中定义，部分在迁移中创建
- **影响**: 难以追踪完整的数据库结构

**建议**: 将所有表创建统一到 INIT_SQL，迁移只处理 ALTER TABLE

#### 6. 硬编码的默认数据

- **位置**: L868-917
- **问题**: 默认分类数据硬编码在代码中
- **建议**: 考虑从配置文件或常量中读取

### 🟢 低优先级问题

#### 7. 使用 println! 而非日志框架

- **位置**: 多处
- **问题**: 使用 `println!` 输出日志
- **建议**: 使用 `log` 或 `tracing` crate

```rust
// 当前
println!("Database path: {:?}", db_path);

// 建议
log::info!("Database path: {:?}", db_path);
```

#### 8. 错误处理不一致

- **位置**: L506-511 等
- **问题**: 部分错误被忽略，部分使用 `?` 传播
- **建议**: 统一错误处理策略

---

## 表结构统计

当前数据库包含 **28 张表**：

| 分类 | 表名 | 说明 |
|------|------|------|
| **核心** | projects, sessions, messages | 项目/会话/消息 |
| **智能体** | agents, agent_models | 智能体配置 |
| **MCP** | mcp_servers, session_mcp, agent_mcp_configs | MCP 服务配置 |
| **配置** | app_settings, cli_paths, provider_profiles | 应用配置 |
| **市场** | market_sources, skills | 市场相关 |
| **任务** | plans, tasks, task_split_sessions, task_execution_logs, task_execution_results | 任务管理 |
| **记忆** | memory_categories, user_memories, memory_compressions | 记忆管理 |
| **组织** | departments, employees | 组织架构 |
| **其他** | themes, mcp_install_history, installed_mcp_test_results, app_state, project_access_log, window_session_locks, agent_skills_configs, agent_plugins_configs | 其他 |

---

## 优化建议

### 1. 重构迁移系统

```rust
// 建议的迁移结构
struct Migration {
    version: i32,
    name: &'static str,
    up: &'static str,
    down: Option<&'static str>,
}

const MIGRATIONS: &[Migration] = &[
    Migration {
        version: 1,
        name: "initial",
        up: INCLUDE_STR!("migrations/v1_initial.sql"),
        down: None,
    },
    // ...
];
```

### 2. 拆分模块

建议的文件结构：
```
database/
├── mod.rs           # 主入口
├── schema.sql       # 完整的表结构定义
├── migrations/      # 迁移文件
│   ├── v1_initial.sql
│   ├── v2_add_xxx.sql
│   └── ...
└── seeds/           # 初始数据
    └── default_categories.sql
```

### 3. 添加迁移验证

```rust
// 在应用迁移前验证
fn validate_migration(migration: &str) -> Result<()> {
    // 检查 SQL 语法
    // 检查是否有破坏性操作
    // ...
}
```

---

## 设计模式深化建议

### 问题分析

当前数据库迁移系统存在以下问题：

```rust
// 问题 1: 迁移逻辑分散，没有版本控制
for migration in migrations {
    if let Err(e) = conn.execute(migration, []) {
        // 只检查 "duplicate column name"，没有版本追踪
    }
}

// 问题 2: 重复的迁移执行代码
// L490-512, L514-547, L549-567 等多处重复
// 问题 3: 无法回滚
```

### 迁移模式 (Migration Pattern)

#### 1. 定义迁移结构

```rust
// database/migration.rs

use rusqlite::Connection;
use chrono::{DateTime, Utc};

/// 迁移定义
pub struct Migration {
    /// 版本号（递增）
    pub version: i32,
    /// 迁移名称
    pub name: &'static str,
    /// 向前迁移 SQL
    pub up: &'static str,
    /// 回滚 SQL（可选）
    pub down: Option<&'static str>,
}

/// 迁移记录
#[derive(Debug)]
pub struct MigrationRecord {
    pub version: i32,
    pub name: String,
    pub applied_at: DateTime<Utc>,
}

/// 迁移执行器
pub struct MigrationRunner<'a> {
    conn: &'a Connection,
}

impl<'a> MigrationRunner<'a> {
    pub fn new(conn: &'a Connection) -> Self {
        Self { conn }
    }

    /// 确保版本表存在
    pub fn ensure_schema_version_table(&self) -> Result<(), String> {
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS schema_version (
                version INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                applied_at TEXT NOT NULL
            )",
            [],
        ).map_err(|e| e.to_string())
    }

    /// 获取当前数据库版本
    pub fn get_current_version(&self) -> Result<i32, String> {
        self.ensure_schema_version_table()?;

        let version: i32 = self.conn
            .query_row(
                "SELECT COALESCE(MAX(version), 0) FROM schema_version",
                [],
                |row| row.get(0),
            )
            .unwrap_or(0);

        Ok(version)
    }

    /// 获取已应用的迁移
    pub fn get_applied_migrations(&self) -> Result<Vec<MigrationRecord>, String> {
        self.ensure_schema_version_table()?;

        let mut stmt = self.conn
            .prepare("SELECT version, name, applied_at FROM schema_version ORDER BY version")
            .map_err(|e| e.to_string())?;

        let records = stmt
            .query_map([], |row| {
                Ok(MigrationRecord {
                    version: row.get(0)?,
                    name: row.get(1)?,
                    applied_at: row.get::<_, String>(2)?.parse().unwrap_or(Utc::now()),
                })
            })
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;

        Ok(records)
    }

    /// 应用单个迁移
    pub fn apply_migration(&self, migration: &Migration) -> Result<(), String> {
        let tx = self.conn.transaction().map_err(|e| e.to_string())?;

        // 执行迁移 SQL
        tx.execute(migration.up, [])
            .map_err(|e| format!("Migration {} failed: {}", migration.name, e))?;

        // 记录版本
        tx.execute(
            "INSERT INTO schema_version (version, name, applied_at) VALUES (?1, ?2, ?3)",
            rusqlite::params![
                migration.version,
                migration.name,
                Utc::now().to_rfc3339()
            ],
        ).map_err(|e| e.to_string())?;

        tx.commit().map_err(|e| e.to_string())?;
        log::info!("Applied migration v{}: {}", migration.version, migration.name);
        Ok(())
    }

    /// 回滚单个迁移
    pub fn rollback_migration(&self, migration: &Migration) -> Result<(), String> {
        let down_sql = migration.down
            .ok_or_else(|| format!("Migration {} has no rollback SQL", migration.name))?;

        let tx = self.conn.transaction().map_err(|e| e.to_string())?;

        // 执行回滚 SQL
        tx.execute(down_sql, [])
            .map_err(|e| format!("Rollback {} failed: {}", migration.name, e))?;

        // 删除版本记录
        tx.execute(
            "DELETE FROM schema_version WHERE version = ?1",
            rusqlite::params![migration.version],
        ).map_err(|e| e.to_string())?;

        tx.commit().map_err(|e| e.to_string())?;
        log::info!("Rolled back migration v{}: {}", migration.version, migration.name);
        Ok(())
    }

    /// 运行所有待应用的迁移
    pub fn run_pending_migrations(&self, migrations: &[Migration]) -> Result<Vec<&'static str>, String> {
        let current_version = self.get_current_version()?;
        let mut applied = Vec::new();

        for migration in migrations {
            if migration.version > current_version {
                self.apply_migration(migration)?;
                applied.push(migration.name);
            }
        }

        Ok(applied)
    }
}
```

#### 2. 定义迁移列表

```rust
// database/migrations/mod.rs

use super::migration::Migration;

pub const MIGRATIONS: &[Migration] = &[
    Migration {
        version: 1,
        name: "initial_schema",
        up: include_str!("v1_initial.sql"),
        down: None,  // 初始迁移不可回滚
    },
    Migration {
        version: 2,
        name: "add_memory_categories",
        up: include_str!("v2_memory_categories.sql"),
        down: Some("DROP TABLE IF EXISTS memory_categories;"),
    },
    Migration {
        version: 3,
        name: "add_agent_mcp_configs",
        up: include_str!("v3_agent_mcp_configs.sql"),
        down: Some("DROP TABLE IF EXISTS agent_mcp_configs;"),
    },
    // ... 更多迁移
];
```

#### 3. 在初始化时使用

```rust
// database/mod.rs

pub fn init_database() -> Result<Connection, String> {
    let db_path = get_db_path()?;
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    // 启用外键约束
    conn.execute("PRAGMA foreign_keys = ON", [])
        .map_err(|e| e.to_string())?;

    // 运行迁移
    let runner = MigrationRunner::new(&conn);
    let applied = runner.run_pending_migrations(MIGRATIONS)?;

    if !applied.is_empty() {
        log::info!("Applied {} migrations: {:?}", applied.len(), applied);
    }

    Ok(conn)
}
```

### 工厂模式 (Factory Pattern) - 数据库连接

```rust
// database/factory.rs

use std::path::PathBuf;
use rusqlite::Connection;

/// 数据库配置
pub struct DatabaseConfig {
    pub path: PathBuf,
    pub enable_foreign_keys: bool,
    pub busy_timeout_ms: u32,
    pub journal_mode: String,
}

impl Default for DatabaseConfig {
    fn default() -> Self {
        Self {
            path: PathBuf::from("data.db"),
            enable_foreign_keys: true,
            busy_timeout_ms: 5000,
            journal_mode: "WAL".to_string(),
        }
    }
}

/// 数据库连接工厂
pub struct ConnectionFactory;

impl ConnectionFactory {
    /// 创建新连接
    pub fn create(config: &DatabaseConfig) -> Result<Connection, String> {
        // 确保父目录存在
        if let Some(parent) = config.path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create directory: {}", e))?;
        }

        // 打开连接
        let conn = Connection::open(&config.path)
            .map_err(|e| format!("Failed to open database: {}", e))?;

        // 配置连接
        if config.enable_foreign_keys {
            conn.execute("PRAGMA foreign_keys = ON", [])
                .map_err(|e| e.to_string())?;
        }

        conn.execute(
            &format!("PRAGMA busy_timeout = {}", config.busy_timeout_ms),
            [],
        ).map_err(|e| e.to_string())?;

        conn.execute(&format!("PRAGMA journal_mode = {}", config.journal_mode), [])
            .map_err(|e| e.to_string())?;

        Ok(conn)
    }

    /// 创建内存数据库（用于测试）
    #[cfg(test)]
    pub fn create_in_memory() -> Result<Connection, String> {
        let conn = Connection::open_in_memory()
            .map_err(|e| format!("Failed to create in-memory database: {}", e))?;

        conn.execute("PRAGMA foreign_keys = ON", [])
            .map_err(|e| e.to_string())?;

        Ok(conn)
    }
}
```

### 重构收益

| 方面 | 重构前 | 重构后 |
|------|--------|--------|
| 迁移追踪 | 无版本控制 | schema_version 表记录 |
| 回滚能力 | 不支持 | 支持 down SQL |
| 迁移文件 | 硬编码在代码中 | 独立 SQL 文件 |
| 测试 | 难以测试迁移 | 可单独测试每个迁移 |
| 连接配置 | 分散 | DatabaseConfig 统一 |

---

## 优化优先级

| 优先级 | 问题 | 工作量 | 影响 |
|--------|------|--------|------|
| P0 | 修复中文注释乱码 | 低 | 可读性 |
| P1 | 添加迁移模式 | 高 | 可维护性 |
| P1 | 提取重复迁移逻辑 | 低 | 代码质量 |
| P2 | 添加连接工厂 | 中 | 可测试性 |
| P2 | 使用日志框架 | 低 | 可观测性 |
| P3 | 拆分迁移文件 | 高 | 可维护性 |
