export interface User {
  id: string;
  username: string;
  color: string;
  cursorX: number;
  cursorY: number;
}

export class UserManager {
  private users: Map<string, User> = new Map();
  private cursorCanvas: HTMLCanvasElement;
  private cursorCtx: CanvasRenderingContext2D;
  private onUsersChangeCallback: ((users: User[]) => void) | null = null;

  constructor(cursorCanvas: HTMLCanvasElement) {
    this.cursorCanvas = cursorCanvas;
    const ctx = cursorCanvas.getContext('2d');
    if (!ctx) {
      throw new Error('Could not get cursor canvas context');
    }
    this.cursorCtx = ctx;
  }

  public addUser(user: User): void {
    this.users.set(user.id, user);
    this.notifyChange();
  }

  public removeUser(userId: string): void {
    this.users.delete(userId);
    this.clearCursors();
    this.drawAllCursors();
    this.notifyChange();
  }

  public updateCursor(userId: string, x: number, y: number): void {
    const user = this.users.get(userId);
    if (user) {
      user.cursorX = x;
      user.cursorY = y;
      this.clearCursors();
      this.drawAllCursors();
    }
  }

  public getUsers(): User[] {
    return Array.from(this.users.values());
  }

  public onUsersChange(callback: (users: User[]) => void): void {
    this.onUsersChangeCallback = callback;
  }

  private notifyChange(): void {
    if (this.onUsersChangeCallback) {
      this.onUsersChangeCallback(this.getUsers());
    }
  }

  private clearCursors(): void {
    this.cursorCtx.clearRect(0, 0, this.cursorCanvas.width, this.cursorCanvas.height);
  }

  private drawAllCursors(): void {
    this.users.forEach(user => {
      this.drawCursor(user);
    });
  }

  private drawCursor(user: User): void {
    const size = 12;
    const x = user.cursorX;
    const y = user.cursorY;

    this.cursorCtx.save();

    this.cursorCtx.fillStyle = user.color;
    this.cursorCtx.strokeStyle = '#ffffff';
    this.cursorCtx.lineWidth = 2;

    this.cursorCtx.beginPath();
    this.cursorCtx.arc(x, y, size / 2, 0, Math.PI * 2);
    this.cursorCtx.fill();
    this.cursorCtx.stroke();

    this.cursorCtx.fillStyle = '#ffffff';
    this.cursorCtx.font = '12px sans-serif';
    this.cursorCtx.fillText(user.username, x + size, y - size);

    this.cursorCtx.fillStyle = user.color;
    this.cursorCtx.fillText(user.username, x + size + 1, y - size + 1);

    this.cursorCtx.restore();
  }

  public resize(width: number, height: number): void {
    this.cursorCanvas.width = width;
    this.cursorCanvas.height = height;
    this.clearCursors();
    this.drawAllCursors();
  }
}

export function generateUserId(): string {
  return `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export function generateUsername(): string {
  const adjectives = ['Quick', 'Clever', 'Bright', 'Swift', 'Bold', 'Keen', 'Wise', 'Sharp'];
  const nouns = ['Fox', 'Eagle', 'Tiger', 'Wolf', 'Bear', 'Lion', 'Hawk', 'Owl'];
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  return `${adj}${noun}`;
}

export function generateUserColor(): string {
  const colors = [
    '#ef4444', '#f97316', '#f59e0b', '#84cc16',
    '#10b981', '#14b8a6', '#06b6d4', '#3b82f6',
    '#6366f1', '#8b5cf6', '#d946ef', '#ec4899'
  ];
  return colors[Math.floor(Math.random() * colors.length)];
}