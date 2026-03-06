use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use tokio::sync::RwLock;

// 全局中断状态存储
lazy_static::lazy_static! {
    static ref ABORT_FLAGS: Arc<RwLock<HashMap<String, Arc<AtomicBool>>>> = Arc::new(RwLock::new(HashMap::new()));
}

/// 获取或创建中断标志
pub async fn get_abort_flag(session_id: &str) -> Arc<AtomicBool> {
    let flags = ABORT_FLAGS.read().await;
    if let Some(flag) = flags.get(session_id) {
        return flag.clone();
    }
    drop(flags);

    let mut flags = ABORT_FLAGS.write().await;
    let flag = Arc::new(AtomicBool::new(false));
    flags.insert(session_id.to_string(), flag.clone());
    flag
}

/// 设置中断标志
pub async fn set_abort_flag(session_id: &str, abort: bool) {
    let flag = get_abort_flag(session_id).await;
    flag.store(abort, Ordering::SeqCst);
}

/// 检查是否应该中断
pub async fn should_abort(session_id: &str) -> bool {
    get_abort_flag(session_id).await.load(Ordering::SeqCst)
}

/// 清理中断标志
pub async fn clear_abort_flag(session_id: &str) {
    let mut flags = ABORT_FLAGS.write().await;
    flags.remove(session_id);
}
