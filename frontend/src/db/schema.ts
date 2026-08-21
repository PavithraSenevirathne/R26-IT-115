import { SQLiteDatabase } from 'expo-sqlite';

export const initializeDatabase = async (db: SQLiteDatabase) => {
  await db.execAsync(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS plants (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      age_months INTEGER,
      elevation_zone TEXT,
      soil_ph REAL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS chat_sessions (
      id TEXT PRIMARY KEY NOT NULL,
      plant_id TEXT NOT NULL,
      active_slots TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (plant_id) REFERENCES plants (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY NOT NULL,
      session_id TEXT NOT NULL,
      sender TEXT CHECK(sender IN ('user', 'ai')) NOT NULL,
      content TEXT NOT NULL,
      dosage_data TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (session_id) REFERENCES chat_sessions (id) ON DELETE CASCADE
    );
  `);
  
  console.log("Database initialized!");
};