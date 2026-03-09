# 代码审查报告 - project 模块

> 审查日期: 2026-03-09
> 审查范围: `src-tauri/src/commands/project.rs`, `project_access.rs`

## 文件概览

| 文件 | 行数 | 说明 |
|------|------|------|
| `project.rs` | 802 | 项目 CRUD 和文件操作 |
| `project_access.rs` | 69 | 项目访问记录 |
| **总计** | **871** | |

---

## 架构分析

### 功能模块

```
┌─────────────────────────────────────────────────────────────┐
│                     Project Module                          │
├─────────────────────────────────────────────────────────────┤
│  项目管理                                                    │
│  - list_projects: 获取所有项目（含会话计数）                  │
│  - create_project: 创建项目                                  │
│  - update_project: 更新项目                                  │
│  - delete_project: 删除项目（级联删除）                      │
├─────────────────────────────────────────────────────────────┤
│  文件树操作                                                  │
│  - list_project_files: 列出项目文件（懒加载）                │
│  - load_directory_children: 加载目录子节点                   │
│  - list_all_project_files_flat: 扁平列表（@引用用）         │
├─────────────────────────────────────────────────────────────┤
│  文件操作                                                    │
│  - rename_file: 重命名                                       │
│  - delete_file: 删除单个                                     │
│  - batch_delete_files: 批量删除                              │
│  - move_file: 移动                                           │
├─────────────────────────────────────────────────────────────┤
│  访问记录                                                    │
│  - record_project_access: 记录访问                           │
│  - get_recent_projects: 获取最近访问                         │
└─────────────────────────────────────────────────────────────┘
```

---

## 问题分析

### 🟡 中优先级问题

#### 1. 重复的目录扫描逻辑

- **位置**: `project.rs` L294-381, L401-470, L516-597
- **问题**: `scan_directory_recursive`, `scan_single_directory`, `collect_files_flat` 有大量重复代码

**建议**: 提取公共逻辑

```rust
struct FileScanner {
    ignored_dirs: &'static [&'static str],
    ignored_files: &'static [&'static str],
}

impl FileScanner {
    fn should_skip(&self, name: &str, is_dir: bool) -> bool {
        if name.starts_with('.') {
            return true;
        }
        if is_dir && self.ignored_dirs.contains(&name) {
            return true;
        }
        if !is_dir && self.ignored_files.contains(&name) {
            return true;
        }
        false
    }

    fn create_node(&self, path: &Path, base_path: &Path) -> Option<FileTreeNode> {
        // 统一的节点创建逻辑
    }
}
```

#### 2. 未使用的结构体

- **位置**: `project_access.rs` L13-20
- **问题**: `ProjectAccessLog` 定义但未使用

```rust
#[allow(dead_code)]
pub struct ProjectAccessLog {
    pub project_id: String,
    pub last_accessed_at: i64,
    pub access_count: i64,
}
```

#### 3. 路径验证和解析重复

- **位置**: `project.rs` L215-268, L383-398
- **问题**: `validate_project_path` 和 `resolve_path` 有部分重复的路径展开逻辑

**建议**: 统一路径处理工具函数

### 🟢 低优先级问题

#### 4. update_project 返回不完整的 session_count

- **位置**: `project.rs` L179-187
- **问题**: 更新后返回 `session_count: 0`，而不是实际值

```rust
Ok(Project {
    id,
    name: input.name,
    path: input.path,
    description: input.description,
    session_count: 0,  // 应该查询实际值
    created_at: now.clone(),
    updated_at: now,
})
```

#### 5. 批量删除的错误处理

- **位置**: `project.rs` L693-743
- **问题**: 部分失败时返回 `success: false`，但可能大部分已成功删除

**建议**: 返回更详细的结果

```rust
pub struct BatchDeleteResult {
    pub total: i32,
    pub success_count: i32,
    pub failed_count: i32,
    pub errors: Vec<String>,
}
```

#### 6. 硬编码的忽略列表

- **位置**: `project.rs` L270-291
- **问题**: 忽略目录和文件列表硬编码

**建议**: 可配置化或从 .gitignore 读取

---

## 设计亮点

### 1. 懒加载文件树

`list_project_files` 使用懒加载模式，只加载第一层：

```rust
// 目录的 children 设为 None，序列化后为 null
// Naive UI 的懒加载需要 children 为 null/undefined 才会触发 onLoad
nodes.push(FileTreeNode {
    name,
    path: path.to_string_lossy().to_string(),
    node_type: FileNodeType::Directory,
    children: None, // null 表示需要懒加载
    extension: None,
});
```

### 2. UPSERT 模式记录访问

```sql
INSERT INTO project_access_log (project_id, last_accessed_at, access_count)
VALUES (?1, strftime('%s', 'now'), 1)
ON CONFLICT(project_id) DO UPDATE SET
    last_accessed_at = strftime('%s', 'now'),
    access_count = access_count + 1
```

### 3. 级联删除

正确启用了外键约束以触发级联删除：

```rust
conn.execute("PRAGMA foreign_keys = ON", [])
    .map_err(|e| e.to_string())?;
conn.execute("DELETE FROM projects WHERE id = ?1", [&id])
```

### 4. 扁平文件列表支持 @ 引用

`list_all_project_files_flat` 提供相对路径，方便前端显示：

```rust
pub struct FlatFileInfo {
    pub name: String,
    pub path: String,
    pub relative_path: String,  // 相对于项目根目录
    pub node_type: FileNodeType,
    pub extension: Option<String>,
}
```

---

## 优化建议

### 1. 提取文件扫描器

```rust
pub struct FileScanner {
    ignored_dirs: HashSet<&'static str>,
    ignored_files: HashSet<&'static str>,
}

impl FileScanner {
    pub fn new() -> Self {
        Self {
            ignored_dirs: IGNORED_DIRS.iter().copied().collect(),
            ignored_files: IGNORED_FILES.iter().copied().collect(),
        }
    }

    pub fn scan_directory(&self, path: &Path, mode: ScanMode) -> Result<Vec<FileTreeNode>, String> {
        // 统一的扫描逻辑
    }
}
```

### 2. 添加文件操作事务

对于批量操作，考虑添加事务或回滚机制：

```rust
pub fn batch_delete_files_with_rollback(paths: &[String]) -> Result<BatchDeleteResult, String> {
    let mut deleted = Vec::new();
    let mut errors = Vec::new();

    for path in paths {
        match delete_file_internal(path) {
            Ok(_) => deleted.push(path.clone()),
            Err(e) => errors.push((path.clone(), e)),
        }
    }

    // 如果需要回滚，可以恢复已删除的文件
    // ...
}
```

### 3. 添加文件监听

对于大型项目，考虑添加文件变更监听：

```rust
use notify::{Watcher, RecursiveMode};

pub fn watch_project_directory(path: &Path, callback: impl Fn(FileEvent)) -> Result<Watcher> {
    // ...
}
```

---

## 优化优先级

| 优先级 | 问题 | 工作量 | 影响 |
|--------|------|--------|------|
| P1 | 提取重复的扫描逻辑 | 中 | 减少重复 |
| P2 | 修复 update_project 返回值 | 低 | 正确性 |
| P2 | 删除未使用的结构体 | 低 | 代码整洁 |
| P3 | 统一路径处理 | 低 | 可维护性 |
| P3 | 批量操作结果改进 | 低 | 用户体验 |

---

## 总结

project 模块设计合理，代码质量较好。主要优化方向：
1. 减少重复的目录扫描代码
2. 完善批量操作的结果反馈
3. 考虑添加文件监听功能
