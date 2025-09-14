const express = require("express")
const cors = require("cors")
const helmet = require("helmet")
const rateLimit = require("express-rate-limit")
const compression = require("compression")
const morgan = require("morgan")
const path = require("path")
require("dotenv").config()

// Import routes
const authRoutes = require("./api/routes/auth")
const userRoutes = require("./api/routes/users")
const mealPlanRoutes = require("./api/routes/mealPlans")
const recipeRoutes = require("./api/routes/recipes")
const aiRoutes = require("./api/routes/ai")
const progressRoutes = require("./api/routes/progress")
const shoppingRoutes = require("./api/routes/shopping")

// Import middleware
const { authenticateToken } = require("./api/middleware/auth")
const errorHandler = require("./api/middleware/errorHandler")

// Import database connection
const { connectDB } = require("./api/config/database")

const app = express()
const PORT = process.env.PORT || 3000

// Connect to database
connectDB()

// Security middleware
app.use(helmet())
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "http://localhost:3000",
    credentials: true,
  })
)

// Rate limiting
const limiter = rateLimit({
  windowMs: Number.parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: Number.parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // limit each IP to 100 requests per windowMs
})
app.use("/api/", limiter)

// Body parsing middleware
app.use(express.json({ limit: "10mb" }))
app.use(express.urlencoded({ extended: true, limit: "10mb" }))

// Compression middleware
app.use(compression())

// Logging middleware
app.use(morgan("combined"))

// Serve static files
app.use("/uploads", express.static(path.join(__dirname, "uploads")))
app.use("/templates/static", express.static(path.join(__dirname, "templates/static")))

// API Routes
app.use("/api/auth", authRoutes)
app.use("/api/users", authenticateToken, userRoutes)
app.use("/api/meal-plans", authenticateToken, mealPlanRoutes)
app.use("/api/recipes", authenticateToken, recipeRoutes)
app.use("/api/ai", authenticateToken, aiRoutes)
app.use("/api/progress", authenticateToken, progressRoutes)
app.use("/api/notifications", authenticateToken, require("./api/routes/notifications"))
app.use("/api/shopping", authenticateToken, shoppingRoutes)

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.status(200).json({
    status: "OK",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  })
})

// Serve the main HTML file for all non-API routes
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "templates/index.html"))
})

// Error handling middleware
app.use(errorHandler)

// Start server
app.listen(PORT, () => {
  console.log(`🌿 Satvic Diet Planner server running on port ${PORT}`)
  console.log(`🔗 Access the app at http://localhost:${PORT}`)
})

module.exports = app
