import { useState, useEffect } from "react";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Textarea,
} from "@heroui/react";
import type { TableData } from "@/renderer/canvas/types";
import { normalizeImageUrl } from "@/renderer/canvas/useImageCache";

interface TableEditModalProps {
  isOpen: boolean;
  table: TableData | null;
  onClose: () => void;
  onSave: (updatedTable: TableData) => void;
}

export function TableEditModal({
  isOpen,
  table,
  onClose,
  onSave,
}: TableEditModalProps) {
  const [editedTable, setEditedTable] = useState<TableData | null>(null);

  useEffect(() => {
    if (table) {
      // 深拷贝表格数据
      setEditedTable(JSON.parse(JSON.stringify(table)));
    }
  }, [table]);

  if (!editedTable) return null;

  const handleCellChange = (
    rowIdx: number,
    cellIdx: number,
    value: string,
  ) => {
    const newTable = { ...editedTable };
    newTable.rows[rowIdx][cellIdx].value = value;
    setEditedTable(newTable);
  };

  // 处理图片上传
  const handleImageUpload = (rowIdx: number, cellIdx: number, file: File) => {
    if (!file.type.startsWith("image/")) {
      alert("请上传图片文件");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      const newTable = { ...editedTable };
      
      // 更新图片为 data URL
      if (typeof newTable.rows[rowIdx][cellIdx].image === "string") {
        newTable.rows[rowIdx][cellIdx].image = dataUrl;
      } else {
        newTable.rows[rowIdx][cellIdx].image = {
          url: dataUrl,
          id: `local-${Date.now()}`,
        };
      }
      
      setEditedTable(newTable);
    };
    reader.readAsDataURL(file);
  };

  const handleSave = () => {
    onSave(editedTable);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      scrollBehavior="inside"
      size="5xl"
      onClose={onClose}
    >
      <ModalContent>
        <ModalHeader>编辑表格</ModalHeader>
        <ModalBody>
          <div className="overflow-auto">
            <table className="w-full border-collapse border border-gray-300">
              <tbody>
                {editedTable.rows.map((row, rowIdx) => (
                  <tr key={rowIdx}>
                    {row.map((cell, cellIdx) => {
                      const key = `${rowIdx}-${cellIdx}`;
                      return (
                        <td
                          key={key}
                          className="border border-gray-300 p-2 relative"
                          colSpan={cell.colspan || 1}
                          rowSpan={cell.rowspan || 1}
                          style={{
                            minWidth: "100px",
                            backgroundColor:
                              (cell.colspan && cell.colspan > 1) ||
                              (cell.rowspan && cell.rowspan > 1)
                                ? "#f0f9ff"
                                : "white",
                          }}
                        >
                          {/* 显示合并信息 */}
                          {((cell.colspan && cell.colspan > 1) ||
                            (cell.rowspan && cell.rowspan > 1)) && (
                            <div className="text-xs text-blue-600 mb-1">
                              {cell.colspan && cell.colspan > 1 && (
                                <span>colspan: {cell.colspan} </span>
                              )}
                              {cell.rowspan && cell.rowspan > 1 && (
                                <span>rowspan: {cell.rowspan}</span>
                              )}
                            </div>
                          )}

                          {/* 图片单元格 */}
                          {cell.is_image ? (
                            <div className="space-y-2">
                              <div className="text-sm font-medium text-gray-700 mb-2">
                                图片单元格
                              </div>
                              <div
                                className="relative border-2 border-dashed rounded-lg p-2 cursor-pointer hover:border-primary transition-colors"
                                role="button"
                                tabIndex={0}
                                onClick={() => {
                                  const input = document.createElement("input");
                                  input.type = "file";
                                  input.accept = "image/*";
                                  input.onchange = (e) => {
                                    const file = (e.target as HTMLInputElement).files?.[0];
                                    if (file) {
                                      handleImageUpload(rowIdx, cellIdx, file);
                                    }
                                  };
                                  input.click();
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" || e.key === " ") {
                                    e.preventDefault();
                                    e.currentTarget.click();
                                  }
                                }}
                              >
                                {cell.image ? (
                                  <div className="relative">
                                    <img
                                      alt="表格图片"
                                      className="max-w-full h-auto max-h-40 object-contain mx-auto"
                                      src={normalizeImageUrl(
                                        typeof cell.image === "string"
                                          ? cell.image
                                          : cell.image?.url || ""
                                      )}
                                      onError={(e) => {
                                        // 图片加载失败时显示提示
                                        e.currentTarget.style.display = "none";
                                        const parent = e.currentTarget.parentElement;
                                        if (parent && !parent.querySelector(".error-msg")) {
                                          const errorDiv = document.createElement("div");
                                          errorDiv.className = "error-msg text-red-500 text-sm text-center p-4";
                                          errorDiv.textContent = "图片加载失败，点击重新上传";
                                          parent.appendChild(errorDiv);
                                        }
                                      }}
                                    />
                                    <div className="absolute bottom-0 right-0 bg-primary text-white text-xs px-2 py-1 rounded-tl opacity-0 hover:opacity-100 transition-opacity">
                                      点击更换
                                    </div>
                                  </div>
                                ) : (
                                  <div className="text-center py-8 text-gray-400">
                                    <div className="text-4xl mb-2">📁</div>
                                    <p className="text-sm">点击上传图片</p>
                                  </div>
                                )}
                              </div>
                            </div>
                          ) : (
                            /* 文本单元格 */
                            <Textarea
                              className="w-full"
                              minRows={cell.bold ? 2 : 1}
                              size="sm"
                              value={cell.value || ""}
                              variant={cell.bold ? "bordered" : "flat"}
                              onChange={(e) =>
                                handleCellChange(rowIdx, cellIdx, e.target.value)
                              }
                            />
                          )}

                          {/* 样式标记 */}
                          <div className="flex gap-2 mt-1 text-xs">
                            {cell.bold && (
                              <span className="px-1 bg-gray-200 rounded">
                                粗体
                              </span>
                            )}
                            {cell.center && (
                              <span className="px-1 bg-gray-200 rounded">
                                居中
                              </span>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ModalBody>
        <ModalFooter>
          <Button color="danger" variant="light" onPress={onClose}>
            取消
          </Button>
          <Button color="primary" onPress={handleSave}>
            保存
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

