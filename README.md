# Real-Time Collaborative Drawing Canvas

A multi-user drawing application where multiple people can draw simultaneously on the same canvas with real-time synchronization. Built with vanilla TypeScript, HTML5 Canvas, and Supabase for real-time communication and data persistence.

## Features

- **Real-time Drawing**: See other users' drawings as they draw, not after they finish
- **Drawing Tools**: Brush and eraser with adjustable colors and stroke width
- **User Indicators**: See where other users are currently drawing with cursor positions
- **Global Undo/Redo**: Undo and redo operations work across all users
- **User Management**: Display online users with colored indicators
- **Canvas Persistence**: Drawing state is saved to database and loaded on join
- **Room System**: Multiple isolated canvases accessible via URL parameters

## Tech Stack

- **Frontend**: Vanilla TypeScript + HTML5 Canvas (no frameworks)
- **Real-time**: Supabase Realtime (WebSocket-based)
- **Database**: Supabase PostgreSQL
- **Build Tool**: Vite

## Setup Instructions

### Prerequisites

- Node.js 18+ and npm
- Supabase project (already configured)

### Installation

1. Clone the repository
2. Install dependencies:

```bash
npm install
```

3. The project is already configured with Supabase credentials in `.env`

4. Start the development server:

```bash
npm run dev
```

5. Open your browser to `http://localhost:5173`

### Production Build

```bash
npm run build
npm run preview
```

## How to Test with Multiple Users

1. Open the application in your browser
2. Copy the URL (includes room parameter)
3. Open the same URL in multiple browser windows or tabs
4. Start drawing in any window - you'll see the drawing appear in real-time in all other windows
5. Test different features:
   - Draw with different colors and stroke widths
   - Use the eraser tool
   - Click undo/redo and watch it work globally
   - Move your cursor and see other users' cursors
   - Clear the canvas

### Testing Different Rooms

- Add `?room=room-name` to the URL to create/join different rooms
- Each room maintains its own canvas state and user list

## Known Limitations

### Current Implementation

1. **Undo/Redo Simplification**: The current implementation uses a global stack approach where undo removes the last operation from any user. A more sophisticated implementation would track operations per user and handle conflicts more gracefully.

2. **No Authentication**: Users are assigned random IDs and names. Real production use would require proper user authentication.

3. **Limited Mobile Support**: Touch events are not yet implemented, though the UI is responsive.

4. **Performance at Scale**: With many users drawing simultaneously, canvas redraws could become expensive. Optimizations like canvas layering and operation batching would improve performance.

5. **Network Latency**: No prediction or interpolation is implemented for drawing paths, so high latency connections may show jittery drawings.

6. **No Stroke History Compression**: Each mouse move point is stored. Path simplification algorithms would reduce data size.

## Time Spent

Approximately 3-4 hours:
- Database schema design: 30 minutes
- Canvas drawing implementation: 1 hour
- Real-time synchronization: 1.5 hours
- User management and UI: 45 minutes
- Testing and debugging: 30 minutes
- Documentation: 15 minutes

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for detailed technical documentation including:
- Data flow diagrams
- Real-time protocol specification
- Undo/redo strategy
- Performance optimizations
- Conflict resolution approach

## Project Structure

```
src/
├── canvas.ts         # Canvas drawing logic and operations
├── realtime.ts       # Supabase Realtime synchronization
├── users.ts          # User management and cursor tracking
├── supabase.ts       # Supabase client configuration
├── main.ts           # Application initialization and coordination
└── index.css         # Styles

supabase/
└── migrations/       # Database schema migrations
```

## License

MIT