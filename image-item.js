/**
 * ImageItem - 单张图片的数据模型
 */
let nextId = 1;

export class ImageItem {
  /**
   * @param {HTMLImageElement} image - 已加载的 Image 对象
   * @param {string} fileName - 原始文件名
   */
  constructor(image, fileName) {
    this.id = nextId++;
    this.fileName = fileName;
    this.image = image;
    this.originalWidth = image.naturalWidth;
    this.originalHeight = image.naturalHeight;
    this.renderWidth = 0;
    this.renderHeight = 0;
    this.rowIndex = 0;
    this.x = 0;   // 渲染后的实际画布坐标
    this.y = 0;
    this.selected = false;
    this.editState = null; // null=未编辑, { cropWidth, cropHeight, zoom, panX, panY, rotation }
  }

  /** 初始化编辑状态（进入编辑模式时调用） */
  initEditState() {
    this.editState = {
      cropWidth: this.renderWidth,
      cropHeight: this.renderHeight,
      zoom: 1.0,
      panX: 0,
      panY: 0,
      rotation: 0,
    };
  }

  /** 重置编辑状态 */
  resetEditState() {
    this.editState = null;
  }

  /** 序列化（用于 undo/redo 快照，不含 image 对象） */
  serialize() {
    return {
      id: this.id,
      fileName: this.fileName,
      originalWidth: this.originalWidth,
      originalHeight: this.originalHeight,
      rowIndex: this.rowIndex,
      dataUrl: this.image.src,
    };
  }
}

/** 重置 ID 计数器（测试用） */
export function resetIdCounter() {
  nextId = 1;
}
