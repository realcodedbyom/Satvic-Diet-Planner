const mongoose = require("mongoose")

// MongoDB connection
const connectMongoDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    })
    console.log("📊 MongoDB connected successfully")
  } catch (error) {
    console.error("❌ MongoDB connection error:", error)
    process.exit(1)
  }
}

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password_hash: { type: String, required: true },
  name: { type: String, required: true },
  dosha_primary: String,
  dosha_secondary: String,
  constitution: mongoose.Schema.Types.Mixed,
  preferences: mongoose.Schema.Types.Mixed,
  onboarding_completed: { type: Boolean, default: false },
  profile: mongoose.Schema.Types.Mixed,
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now },
})

const mealPlanSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  date: { type: Date, required: true },
  breakfast: mongoose.Schema.Types.Mixed,
  lunch: mongoose.Schema.Types.Mixed,
  dinner: mongoose.Schema.Types.Mixed,
  snacks: mongoose.Schema.Types.Mixed,
  focus_area: String,
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now },
})

const recipeSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: String,
  ingredients: { type: mongoose.Schema.Types.Mixed, required: true },
  instructions: { type: mongoose.Schema.Types.Mixed, required: true },
  dosha_benefits: mongoose.Schema.Types.Mixed,
  meal_type: String,
  cooking_time: Number,
  difficulty_level: String,
  nutritional_info: mongoose.Schema.Types.Mixed,
  seasonal_tags: mongoose.Schema.Types.Mixed,
  image_url: String,
  created_at: { type: Date, default: Date.now },
})

const progressLogSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  date: { type: Date, required: true },
  energy_morning: { type: Number, min: 1, max: 10 },
  energy_afternoon: { type: Number, min: 1, max: 10 },
  energy_evening: { type: Number, min: 1, max: 10 },
  digestion_score: { type: Number, min: 1, max: 10 },
  sleep_quality: { type: Number, min: 1, max: 10 },
  mood_score: { type: Number, min: 1, max: 10 },
  weight: Number,
  notes: String,
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now },
})

const aiConversationSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  conversation_type: String,
  messages: { type: mongoose.Schema.Types.Mixed, required: true },
  created_at: { type: Date, default: Date.now },
})

const notificationSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  title: { type: String, required: true },
  message: { type: String, required: true },
  type: { type: String, default: "reminder" },
  scheduled_for: { type: Date, required: true },
  read: { type: Boolean, default: false },
  created_at: { type: Date, default: Date.now },
})

const User = mongoose.model("User", userSchema)
const MealPlan = mongoose.model("MealPlan", mealPlanSchema)
const Recipe = mongoose.model("Recipe", recipeSchema)
const ProgressLog = mongoose.model("ProgressLog", progressLogSchema)
const AiConversation = mongoose.model("AiConversation", aiConversationSchema)
const Notification = mongoose.model("Notification", notificationSchema)

const connectDB = async () => {
  await connectMongoDB()
}

module.exports = {
  connectDB,
  mongoose,
  User,
  MealPlan,
  Recipe,
  ProgressLog,
  AiConversation,
  Notification,
}
