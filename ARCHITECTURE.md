# Architecture Documentation

## System Overview

This collaborative canvas application uses a client-side rendering approach with server-side state persistence. Real-time synchronization is achieved through Supabase Realtime (WebSocket-based pub/sub) with PostgreSQL as the source of truth.

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                         User A                              │
│  ┌──────────────┐    ┌──────────────┐   ┌──────────────┐  │
│  │   Canvas     │───▶│    Main      │──▶│   Realtime   │  │
│  │   Drawing    │    │ Application  │   │    Sync      │  │
│  └──────────────┘    └──────────────┘   └──────┬───────┘  │
└────────────────────────────────────────────────│───────────┘
                                                  │
                    ┌─────────────────────────────┼─────────────────────────┐
                    │         Supabase Backend    │                         │
                    │  ┌──────────────────────────▼──────────────┐          │
                    │  │    Realtime (WebSocket Pub/Sub)         │          │
                    │  │  - Channel: room:${roomId}              │          │
                    │  │  - Broadcast: drawing events            │          │
                    │  │  - Presence: user tracking              │          │
                    │  └──────────────┬──────────────────────────┘          │
                    │                 │                                      │
                    │  ┌──────────────▼──────────────┐                      │
                    │  │   PostgreSQL Database        │                      │
                    │  │  - rooms                     │                      │
                    │  │  - drawing_operations        │                      │
                    │  │  - active_users              │                      │
                    │  └──────────────┬──────────────┘                      │
                    └─────────────────┼───────────────────────────────────┘
                                      │
┌─────────────────────────────────────┼───────────────────────┐
│                         User B      │                       │
│  ┌──────────────┐    ┌──────────────▼──┐   ┌────────────┐ │
│  │   Canvas     │◀───│    Main         │◀──│  Realtime  │ │
│  │   Drawing    │    │  Application    │   │   Sync     │ │
│  └──────────────┘    └─────────────────┘   └────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### Flow Steps

1. **User A draws** → Canvas captures mouse events
2. **Canvas** generates drawing operation → Sends to Main Application
3. **Main Application** → Sends operation to Realtime Sync
4. **Realtime Sync** → Broadcasts via WebSocket AND saves to database
5. **Supabase** → Distributes message to all subscribed clients
6. **User B's Realtime Sync** → Receives drawing operation
7. **User B's Main Application** → Updates local canvas
8. **User B sees drawing** in real-time

## WebSocket Protocol

### Message Types

The application uses Supabase Realtime with the following message structure:

```typescript
interface RealtimeMessage {
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
```

### Protocol Specification

#### 1. Drawing Operation

**Sent when**: User completes a stroke (mouseup)

```json
{
  "type": "draw",
  "userId": "user-123-abc",
  "username": "QuickFox",
  "color": "#ef4444",
  "path": {
    "points": [
      { "x": 100, "y": 150 },
      { "x": 105, "y": 152 },
      { "x": 110, "y": 155 }
    ],
    "color": "#000000",
    "width": 2,
    "tool": "brush"
  },
  "operationIndex": 42
}
```

#### 2. Cursor Position Update

**Sent when**: User moves mouse (throttled to 50ms)

```json
{
  "type": "cursor",
  "userId": "user-123-abc",
  "cursorX": 250,
  "cursorY": 300
}
```

#### 3. Undo Operation

**Sent when**: User clicks undo button

```json
{
  "type": "undo",
  "userId": "user-123-abc",
  "operationId": "op-1234567890",
  "operationIndex": 43
}
```

#### 4. Redo Operation

**Sent when**: User clicks redo button

```json
{
  "type": "redo",
  "userId": "user-123-abc",
  "operationId": "op-1234567890",
  "operationIndex": 44
}
```

#### 5. Clear Canvas

**Sent when**: User clicks clear button

```json
{
  "type": "clear",
  "userId": "user-123-abc",
  "operationIndex": 45
}
```

#### 6. User Presence

**Automatically handled by Supabase Presence**

Join:
```json
{
  "type": "user_joined",
  "userId": "user-456-def",
  "username": "CleverEagle",
  "color": "#3b82f6"
}
```

Leave:
```json
{
  "type": "user_left",
  "userId": "user-456-def"
}
```

## Undo/Redo Strategy

### Global Operation Stack

The application implements a global undo/redo system where operations from all users are stored in a shared history stack.

#### Data Structure

```typescript
operations: DrawingOperation[]     // Current canvas state
undoneOperations: DrawingOperation[]  // Operations that have been undone
```

#### Algorithm

**Undo Process:**
1. Pop last operation from `operations` stack
2. Push operation to `undoneOperations` stack
3. Clear canvas and redraw all remaining operations
4. Broadcast undo event to all users

**Redo Process:**
1. Pop last operation from `undoneOperations` stack
2. Push operation back to `operations` stack
3. Redraw operation on canvas
4. Broadcast redo event to all users

#### Conflict Resolution

**Current Implementation:**
- Simple LIFO (Last In, First Out) approach
- Any user's undo removes the most recent operation regardless of who drew it
- Clear `undoneOperations` stack whenever new drawing occurs

**Trade-offs:**
- ✅ Simple to implement and understand
- ✅ Consistent state across all clients
- ❌ Can be confusing when multiple users undo different operations
- ❌ No per-user undo history

**Better Approach (Not Implemented):**

Use operational transformation with per-user operation tracking:

```typescript
interface Operation {
  id: string;
  userId: string;
  type: string;
  data: any;
  precedingOps: string[];  // Operations this depends on
}
```

This would allow:
- Per-user undo stacks
- Conflict-free concurrent operations
- Selective operation reversal

## Performance Optimizations

### 1. Path Smoothing

**Problem**: Mouse events fire very frequently, creating jagged paths

**Solution**: Use quadratic curves for smooth interpolation

```typescript
for (let i = 1; i < points.length; i++) {
  const midX = (prevPoint.x + point.x) / 2;
  const midY = (prevPoint.y + point.y) / 2;
  ctx.quadraticCurveTo(prevPoint.x, prevPoint.y, midX, midY);
}
```

### 2. Cursor Position Throttling

**Problem**: Sending cursor position on every mousemove event floods the network

**Solution**: Throttle cursor updates to 50ms intervals

```typescript
const now = Date.now();
if (now - lastCursorSendTime > 50) {
  realtime.sendCursor(x, y);
  lastCursorSendTime = now;
}
```

### 3. Canvas Layering

**Problem**: Drawing cursors on main canvas requires frequent redraws

**Solution**: Use separate overlay canvas for cursors

```html
<canvas id="drawingCanvas"></canvas>
<canvas id="cursorCanvas"></canvas>
```

### 4. Operation Batching

**Problem**: Each mouse move during drawing could create a network message

**Solution**: Only send complete operations on mouseup, use local prediction for immediate feedback

```typescript
// Local drawing during mouse move (instant feedback)
draw(x, y) {
  this.drawPath(currentPath);
  return null; // Don't send yet
}

// Send complete operation on mouse up
stopDrawing() {
  const operation = createOperation();
  realtime.sendDrawing(operation);
}
```

### 5. Canvas Context Configuration

**Problem**: Frequent context state changes are expensive

**Solution**: Use `save()` and `restore()` for isolated drawing

```typescript
ctx.save();
ctx.globalCompositeOperation = 'destination-out'; // For eraser
// ... drawing code ...
ctx.restore();
```

## Conflict Resolution

### Drawing Conflicts

**Scenario**: Two users draw overlapping strokes simultaneously

**Resolution Strategy**: Last-write-wins with operation ordering

1. Each operation has an `operationIndex` (monotonically increasing)
2. Operations are stored in database with index
3. On load, operations are replayed in order
4. Real-time broadcasts don't include index (optimistic update)

**Trade-off**: Potential inconsistency between live view and reloaded state (rare edge case)

### Undo/Redo Conflicts

**Scenario**: User A undoes while User B is drawing

**Current Resolution**:
- User B's drawing is added to operations stack
- User A's undo removes the previous last operation
- Result is consistent but may seem unexpected to users

**Better Approach**:
- Lock undo/redo during active drawing
- Queue undo operations until all strokes complete
- Provide visual feedback when undo is pending

### Cursor Position Conflicts

**Scenario**: Multiple users move cursors simultaneously

**Resolution**: Simple overwrite with no ordering

- Cursor positions are transient state
- Updates don't require ordering or persistence
- Supabase Presence handles last-update-wins automatically

## Database Schema Design

### Rooms Table

```sql
rooms (
  id UUID PRIMARY KEY,
  name TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
```

**Purpose**: Track available drawing rooms

**Access Pattern**: Rarely updated, mostly read on join

### Drawing Operations Table

```sql
drawing_operations (
  id UUID PRIMARY KEY,
  room_id UUID REFERENCES rooms(id),
  user_id TEXT,
  operation_type TEXT,
  operation_index BIGINT,
  data JSONB,
  created_at TIMESTAMPTZ
)
```

**Purpose**: Persistent operation history for canvas reconstruction

**Access Pattern**:
- Insert on each drawing operation
- Bulk read on room join
- Index on `room_id` and `operation_index` for fast ordered retrieval

**Data Storage**: JSONB allows flexible operation data without schema changes

### Active Users Table

```sql
active_users (
  id UUID PRIMARY KEY,
  room_id UUID REFERENCES rooms(id),
  user_id TEXT,
  username TEXT,
  color TEXT,
  cursor_x FLOAT,
  cursor_y FLOAT,
  last_seen TIMESTAMPTZ,
  UNIQUE(room_id, user_id)
)
```

**Purpose**: Track online users and their state

**Access Pattern**:
- Upsert on join
- Update every 5 seconds (heartbeat)
- Delete on disconnect
- Read periodically for user list

**Cleanup**: Periodic job could remove stale users (last_seen > 30 seconds)

## Canvas Drawing Implementation

### Double Canvas Approach

```
┌─────────────────────────────┐
│     Cursor Canvas           │  ← Transparent overlay
│     (pointer-events: none)  │  ← User cursors drawn here
└─────────────────────────────┘
┌─────────────────────────────┐
│     Drawing Canvas          │  ← Main canvas
│     (receives mouse events) │  ← All drawings here
└─────────────────────────────┘
```

**Benefits**:
- Cursor canvas can be cleared/redrawn without affecting drawings
- Separation of concerns
- Better performance (no full canvas redraw for cursors)

### Drawing Path Generation

**Naive Approach**: Draw line from point to point
```typescript
// Creates jagged lines
points.forEach(point => ctx.lineTo(point.x, point.y));
```

**Implemented Approach**: Quadratic curves with midpoints
```typescript
// Creates smooth curves
for (let i = 1; i < points.length; i++) {
  const midX = (prevPoint.x + point.x) / 2;
  const midY = (prevPoint.y + point.y) / 2;
  ctx.quadraticCurveTo(prevPoint.x, prevPoint.y, midX, midY);
}
```

### Eraser Implementation

**Technique**: Use `destination-out` composite operation

```typescript
if (tool === 'eraser') {
  ctx.globalCompositeOperation = 'destination-out';
  ctx.strokeStyle = 'rgba(0,0,0,1)'; // Alpha doesn't matter
}
```

This removes pixels instead of drawing over them, creating true erasing effect.

## Scalability Considerations

### Current Limitations

1. **All operations in memory**: `operations` array grows unbounded
2. **Full canvas redraw on undo**: O(n) where n = number of operations
3. **No operation cleanup**: Old operations never pruned
4. **Single server instance**: Supabase handles distribution

### Scaling Strategies

**For 100 users:**
- Current architecture should handle fine
- Monitor database write throughput

**For 1000 users:**
- Implement operation pagination (load last N operations)
- Add canvas snapshotting (save canvas state periodically)
- Use Redis for cursor positions (ephemeral data)
- Implement operation compaction (merge sequential small operations)

**For 10,000+ users:**
- Shard rooms across multiple Realtime channels
- Implement WebRTC for peer-to-peer communication
- Use canvas diff algorithms instead of full operation replay
- Add CDN for initial canvas state images
- Consider operational transformation library (ShareDB, Yjs)

## Security Considerations

### Current Implementation

- **No authentication**: Anonymous users with random IDs
- **Open RLS policies**: Anyone can read/write all data
- **No rate limiting**: Users could spam operations

### Production Requirements

1. **Authentication**: Require user login
2. **RLS Policies**: Lock down based on user sessions
3. **Rate Limiting**: Limit operations per second per user
4. **Input Validation**: Sanitize operation data
5. **Room Access Control**: Private/public rooms with permissions

## Testing Strategy

### Manual Testing

1. **Single User**: Verify all drawing tools work
2. **Two Users**: Test real-time synchronization
3. **Undo/Redo**: Test with multiple users drawing and undoing
4. **Network Issues**: Test with throttled connection
5. **Reconnection**: Test disconnect/reconnect scenarios

### Automated Testing (Not Implemented)

- Unit tests for canvas operations
- Integration tests for realtime sync
- E2E tests with multiple browser instances
- Load testing with simulated users

## Future Enhancements

1. **Touch Support**: Add touch event handlers for mobile
2. **More Tools**: Rectangle, circle, line, text
3. **Layers**: Support multiple drawing layers
4. **Export**: Save canvas as PNG/SVG
5. **History Timeline**: Visual timeline of all operations
6. **Playback**: Replay drawing session from start
7. **Permissions**: Room owner controls, kick users
8. **Chat**: Add text chat alongside drawing
9. **Voice**: Add voice channels for collaboration