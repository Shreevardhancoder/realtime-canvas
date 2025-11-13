import './index.css';
import { CanvasDrawing, DrawingOperation } from './canvas';
import { RealtimeSync, RealtimeMessage } from './realtime';
import { UserManager, generateUserId, generateUsername, generateUserColor, User } from './users';

class CollaborativeCanvas {
  private canvas: CanvasDrawing;
  private realtime: RealtimeSync;
  private userManager: UserManager;
  private userId: string;
  private username: string;
  private userColor: string;
  private roomId: string;
  private operations: DrawingOperation[] = [];
  private undoneOperations: DrawingOperation[] = [];
  private lastCursorSendTime: number = 0;
  private cursorThrottle: number = 50;

  constructor() {
    this.userId = generateUserId();
    this.username = generateUsername();
    this.userColor = generateUserColor();
    this.roomId = this.getRoomIdFromUrl();

    const drawingCanvas = document.getElementById('drawingCanvas') as HTMLCanvasElement;
    const cursorCanvas = document.getElementById('cursorCanvas') as HTMLCanvasElement;

    this.canvas = new CanvasDrawing(drawingCanvas, this.userId);
    this.userManager = new UserManager(cursorCanvas);
    this.realtime = new RealtimeSync(this.roomId, this.userId, this.username, this.userColor);

    this.initializeUI();
    this.setupEventListeners();
    this.connectToRoom();
  }

  private getRoomIdFromUrl(): string {
    const params = new URLSearchParams(window.location.search);
    let roomId = params.get('room');

    if (!roomId) {
      roomId = 'default-room';
      const url = new URL(window.location.href);
      url.searchParams.set('room', roomId);
      window.history.replaceState({}, '', url.toString());
    }

    return roomId;
  }

  private initializeUI(): void {
    const container = document.getElementById('canvasContainer');
    if (!container) return;

    const drawingCanvas = document.getElementById('drawingCanvas') as HTMLCanvasElement;
    const cursorCanvas = document.getElementById('cursorCanvas') as HTMLCanvasElement;

    drawingCanvas.width = container.clientWidth;
    drawingCanvas.height = container.clientHeight;
    cursorCanvas.width = container.clientWidth;
    cursorCanvas.height = container.clientHeight;

    const roomInfo = document.getElementById('roomInfo');
    if (roomInfo) {
      roomInfo.textContent = `Room: ${this.roomId} | User: ${this.username}`;
    }

    window.addEventListener('resize', () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      this.canvas.resize();
      this.userManager.resize(w, h);
    });
  }

  private setupEventListeners(): void {
    const drawingCanvas = document.getElementById('drawingCanvas') as HTMLCanvasElement;

    let isMouseDown = false;

    drawingCanvas.addEventListener('mousedown', (e) => {
      isMouseDown = true;
      const rect = drawingCanvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      this.canvas.startDrawing(x, y);
    });

    drawingCanvas.addEventListener('mousemove', (e) => {
      const rect = drawingCanvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      if (isMouseDown) {
        const operation = this.canvas.draw(x, y);
        if (operation && operation.path) {
          this.realtime.sendDrawing(operation.path);
        }
      }

      const now = Date.now();
      if (now - this.lastCursorSendTime > this.cursorThrottle) {
        this.realtime.sendCursor(x, y);
        this.lastCursorSendTime = now;
      }
    });

    drawingCanvas.addEventListener('mouseup', () => {
      if (isMouseDown) {
        const operation = this.canvas.stopDrawing();
        if (operation && operation.path) {
          this.operations.push(operation);
          this.undoneOperations = [];
          this.realtime.sendDrawing(operation.path);
        }
      }
      isMouseDown = false;
    });

    drawingCanvas.addEventListener('mouseleave', () => {
      if (isMouseDown) {
        const operation = this.canvas.stopDrawing();
        if (operation && operation.path) {
          this.operations.push(operation);
          this.undoneOperations = [];
          this.realtime.sendDrawing(operation.path);
        }
      }
      isMouseDown = false;
    });

    const brushTool = document.getElementById('brushTool');
    const eraserTool = document.getElementById('eraserTool');

    brushTool?.addEventListener('click', () => {
      this.canvas.setTool('brush');
      brushTool.classList.add('active');
      eraserTool?.classList.remove('active');
    });

    eraserTool?.addEventListener('click', () => {
      this.canvas.setTool('eraser');
      eraserTool.classList.add('active');
      brushTool?.classList.remove('active');
    });

    const colorPicker = document.getElementById('colorPicker') as HTMLInputElement;
    colorPicker?.addEventListener('input', (e) => {
      const target = e.target as HTMLInputElement;
      this.canvas.setColor(target.value);
    });

    const strokeWidth = document.getElementById('strokeWidth') as HTMLInputElement;
    const strokeWidthValue = document.getElementById('strokeWidthValue');
    strokeWidth?.addEventListener('input', (e) => {
      const target = e.target as HTMLInputElement;
      const width = parseInt(target.value);
      this.canvas.setWidth(width);
      if (strokeWidthValue) {
        strokeWidthValue.textContent = width.toString();
      }
    });

    const undoBtn = document.getElementById('undoBtn');
    undoBtn?.addEventListener('click', () => this.undo());

    const redoBtn = document.getElementById('redoBtn');
    redoBtn?.addEventListener('click', () => this.redo());

    const clearBtn = document.getElementById('clearBtn');
    clearBtn?.addEventListener('click', () => this.clear());

    this.userManager.onUsersChange((users) => {
      this.updateUsersList(users);
    });
  }

  private async connectToRoom(): Promise<void> {
    const statusEl = document.getElementById('connectionStatus');

    try {
      await this.realtime.getOrCreateRoom();

      const savedOperations = await this.realtime.loadOperations();
      this.operations = savedOperations;
      this.canvas.setOperations(savedOperations);

      await this.realtime.connect((message) => this.handleRealtimeMessage(message));

      if (statusEl) {
        statusEl.textContent = 'Connected';
        statusEl.classList.add('connected');
        statusEl.classList.remove('disconnected');
      }
    } catch (error) {
      console.error('Connection error:', error);
      if (statusEl) {
        statusEl.textContent = 'Connection Error';
        statusEl.classList.add('disconnected');
        statusEl.classList.remove('connected');
      }
    }
  }

  private handleRealtimeMessage(message: RealtimeMessage): void {
    switch (message.type) {
      case 'draw':
        if (message.path) {
          this.canvas.drawRemotePath(message.path);

          const operation: DrawingOperation = {
            id: `${message.userId}-${Date.now()}`,
            type: message.path.tool === 'eraser' ? 'erase' : 'draw',
            path: message.path,
            timestamp: Date.now(),
            userId: message.userId
          };
          this.operations.push(operation);
        }
        break;

      case 'cursor':
        if (message.cursorX !== undefined && message.cursorY !== undefined) {
          this.userManager.updateCursor(message.userId, message.cursorX, message.cursorY);
        }
        break;

      case 'undo':
        this.handleRemoteUndo();
        break;

      case 'redo':
        this.handleRemoteRedo();
        break;

      case 'clear':
        this.canvas.clear();
        this.operations = [];
        this.undoneOperations = [];
        break;

      case 'user_joined':
        if (message.username && message.color) {
          this.userManager.addUser({
            id: message.userId,
            username: message.username,
            color: message.color,
            cursorX: 0,
            cursorY: 0
          });
        }
        break;

      case 'user_left':
        this.userManager.removeUser(message.userId);
        break;
    }
  }

  private undo(): void {
    if (this.operations.length === 0) return;

    const operation = this.operations.pop();
    if (operation) {
      this.undoneOperations.push(operation);
      this.canvas.redrawOperations(this.operations);
      this.realtime.sendUndo(operation.id);
    }
  }

  private redo(): void {
    if (this.undoneOperations.length === 0) return;

    const operation = this.undoneOperations.pop();
    if (operation) {
      this.operations.push(operation);
      this.canvas.redrawOperations(this.operations);
      this.realtime.sendRedo(operation.id);
    }
  }

  private handleRemoteUndo(): void {
    if (this.operations.length === 0) return;

    const operation = this.operations.pop();
    if (operation) {
      this.undoneOperations.push(operation);
      this.canvas.redrawOperations(this.operations);
    }
  }

  private handleRemoteRedo(): void {
    if (this.undoneOperations.length === 0) return;

    const operation = this.undoneOperations.pop();
    if (operation) {
      this.operations.push(operation);
      this.canvas.redrawOperations(this.operations);
    }
  }

  private clear(): void {
    this.canvas.clear();
    this.operations = [];
    this.undoneOperations = [];
    this.realtime.sendClear();
  }

  private updateUsersList(users: User[]): void {
    const usersList = document.getElementById('usersList');
    if (!usersList) return;

    usersList.innerHTML = '';

    users.forEach(user => {
      const userDiv = document.createElement('div');
      userDiv.className = 'user-indicator';

      const colorDot = document.createElement('div');
      colorDot.className = 'user-color-dot';
      colorDot.style.backgroundColor = user.color;

      const username = document.createElement('span');
      username.textContent = user.username;

      userDiv.appendChild(colorDot);
      userDiv.appendChild(username);
      usersList.appendChild(userDiv);
    });
  }
}

new CollaborativeCanvas();