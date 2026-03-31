from __future__ import annotations

import os
import signal
import sys
import threading
import time

import uvicorn

from backend.api.main import app


def _is_parent_alive(parent_pid: int) -> bool:
    if parent_pid <= 0:
        return False

    if sys.platform == "win32":
        try:
            import ctypes

            process = ctypes.windll.kernel32.OpenProcess(0x100000, 0, parent_pid)
            if not process:
                return False
            ctypes.windll.kernel32.CloseHandle(process)
            return True
        except Exception:
            return False

    try:
        os.kill(parent_pid, 0)
        return True
    except OSError:
        return False


def _start_parent_watchdog(parent_pid: int, interval_seconds: float = 2.0) -> None:
    if parent_pid <= 0:
        return

    def _watch_parent() -> None:
        while True:
            time.sleep(interval_seconds)

            # 父进程异常退出后，当前进程通常会被重新挂到 init/launchd 下。
            if os.getppid() in {0, 1}:
                print("[Electron-Python] 检测到父进程已脱离，后端即将退出")
                os._exit(0)

            if not _is_parent_alive(parent_pid):
                print(f"[Electron-Python] 父进程 {parent_pid} 已退出，后端即将退出")
                os._exit(0)

    watcher = threading.Thread(target=_watch_parent, name="electron-parent-watchdog", daemon=True)
    watcher.start()


def main() -> None:
    host = os.environ.get("HOST", "127.0.0.1")
    port = int(os.environ.get("PORT", "18000"))
    parent_pid = int(os.environ.get("ELECTRON_PARENT_PID", "0"))

    if parent_pid > 0:
        _start_parent_watchdog(parent_pid)

    def _shutdown_handler(signum, _frame) -> None:
        print(f"[Electron-Python] 收到退出信号 {signum}，准备关闭后端")
        raise SystemExit(0)

    signal.signal(signal.SIGTERM, _shutdown_handler)
    signal.signal(signal.SIGINT, _shutdown_handler)

    print(
        f"[Electron-Python] 启动 FastAPI 服务: http://{host}:{port} "
        f"(parent_pid={parent_pid or 'unknown'})"
    )
    uvicorn.run(app, host=host, port=port, log_level="info")


if __name__ == "__main__":
    main()
