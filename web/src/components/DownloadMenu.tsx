import { useState, useRef, useEffect } from "react";
import { Button } from "@heroui/react";

interface DownloadMenuProps {
  onDownload: (type: "original" | "tinypng", format: "png" | "webp") => void;
}

export function DownloadMenu({ onDownload }: DownloadMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
      };
    }
  }, [isOpen]);

  return (
    <div ref={menuRef} className="relative">
      <Button
        isIconOnly
        aria-label="下载"
        color="success"
        size="sm"
        variant="shadow"
        onPress={() => setIsOpen(!isOpen)}
      >
        ⬇️
      </Button>

      {isOpen && (
        <div className="absolute top-full right-0 mt-2 bg-white rounded-lg shadow-lg border border-gray-200 p-2 z-50 min-w-[200px]">
          {/* 原图行 */}
          <div className="mb-2">
            <div className="text-xs text-gray-500 mb-1 px-2">原图</div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="flat"
                color="primary"
                className="flex-1"
                onPress={() => {
                  onDownload("original", "png");
                  setIsOpen(false);
                }}
              >
                PNG
              </Button>
              <Button
                size="sm"
                variant="flat"
                color="primary"
                className="flex-1"
                onPress={() => {
                  onDownload("original", "webp");
                  setIsOpen(false);
                }}
              >
                WebP
              </Button>
            </div>
          </div>

          {/* TinyPNG行 */}
          <div>
            <div className="text-xs text-gray-500 mb-1 px-2">TinyPNG</div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="flat"
                color="secondary"
                className="flex-1"
                onPress={() => {
                  onDownload("tinypng", "png");
                  setIsOpen(false);
                }}
              >
                PNG
              </Button>
              <Button
                size="sm"
                variant="flat"
                color="secondary"
                className="flex-1"
                onPress={() => {
                  onDownload("tinypng", "webp");
                  setIsOpen(false);
                }}
              >
                WebP
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

