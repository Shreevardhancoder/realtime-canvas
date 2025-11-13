import { supabase } from './supabase';
import { DrawingOperation, DrawingPath } from './canvas';

export interface User {
  id: string;
  username: string;
  color: string;
  cursorX: number;
  cursorY: number;
}

export interface RealtimeMessage {
  type: 'draw' | 'cursor' | 'undo' | 'redo' | 'clear' | 'user_joined' | 'user_left';
  userId: string;
  username?: string;
  color?: string;
  path?: DrawingPath;
  operationId?: string;
  cursorX?: number;
  cursorY?: number;
  operationIndex?: number;
}

export class RealtimeSync {
  private roomId: string;
  private userId: string;
  private username: string;
  private userColor: string;
  private channel: ReturnType<typeof supabase.channel> | null = null;
  private onMessageCallback: ((message: RealtimeMessage) => void) | null = null;
  private heartbeatInterval: number | null = null;
  private operationIndex: number = 0;

  constructor(roomId: string, userId: string, username: string, userColor: string) {
    this.roomId = roomId;
    this.userId = userId;
    this.username = username;
    this.userColor = userColor;
  }

  public async connect(onMessage: (message: RealtimeMessage) => void): Promise<void> {
    this.onMessageCallback = onMessage;

    this.channel = supabase.channel(`room:${this.roomId}`, {
      config: {
        broadcast: { self: false },
        presence: { key: this.userId }
      }
    });

    this.channel
      .on('broadcast', { event: 'drawing' }, ({ payload }) => {
        if (this.onMessageCallback && payload.userId !== this.userId) {
          this.onMessageCallback(payload as RealtimeMessage);
        }
      })
      .on('presence', { event: 'sync' }, () => {
        const state = this.channel?.presenceState();
        if (state) {
          this.handlePresenceSync(state);
        }
      })
      .on('presence', { event: 'join' }, ({ key, newPresences }) => {
        if (key !== this.userId && newPresences.length > 0) {
          const user = newPresences[0];
          if (this.onMessageCallback) {
            this.onMessageCallback({
              type: 'user_joined',
              userId: key,
              username: user.username,
              color: user.color
            });
          }
        }
      })
      .on('presence', { event: 'leave' }, ({ key }) => {
        if (key !== this.userId && this.onMessageCallback) {
          this.onMessageCallback({
            type: 'user_left',
            userId: key
          });
        }
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await this.channel?.track({
            userId: this.userId,
            username: this.username,
            color: this.userColor,
            online_at: new Date().toISOString()
          });

          await this.registerUser();
          this.startHeartbeat();
        }
      });
  }

  private handlePresenceSync(state: Record<string, any[]>): void {
    const users: User[] = [];
    Object.entries(state).forEach(([userId, presences]) => {
      if (presences.length > 0 && userId !== this.userId) {
        const presence = presences[0];
        users.push({
          id: userId,
          username: presence.username,
          color: presence.color,
          cursorX: presence.cursorX || 0,
          cursorY: presence.cursorY || 0
        });
      }
    });

    if (this.onMessageCallback) {
      users.forEach(user => {
        this.onMessageCallback!({
          type: 'user_joined',
          userId: user.id,
          username: user.username,
          color: user.color
        });
      });
    }
  }

  private async registerUser(): Promise<void> {
    await supabase
      .from('active_users')
      .upsert({
        room_id: this.roomId,
        user_id: this.userId,
        username: this.username,
        color: this.userColor,
        cursor_x: 0,
        cursor_y: 0,
        last_seen: new Date().toISOString()
      });
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = window.setInterval(async () => {
      await supabase
        .from('active_users')
        .update({ last_seen: new Date().toISOString() })
        .eq('room_id', this.roomId)
        .eq('user_id', this.userId);
    }, 5000);
  }

  public async sendDrawing(path: DrawingPath): Promise<void> {
    const message: RealtimeMessage = {
      type: 'draw',
      userId: this.userId,
      username: this.username,
      color: this.userColor,
      path,
      operationIndex: this.operationIndex++
    };

    await this.channel?.send({
      type: 'broadcast',
      event: 'drawing',
      payload: message
    });

    await this.saveOperation('draw', path);
  }

  public async sendCursor(x: number, y: number): Promise<void> {
    await this.channel?.track({
      userId: this.userId,
      username: this.username,
      color: this.userColor,
      cursorX: x,
      cursorY: y,
      online_at: new Date().toISOString()
    });
  }

  public async sendUndo(operationId: string): Promise<void> {
    const message: RealtimeMessage = {
      type: 'undo',
      userId: this.userId,
      operationId,
      operationIndex: this.operationIndex++
    };

    await this.channel?.send({
      type: 'broadcast',
      event: 'drawing',
      payload: message
    });

    await this.saveOperation('undo', undefined, operationId);
  }

  public async sendRedo(operationId: string): Promise<void> {
    const message: RealtimeMessage = {
      type: 'redo',
      userId: this.userId,
      operationId,
      operationIndex: this.operationIndex++
    };

    await this.channel?.send({
      type: 'broadcast',
      event: 'drawing',
      payload: message
    });

    await this.saveOperation('redo', undefined, operationId);
  }

  public async sendClear(): Promise<void> {
    const message: RealtimeMessage = {
      type: 'clear',
      userId: this.userId,
      operationIndex: this.operationIndex++
    };

    await this.channel?.send({
      type: 'broadcast',
      event: 'drawing',
      payload: message
    });

    await this.saveOperation('clear');
  }

  private async saveOperation(
    type: string,
    path?: DrawingPath,
    operationId?: string
  ): Promise<void> {
    await supabase.from('drawing_operations').insert({
      room_id: this.roomId,
      user_id: this.userId,
      operation_type: type,
      operation_index: this.operationIndex,
      data: {
        path,
        operationId
      }
    });
  }

  public async loadOperations(): Promise<DrawingOperation[]> {
    const { data, error } = await supabase
      .from('drawing_operations')
      .select('*')
      .eq('room_id', this.roomId)
      .order('operation_index', { ascending: true });

    if (error) {
      console.error('Error loading operations:', error);
      return [];
    }

    return (data || []).map(op => ({
      id: op.id,
      type: op.operation_type as 'draw' | 'erase' | 'clear',
      path: op.data.path,
      timestamp: new Date(op.created_at).getTime(),
      userId: op.user_id
    }));
  }

  public async getOrCreateRoom(): Promise<void> {
    const { data: existing } = await supabase
      .from('rooms')
      .select('id')
      .eq('id', this.roomId)
      .maybeSingle();

    if (!existing) {
      await supabase.from('rooms').insert({
        id: this.roomId,
        name: `Room ${this.roomId}`,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
    }
  }

  public disconnect(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    if (this.channel) {
      this.channel.unsubscribe();
    }

    supabase
      .from('active_users')
      .delete()
      .eq('room_id', this.roomId)
      .eq('user_id', this.userId)
      .then();
  }
}