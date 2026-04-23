/**
 * UndoManager - 撤销/重做管理器
 * 使用完整状态快照模式
 *
 * 约定：
 * - undoStack 存储过去的状态快照
 * - redoStack 存储被撤销的状态快照
 * - 当前状态不在任何栈上
 * - push() 保存修改前的状态到 undoStack，清空 redoStack
 * - undo() 弹出 undoStack 栈顶返回（即上一个状态）
 * - redo() 弹出 redoStack 栈顶返回（即下一个状态）
 */
export class UndoManager {
  constructor(maxSize = 30) {
    this.undoStack = [];
    this.redoStack = [];
    this.maxSize = maxSize;
  }

  /** 推入快照（修改前的状态） */
  push(snapshot) {
    this.undoStack.push(snapshot);
    if (this.undoStack.length > this.maxSize) {
      this.undoStack.shift();
    }
    // 新操作清空 redo 栈
    this.redoStack = [];
  }

  /**
   * 撤销：弹出 undoStack 栈顶快照，同时将当前状态压入 redoStack
   * @param {*} currentSnapshot - 当前状态快照（用于 redo）
   * @returns {*} 上一个状态快照，或 null
   */
  undo(currentSnapshot) {
    if (this.undoStack.length === 0) return null;
    if (currentSnapshot) {
      this.redoStack.push(currentSnapshot);
    }
    return this.undoStack.pop();
  }

  /**
   * 重做：弹出 redoStack 栈顶快照，同时将当前状态压入 undoStack
   * @param {*} currentSnapshot - 当前状态快照（用于 undo）
   * @returns {*} 下一个状态快照，或 null
   */
  redo(currentSnapshot) {
    if (this.redoStack.length === 0) return null;
    if (currentSnapshot) {
      this.undoStack.push(currentSnapshot);
    }
    return this.redoStack.pop();
  }

  canUndo() {
    return this.undoStack.length > 0;
  }

  canRedo() {
    return this.redoStack.length > 0;
  }

  clear() {
    this.undoStack = [];
    this.redoStack = [];
  }
}
