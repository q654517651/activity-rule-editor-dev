/**
 * Electron Main Process
 * 独立于现有 Web 应用的 Electron 入口
 */
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import net from 'net';
import { spawn, spawnSync } from 'child_process';
import serve from 'electron-serve';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow = null;
let pythonBackend = null;
let backendPort = null;
let backendUrl = null;
let isQuitting = false;
let backendStopPromise = null;

const isDev = !app.isPackaged || process.env.NODE_ENV === 'development';
const appRoot = isDev ? path.join(__dirname, '../..') : process.resourcesPath;
const defaultBackendHost = '127.0.0.1';
const backendExecutableName =
  process.platform === 'win32'
    ? 'activity-rule-editor-backend.exe'
    : 'activity-rule-editor-backend';

// 在生产模式下提供静态文件服务
const loadURL = isDev
  ? null
  : serve({
      directory: path.join(process.resourcesPath, 'web-dist'),
      scheme: 'app',
    });

/**
 * 查找可用的 Python 可执行文件
 */
function resolvePythonCommand() {
  const candidates = [
    process.env.ACTIVITY_RULE_EDITOR_PYTHON,
    path.join(appRoot, '.venv', 'bin', 'python'),
    path.join(appRoot, '.venv', 'Scripts', 'python.exe'),
    'python3',
    'python',
  ].filter(Boolean);

  for (const candidate of candidates) {
    const looksLikePath = candidate.includes(path.sep);
    if (looksLikePath && !fs.existsSync(candidate)) {
      continue;
    }

    const probe = spawnSync(candidate, ['--version'], {
      cwd: appRoot,
      stdio: 'ignore',
      env: process.env,
    });

    if (probe.status === 0 && !probe.error) {
      return candidate;
    }
  }

  throw new Error(
    '未找到可用的 Python 解释器，请设置 ACTIVITY_RULE_EDITOR_PYTHON 或先创建 .venv'
  );
}

/**
 * 获取打包后的 Python 后端单文件路径
 */
function resolveBundledBackendExecutable() {
  const executablePath = path.join(process.resourcesPath, 'backend-bin', backendExecutableName);
  if (!fs.existsSync(executablePath)) {
    throw new Error(`未找到打包后的 Python 后端可执行文件：${executablePath}`);
  }
  return executablePath;
}

/**
 * 根据环境决定后端启动方式
 */
function resolveBackendLaunchConfig() {
  if (isDev) {
    const pythonCommand = resolvePythonCommand();
    const pythonPathEntries = [appRoot, process.env.PYTHONPATH].filter(Boolean);

    return {
      command: pythonCommand,
      args: ['-m', 'backend.electron_server'],
      cwd: appRoot,
      env: {
        ...process.env,
        PYTHONPATH: pythonPathEntries.join(path.delimiter),
      },
    };
  }

  const executablePath = resolveBundledBackendExecutable();
  return {
    command: executablePath,
    args: [],
    cwd: path.dirname(executablePath),
    env: {
      ...process.env,
    },
  };
}

/**
 * 获取一个空闲端口，避免与本机已有后端冲突
 */
function getFreePort(host = defaultBackendHost) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();

    server.on('error', reject);
    server.listen(0, host, () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('无法分配 Electron 后端端口')));
        return;
      }
      server.close(() => resolve(address.port));
    });
  });
}

/**
 * 等待 FastAPI 后端健康检查通过
 */
async function waitForBackendReady(url, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (!pythonBackend || pythonBackend.exitCode !== null) {
      throw new Error('Python 后端在启动完成前已退出');
    }

    try {
      const response = await fetch(`${url}/health`);
      if (response.ok) {
        return;
      }
    } catch {
      // 后端尚未就绪，继续重试
    }

    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  throw new Error(`等待 Python 后端就绪超时：${url}`);
}

/**
 * 启动 Python FastAPI 后端
 */
async function startPythonBackend() {
  backendPort = await getFreePort();
  backendUrl = `http://${defaultBackendHost}:${backendPort}`;

  const launchConfig = resolveBackendLaunchConfig();

  console.log('[Electron] 启动 Python 后端...');
  console.log('[Electron] 后端命令:', launchConfig.command);
  console.log('[Electron] 后端目录:', appRoot);
  console.log('[Electron] 后端地址:', backendUrl);

  pythonBackend = spawn(launchConfig.command, launchConfig.args, {
    stdio: 'inherit',
    cwd: launchConfig.cwd,
    windowsHide: true,
    env: {
      ...launchConfig.env,
      PYTHONUNBUFFERED: '1',
      HOST: defaultBackendHost,
      PORT: String(backendPort),
      ELECTRON_PARENT_PID: String(process.pid),
      NODE_ENV: isDev ? 'development' : 'production',
    },
  });

  pythonBackend.on('error', (err) => {
    console.error('[Electron] Python 后端启动失败:', err);
  });

  pythonBackend.on('exit', (code, signal) => {
    console.log(`[Electron] Python 后端退出，code=${code}, signal=${signal ?? 'none'}`);
    const exitedUnexpectedly = !isQuitting && !backendStopPromise;
    pythonBackend = null;

    if (exitedUnexpectedly) {
      console.error('[Electron] Python 后端意外退出，应用即将关闭');
      app.exit(code ?? 1);
    }
  });

  await waitForBackendReady(backendUrl);
}

/**
 * 关闭 Python 后端
 */
async function stopPythonBackend() {
  if (!pythonBackend) {
    return;
  }

  if (backendStopPromise) {
    return backendStopPromise;
  }

  const child = pythonBackend;
  console.log(`[Electron] 准备停止 Python 后端 (pid=${child.pid})`);

  backendStopPromise = new Promise((resolve) => {
    let settled = false;

    const finish = () => {
      if (settled) return;
      settled = true;
      backendStopPromise = null;
      pythonBackend = null;
      resolve();
    };

    child.once('exit', () => {
      finish();
    });

    if (process.platform === 'win32') {
      const killer = spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], {
        windowsHide: true,
        stdio: 'ignore',
      });
      killer.once('exit', () => finish());
      return;
    }

    child.kill('SIGTERM');

    setTimeout(() => {
      if (!settled && child.exitCode === null) {
        console.warn('[Electron] Python 后端未及时退出，升级为 SIGKILL');
        child.kill('SIGKILL');
      }
    }, 4000);

    setTimeout(() => {
      finish();
    }, 5000);
  });

  return backendStopPromise;
}

/**
 * 主进程异常结束时，尽最大努力同步回收后端
 */
function killBackendImmediately() {
  if (!pythonBackend) {
    return;
  }

  try {
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/pid', String(pythonBackend.pid), '/t', '/f'], {
        windowsHide: true,
        stdio: 'ignore',
      });
    } else {
      pythonBackend.kill('SIGTERM');
    }
  } catch (err) {
    console.error('[Electron] 紧急停止 Python 后端失败:', err);
  }
}

/**
 * 显示启动失败提示，避免应用静默闪退
 */
function showStartupError(error) {
  const details = error instanceof Error ? error.stack || error.message : String(error);
  console.error('[Electron] 启动失败:', details);
  dialog.showErrorBox(
    'Activity Rule Editor 启动失败',
    `${error instanceof Error ? error.message : String(error)}\n\n` +
      '请确认已先构建 Python 后端单文件，再重新打包 Electron。'
  );
}

/**
 * 统一退出流程
 */
async function shutdownApp(exitCode = 0) {
  if (isQuitting) {
    return;
  }

  isQuitting = true;
  await stopPythonBackend();
  app.exit(exitCode);
}

/**
 * 创建主窗口
 */
async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    titleBarStyle: 'default',
    show: false, // 等待加载完成后显示
  });

  // 加载前端页面
  if (isDev) {
    // 开发模式：加载 Vite 开发服务器
    mainWindow.loadURL('http://localhost:5173/activity-rule-editor/');
    mainWindow.webContents.openDevTools();
  } else {
    // 生产模式：使用 electron-serve 提供静态文件
    await loadURL(mainWindow);
    // Electron 构建使用相对资源路径，必须从 app 根路径加载
    mainWindow.loadURL('app://-/');
  }

  // 窗口加载完成后显示
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    console.log('[Electron] 窗口已显示');
  });

  // 窗口关闭
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // 拦截外部链接
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // 在默认浏览器中打开外部链接
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

/**
 * 应用启动
 */
app.whenReady().then(async () => {
  try {
    await startPythonBackend();
    await createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  } catch (error) {
    showStartupError(error);
    killBackendImmediately();
    app.exit(1);
  }
});

/**
 * 所有窗口关闭
 */
app.on('window-all-closed', () => {
  // macOS 除外
  if (process.platform !== 'darwin') {
    void shutdownApp(0);
  }
});

/**
 * 应用退出前清理
 */
app.on('before-quit', (event) => {
  if (!isQuitting) {
    event.preventDefault();
    console.log('[Electron] 应用即将退出，清理 Python 后端...');
    void shutdownApp(0);
  }
});

app.on('render-process-gone', (_event, webContents, details) => {
  console.error('[Electron] 渲染进程异常退出:', details.reason);
  if (mainWindow && webContents.id === mainWindow.webContents.id) {
    void shutdownApp(1);
  }
});

app.on('child-process-gone', (_event, details) => {
  console.error('[Electron] 子进程异常退出:', details.type, details.reason);
});

/**
 * IPC 通信示例
 */
ipcMain.handle('get-backend-url', () => {
  return backendUrl ?? `http://${defaultBackendHost}:18000`;
});

ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

process.on('SIGINT', () => {
  void shutdownApp(0);
});

process.on('SIGTERM', () => {
  void shutdownApp(0);
});

process.on('exit', () => {
  killBackendImmediately();
});

process.on('uncaughtException', (err) => {
  console.error('[Electron] 主进程未捕获异常:', err);
  killBackendImmediately();
  app.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('[Electron] 主进程未处理 Promise 拒绝:', reason);
});
