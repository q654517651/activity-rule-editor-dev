import { useState, useEffect } from "react";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Input,
  Textarea,
} from "@heroui/react";
import type { TableData } from "@/renderer/canvas/types";

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
                              <div className="text-sm font-medium text-gray-700">
                                图片单元格
                              </div>
                              {cell.image && (
                                <img
                                  alt="表格图片"
                                  className="max-w-full h-auto max-h-40 object-contain"
                                  src={
                                    typeof cell.image === "string"
                                      ? cell.image
                                      : cell.image?.url
                                  }
                                />
                              )}
                              <Input
                                label="图片URL"
                                size="sm"
                                value={cell.value || ""}
                                onChange={(e) =>
                                  handleCellChange(rowIdx, cellIdx, e.target.value)
                                }
                              />
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

