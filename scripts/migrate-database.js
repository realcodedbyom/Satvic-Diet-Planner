const { pgPool } = require("../api/config/database")

const migrations = [
  {
    version: "001",
    name: "Add user preferences column",
    sql: `
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS preferences JSONB DEFAULT '{}';
    `,
  },
  {
    version: "002",
    name: "Add recipe ratings table",
    sql: `
      CREATE TABLE IF NOT EXISTS recipe_ratings (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        recipe_id INTEGER REFERENCES recipes(id) ON DELETE CASCADE,
        rating INTEGER CHECK (rating >= 1 AND rating <= 5),
        review TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, recipe_id)
      );
    `,
  },
  {
    version: "003",
    name: "Add meal plan tracking",
    sql: `
      CREATE TABLE IF NOT EXISTS meal_completions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        meal_plan_id INTEGER REFERENCES meal_plans(id) ON DELETE CASCADE,
        meal_type VARCHAR(20) NOT NULL,
        completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        notes TEXT
      );
    `,
  },
  {
    version: "004",
    name: "Add user activity logs",
    sql: `
      CREATE TABLE IF NOT EXISTS user_activities (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        activity_type VARCHAR(50) NOT NULL,
        activity_data JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE INDEX IF NOT EXISTS idx_user_activities_user_id 
      ON user_activities(user_id);
      
      CREATE INDEX IF NOT EXISTS idx_user_activities_type 
      ON user_activities(activity_type);
    `,
  },
  {
    version: "005",
    name: "Create notifications table",
    sql: `
      CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        type VARCHAR(50) NOT NULL,
        scheduled_for TIMESTAMP NOT NULL,
        read BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
      CREATE INDEX IF NOT EXISTS idx_notifications_scheduled_for ON notifications(scheduled_for);
    `,
  },
  {
    version: "006",
    name: "Add onboarding_completed and profile to users",
    sql: `
      ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT FALSE;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS profile JSONB DEFAULT '{}';
    `,
  },
  {
    version: "007",
    name: "Create ai_conversations table",
    sql: `
      CREATE TABLE IF NOT EXISTS ai_conversations (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        conversation_type VARCHAR(50) NOT NULL,
        messages JSONB NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_ai_conversations_user_id ON ai_conversations(user_id);
    `,
  },
  {
    version: "008",
    name: "Ensure unique progress per user/date",
    sql: `
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'ux_progress_logs_user_date'
        ) THEN
          CREATE UNIQUE INDEX ux_progress_logs_user_date ON progress_logs(user_id, date);
        END IF;
      END $$;
    `,
  },
]

async function runMigrations() {
  console.log("🔄 Starting database migrations...")

  try {
    const client = await pgPool.connect()

    // Create migrations table if it doesn't exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        version VARCHAR(10) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `)

    // Get executed migrations
    const executedResult = await client.query("SELECT version FROM migrations")
    const executedVersions = executedResult.rows.map((row) => row.version)

    // Run pending migrations
    for (const migration of migrations) {
      if (!executedVersions.includes(migration.version)) {
        console.log(`⚡ Running migration ${migration.version}: ${migration.name}`)

        await client.query("BEGIN")
        try {
          await client.query(migration.sql)
          await client.query("INSERT INTO migrations (version, name) VALUES ($1, $2)", [
            migration.version,
            migration.name,
          ])
          await client.query("COMMIT")

          console.log(`✅ Migration ${migration.version} completed`)
        } catch (error) {
          await client.query("ROLLBACK")
          throw error
        }
      } else {
        console.log(`⏭️  Migration ${migration.version} already executed`)
      }
    }

    client.release()
    console.log("🎉 All migrations completed successfully!")
  } catch (error) {
    console.error("❌ Migration failed:", error)
    process.exit(1)
  }
}

// Run migrations if called directly
if (require.main === module) {
  runMigrations().then(() => {
    process.exit(0)
  })
}

module.exports = runMigrations
