import { useState, useCallback, useEffect } from "react";
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  ScrollShadow,
  Chip,
  Spinner,
} from "@heroui/react";

export interface DownloadItem {
  id: string;
  name: string;
  status: "pending" | "processing" | "ready" | "error";
  dataUrl?: string;
  error?: string;
  timestamp: number;
  format: "png" | "webp";
  type: "original" | "tinypng";
}

interface DownloadHistoryProps {
  items: DownloadItem[];
  onDownload: (item: DownloadItem) => void;
  onClear: () => void;
  currentSessionId: string | null;
}

export function DownloadHistory({
  items,
  onDownload,
  onClear,
  currentSessionId,
}: DownloadHistoryProps) {
  // 整个组件折叠状态
  const [isCollapsed, setIsCollapsed] = useState(false);

  // 确保当前会话始终展开
  const [expandedSessions, setExpandedSessions] = useState<Set<string>>(
    new Set(currentSessionId ? [currentSessionId] : []),
  );

  // 当 currentSessionId 变化时，自动展开
  useEffect(() => {
    if (currentSessionId) {
      setExpandedSessions((prev) => new Set([...prev, currentSessionId]));
      // 有新下载时自动展开组件
      setIsCollapsed(false);
    }
  }, [currentSessionId]);

  // 按会话分组
  const groupedItems = items.reduce(
    (acc, item) => {
      const sessionId = item.id.split("-")[0] || "unknown";
      if (!acc[sessionId]) {
        acc[sessionId] = [];
      }
      acc[sessionId].push(item);
      return acc;
    },
    {} as Record<string, DownloadItem[]>,
  );

  // 对每个会话内的记录按时间倒序排列
  Object.keys(groupedItems).forEach((sessionId) => {
    groupedItems[sessionId].sort((a, b) => b.timestamp - a.timestamp);
  });

  const toggleSession = useCallback((sessionId: string) => {
    setExpandedSessions((prev) => {
      const next = new Set(prev);
      if (next.has(sessionId)) {
        next.delete(sessionId);
      } else {
        next.add(sessionId);
      }
      return next;
    });
  }, []);

  const currentItems = currentSessionId
    ? (groupedItems[currentSessionId] || []).sort(
        (a, b) => b.timestamp - a.timestamp,
      )
    : [];

  // 历史会话按时间倒序排列（根据会话中最早的时间戳）
  const historyItems = Object.entries(groupedItems)
    .filter(([sessionId]) => sessionId !== currentSessionId)
    .map(([sessionId, sessionItems]) => {
      // 获取会话中最早的时间戳作为会话时间
      const sessionTime = Math.min(...sessionItems.map((item) => item.timestamp));
      return { sessionId, sessionItems, sessionTime };
    })
    .sort((a, b) => b.sessionTime - a.sessionTime)
    .map(({ sessionId, sessionItems }) => [sessionId, sessionItems] as [string, DownloadItem[]]);

  if (items.length === 0) {
    return null;
  }

  // 如果折叠，只显示一个小的展开按钮
  if (isCollapsed) {
    return (
      <div className="fixed bottom-4 right-4 z-50">
        <Button
          color="primary"
          size="md"
          variant="shadow"
          onPress={() => setIsCollapsed(false)}
          className="rounded-lg"
          endContent={<span className="text-lg">▲</span>}
          aria-label="展开下载历史"
        >
          下载历史 ({items.length})
        </Button>
      </div>
    );
  }

  return (
    <Card className="fixed bottom-4 right-4 w-96 max-h-[600px] z-50 shadow-lg">
      <CardHeader className="flex justify-between items-center px-4 py-3 border-b">
        <h3 className="text-lg font-semibold">下载历史</h3>
        <div className="flex items-center gap-2">
          <Button
            isIconOnly
            size="sm"
            variant="light"
            onPress={() => setIsCollapsed(true)}
            aria-label="折叠"
          >
            ▼
          </Button>
          <Button color="danger" size="sm" variant="light" onPress={onClear}>
            清空
          </Button>
        </div>
      </CardHeader>
      <CardBody className="p-0">
        <ScrollShadow className="max-h-[500px]">
          <div className="p-2">
            {/* 当前会话 */}
            {currentItems.length > 0 && (
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2 px-2">
                  <h4 className="text-sm font-medium text-gray-700">
                    本次下载 ({currentItems.length})
                  </h4>
                </div>
                <div className="space-y-2">
                  {currentItems.map((item) => (
                    <DownloadItemCard
                      key={item.id}
                      item={item}
                      onDownload={onDownload}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* 历史会话 */}
            {historyItems.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2 px-2">
                  <h4 className="text-sm font-medium text-gray-700">
                    历史记录 ({historyItems.length})
                  </h4>
                  <Button
                    size="sm"
                    variant="light"
                    onPress={() => {
                      const allExpanded =
                        historyItems.every(([id]) =>
                          expandedSessions.has(id),
                        );
                      if (allExpanded) {
                        setExpandedSessions(
                          new Set(currentSessionId ? [currentSessionId] : []),
                        );
                      } else {
                        setExpandedSessions(
                          new Set([
                            ...(currentSessionId ? [currentSessionId] : []),
                            ...historyItems.map(([id]) => id),
                          ]),
                        );
                      }
                    }}
                  >
                    {historyItems.every(([id]) => expandedSessions.has(id))
                      ? "折叠全部"
                      : "展开全部"}
                  </Button>
                </div>
                <div className="space-y-2">
                  {historyItems.map(([sessionId, sessionItems]) => (
                    <div key={sessionId} className="border rounded-lg">
                      <button
                        className="w-full px-3 py-2 text-left flex items-center justify-between hover:bg-gray-50"
                        onClick={() => toggleSession(sessionId)}
                      >
                        <span className="text-sm font-medium">
                          会话 {sessionId.slice(0, 8)}... ({sessionItems.length}
                          )
                        </span>
                        <span className="text-xs text-gray-500">
                          {expandedSessions.has(sessionId) ? "▼" : "▶"}
                        </span>
                      </button>
                      {expandedSessions.has(sessionId) && (
                        <div className="px-2 pb-2 space-y-2">
                          {sessionItems.map((item) => (
                            <DownloadItemCard
                              key={item.id}
                              item={item}
                              onDownload={onDownload}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </ScrollShadow>
      </CardBody>
    </Card>
  );
}

function DownloadItemCard({
  item,
  onDownload,
}: {
  item: DownloadItem;
  onDownload: (item: DownloadItem) => void;
}) {
  const getStatusColor = () => {
    switch (item.status) {
      case "ready":
        return "success";
      case "processing":
        return "warning";
      case "error":
        return "danger";
      default:
        return "default";
    }
  };

  const getStatusText = () => {
    switch (item.status) {
      case "ready":
        return "就绪";
      case "processing":
        return "处理中";
      case "error":
        return "失败";
      default:
        return "等待中";
    }
  };

  // 格式化时间为时分秒
  const formatTime = (timestamp: number): string => {
    const date = new Date(timestamp);
    const hours = date.getHours().toString().padStart(2, "0");
    const minutes = date.getMinutes().toString().padStart(2, "0");
    const seconds = date.getSeconds().toString().padStart(2, "0");
    return `${hours}:${minutes}:${seconds}`;
  };

  return (
    <div className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-medium truncate">
            {item.name} ({formatTime(item.timestamp)})
          </span>
          <Chip size="sm" color={getStatusColor()} variant="flat">
            {getStatusText()}
          </Chip>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span>
            {item.type === "tinypng" ? "TinyPNG" : "原图"} · {item.format.toUpperCase()}
          </span>
          {item.status === "processing" && <Spinner size="sm" />}
        </div>
        {item.error && (
          <div className="text-xs text-red-500 mt-1">{item.error}</div>
        )}
      </div>
      {item.status === "ready" && (
        <Button
          size="sm"
          color="primary"
          variant="flat"
          onPress={() => onDownload(item)}
        >
          下载
        </Button>
      )}
    </div>
  );
}

