/*
# Anime Streaming App — Core Schema (single-tenant, public-read)

1. Purpose
   A browse-and-watch anime streaming app. No sign-in required for this phase,
   so the frontend reads everything as the anon role. All tables are
   intentionally public/shared (read-only for anon; writes are not exposed yet).

2. New Tables
   - `genres`        : anime genres (Action, Fantasy, Romance, etc.)
     - id (uuid PK), name (text unique), slug (text unique), created_at
   - `shows`         : anime series/movies
     - id (uuid PK), title (text), synopsis (text), poster_url (text),
       banner_url (text), release_year (int), rating (numeric), status (text),
       studio (text), type (text: 'series'|'movie'), featured (bool),
       created_at
   - `show_genres`    : many-to-many between shows and genres
     - show_id (uuid FK), genre_id (uuid FK), PRIMARY KEY (show_id, genre_id)
   - `episodes`       : episodes belonging to a show
     - id (uuid PK), show_id (uuid FK), episode_number (int), title (text),
       description (text), thumbnail_url (text), video_url (text),
       duration (int minutes), season (int default 1), created_at

3. Indexes
   - shows.featured            (for the hero carousel query)
   - episodes.show_id          (for listing episodes on a show detail page)

4. Security
   - RLS enabled on every table.
   - SELECT open to anon + authenticated (public/shared browse data).
   - No INSERT/UPDATE/DELETE policies yet — writes are managed server-side
     during seeding. The app is read-only from the frontend for now.

5. Notes
   - This is the single-tenant (no-auth) variant. When the user adds accounts,
     we will add user-scoped favorites/watch_history tables with owner RLS.
*/

CREATE TABLE IF NOT EXISTS genres (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  slug text NOT NULL UNIQUE,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS shows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  synopsis text,
  poster_url text,
  banner_url text,
  release_year int,
  rating numeric(3,1) DEFAULT 0,
  status text DEFAULT 'ongoing',
  studio text,
  type text DEFAULT 'series',
  featured boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS show_genres (
  show_id uuid NOT NULL REFERENCES shows(id) ON DELETE CASCADE,
  genre_id uuid NOT NULL REFERENCES genres(id) ON DELETE CASCADE,
  PRIMARY KEY (show_id, genre_id)
);

CREATE TABLE IF NOT EXISTS episodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  show_id uuid NOT NULL REFERENCES shows(id) ON DELETE CASCADE,
  episode_number int NOT NULL,
  season int NOT NULL DEFAULT 1,
  title text NOT NULL,
  description text,
  thumbnail_url text,
  video_url text,
  duration int,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shows_featured ON shows(featured) WHERE featured = true;
CREATE INDEX IF NOT EXISTS idx_episodes_show_id ON episodes(show_id);

ALTER TABLE genres ENABLE ROW LEVEL SECURITY;
ALTER TABLE shows ENABLE ROW LEVEL SECURITY;
ALTER TABLE show_genres ENABLE ROW LEVEL SECURITY;
ALTER TABLE episodes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_genres" ON genres;
CREATE POLICY "public_read_genres" ON genres FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "public_read_shows" ON shows;
CREATE POLICY "public_read_shows" ON shows FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "public_read_show_genres" ON show_genres;
CREATE POLICY "public_read_show_genres" ON show_genres FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "public_read_episodes" ON episodes;
CREATE POLICY "public_read_episodes" ON episodes FOR SELECT
  TO anon, authenticated USING (true);
