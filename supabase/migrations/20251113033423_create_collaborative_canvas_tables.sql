/*
  # Collaborative Canvas Database Schema

  1. New Tables
    - `rooms`
      - `id` (uuid, primary key) - Unique room identifier
      - `name` (text) - Room name
      - `created_at` (timestamptz) - Room creation timestamp
      - `updated_at` (timestamptz) - Last activity timestamp
    
    - `drawing_operations`
      - `id` (uuid, primary key) - Operation identifier
      - `room_id` (uuid, foreign key) - References rooms table
      - `user_id` (text) - User identifier (anonymous UUID)
      - `operation_type` (text) - Type: 'draw', 'erase', 'undo', 'redo'
      - `operation_index` (bigint) - Sequential index for ordering operations
      - `data` (jsonb) - Operation data (path points, color, width, etc.)
      - `created_at` (timestamptz) - Operation timestamp
    
    - `active_users`
      - `id` (uuid, primary key) - User session identifier
      - `room_id` (uuid, foreign key) - References rooms table
      - `user_id` (text) - User identifier
      - `username` (text) - Display name
      - `color` (text) - Assigned user color
      - `cursor_x` (float) - Current cursor X position
      - `cursor_y` (float) - Current cursor Y position
      - `last_seen` (timestamptz) - Last activity timestamp

  2. Security
    - Enable RLS on all tables
    - Public access for anonymous drawing (no authentication required)
    
  3. Indexes
    - Index on room_id for fast lookups
    - Index on operation_index for ordered retrieval
    - Index on last_seen for cleanup queries
    
  4. Notes
    - Uses anonymous user IDs for simplicity
    - JSONB for flexible operation data storage
    - Sequential operation index for deterministic undo/redo
*/

CREATE TABLE IF NOT EXISTS rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS drawing_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id text NOT NULL,
  operation_type text NOT NULL,
  operation_index bigint NOT NULL,
  data jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS active_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id text NOT NULL,
  username text NOT NULL,
  color text NOT NULL,
  cursor_x float DEFAULT 0,
  cursor_y float DEFAULT 0,
  last_seen timestamptz DEFAULT now(),
  UNIQUE(room_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_drawing_operations_room ON drawing_operations(room_id);
CREATE INDEX IF NOT EXISTS idx_drawing_operations_index ON drawing_operations(operation_index);
CREATE INDEX IF NOT EXISTS idx_active_users_room ON active_users(room_id);
CREATE INDEX IF NOT EXISTS idx_active_users_last_seen ON active_users(last_seen);

ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE drawing_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE active_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view rooms"
  ON rooms FOR SELECT
  USING (true);

CREATE POLICY "Anyone can create rooms"
  ON rooms FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anyone can update rooms"
  ON rooms FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Anyone can view drawing operations"
  ON drawing_operations FOR SELECT
  USING (true);

CREATE POLICY "Anyone can create drawing operations"
  ON drawing_operations FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anyone can view active users"
  ON active_users FOR SELECT
  USING (true);

CREATE POLICY "Anyone can create active users"
  ON active_users FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anyone can update active users"
  ON active_users FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Anyone can delete active users"
  ON active_users FOR DELETE
  USING (true);