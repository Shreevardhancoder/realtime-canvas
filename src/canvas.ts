export interface DrawingPoint {
  x: number;
  y: number;
}

export interface DrawingPath {
  points: DrawingPoint[];
  color: string;
  width: number;
  tool: 'brush' | 'eraser';
}

export interface DrawingOperation {
  id: string;
  type: 'draw' | 'erase' | 'clear';
  path?: DrawingPath;
  timestamp: number;
  userId: string;
}

export class CanvasDrawing {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private isDrawing: boolean = false;
  private currentPath: DrawingPoint[] = [];
  private operations: DrawingOperation[] = [];
  private currentColor: string = '#000000';
  private currentWidth: number = 2;
  private currentTool: 'brush' | 'eraser' = 'brush';
  private userId: string;

  constructor(canvas: HTMLCanvasElement, userId: string) {
    this.canvas = canvas;
    this.userId = userId;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) {
      throw new Error('Could not get canvas context');
    }
    this.ctx = context;
    this.setupCanvas();
  }

  private setupCanvas(): void {
    const container = this.canvas.parentElement;
    if (!container) return;

    this.canvas.width = container.clientWidth;
    this.canvas.height = container.clientHeight;

    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
  }

  public resize(): void {
    const imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
    this.setupCanvas();
    this.ctx.putImageData(imageData, 0, 0);
  }

  public setColor(color: string): void {
    this.currentColor = color;
  }

  public setWidth(width: number): void {
    this.currentWidth = width;
  }

  public setTool(tool: 'brush' | 'eraser'): void {
    this.currentTool = tool;
  }

  public startDrawing(x: number, y: number): void {
    this.isDrawing = true;
    this.currentPath = [{ x, y }];
  }

  public draw(x: number, y: number): DrawingOperation | null {
    if (!this.isDrawing) return null;

    this.currentPath.push({ x, y });

    const path: DrawingPath = {
      points: [...this.currentPath],
      color: this.currentColor,
      width: this.currentWidth,
      tool: this.currentTool
    };

    this.drawPath(path);

    return {
      id: this.generateId(),
      type: this.currentTool === 'eraser' ? 'erase' : 'draw',
      path,
      timestamp: Date.now(),
      userId: this.userId
    };
  }

  public stopDrawing(): DrawingOperation | null {
    if (!this.isDrawing || this.currentPath.length === 0) {
      this.isDrawing = false;
      return null;
    }

    this.isDrawing = false;

    const operation: DrawingOperation = {
      id: this.generateId(),
      type: this.currentTool === 'eraser' ? 'erase' : 'draw',
      path: {
        points: this.currentPath,
        color: this.currentColor,
        width: this.currentWidth,
        tool: this.currentTool
      },
      timestamp: Date.now(),
      userId: this.userId
    };

    this.operations.push(operation);
    this.currentPath = [];

    return operation;
  }

  public drawPath(path: DrawingPath): void {
    if (path.points.length < 2) return;

    this.ctx.save();

    if (path.tool === 'eraser') {
      this.ctx.globalCompositeOperation = 'destination-out';
      this.ctx.strokeStyle = 'rgba(0,0,0,1)';
    } else {
      this.ctx.globalCompositeOperation = 'source-over';
      this.ctx.strokeStyle = path.color;
    }

    this.ctx.lineWidth = path.width;

    this.ctx.beginPath();
    this.ctx.moveTo(path.points[0].x, path.points[0].y);

    for (let i = 1; i < path.points.length; i++) {
      const point = path.points[i];
      const prevPoint = path.points[i - 1];

      const midX = (prevPoint.x + point.x) / 2;
      const midY = (prevPoint.y + point.y) / 2;

      this.ctx.quadraticCurveTo(prevPoint.x, prevPoint.y, midX, midY);
    }

    const lastPoint = path.points[path.points.length - 1];
    this.ctx.lineTo(lastPoint.x, lastPoint.y);
    this.ctx.stroke();

    this.ctx.restore();
  }

  public drawRemotePath(path: DrawingPath): void {
    this.drawPath(path);
  }

  public clear(): void {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  public redrawOperations(operations: DrawingOperation[]): void {
    this.clear();
    operations.forEach(op => {
      if (op.path) {
        this.drawPath(op.path);
      }
    });
  }

  public getOperations(): DrawingOperation[] {
    return this.operations;
  }

  public setOperations(operations: DrawingOperation[]): void {
    this.operations = operations;
    this.redrawOperations(operations);
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}