import React, { useRef, useState, useCallback } from "react";

export interface DragDropZoneProps {
  onFile: (file: File) => void;
  accept?: string;
  loading?: boolean;
  label?: string;
  description?: string;
  icon?: React.ReactNode;
}

/**
 * 拖拽上传区域组件
 * 支持点击选择文件和拖拽上传
 */
export const DragDropZone: React.FC<DragDropZoneProps> = ({
  onFile,
  accept = "*/*",
  loading = false,
  label = "选择文件",
  description = "或将文件拖至此处",
  icon,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragEnter = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);

      const file = e.dataTransfer.files?.[0];

      if (file) {
        onFile(file);
      }
    },
    [onFile],
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];

      if (file) {
        onFile(file);
      }
      // 重置 input，这样相同文件也能再次触发 change 事件
      if (inputRef.current) {
        inputRef.current.value = "";
      }
    },
    [onFile],
  );

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      e.preventDefault();
      if (!loading) {
        inputRef.current?.click();
      }
    },
    [loading],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if ((e.key === "Enter" || e.key === " ") && !loading) {
        e.preventDefault();
        inputRef.current?.click();
      }
    },
    [loading],
  );

  return (
    <div
      className={`
        relative
        rounded-lg
        border-2
        border-dashed
        transition-all
        duration-200
        p-8
        text-center
        cursor-pointer
        ${
          isDragOver
            ? "border-blue-500 bg-blue-50"
            : "border-gray-300 bg-gray-50 hover:border-blue-400"
        }
      `}
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onKeyDown={handleKeyDown}
    >
      <input
        ref={inputRef}
        accept={accept}
        className="hidden"
        disabled={loading}
        type="file"
        onChange={handleInputChange}
      />

      <div className="flex flex-col items-center gap-2">
        {icon && <div className="text-3xl">{icon}</div>}

        <div>
          <p className="text-sm font-semibold text-gray-700">{label}</p>
          <p className="text-xs text-gray-500 mt-1">{description}</p>
        </div>

        {loading && (
          <div className="mt-2">
            <div className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-blue-500 border-r-transparent" />
          </div>
        )}
      </div>
    </div>
  );
};

export default DragDropZone;
