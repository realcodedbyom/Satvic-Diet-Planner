const express = require("express")
const bcrypt = require("bcryptjs")
const { User } = require("../config/database")
const { generateToken } = require("../middleware/auth")
const router = express.Router()

// Register
router.post("/register", async (req, res) => {
  try {
    const { name, email, password } = req.body

    // Validation
    if (!name || !email || !password) {
      return res.status(400).json({ error: "Please provide name, email, and password" })
    }

    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" })
    }

    // Check if user exists
    const existingUser = await User.findOne({ email })
    if (existingUser) {
      return res.status(400).json({ error: "User already exists with this email" })
    }

    // Hash password
    const saltRounds = 12
    const passwordHash = await bcrypt.hash(password, saltRounds)

    // Create user
    const user = await User.create({ name, email, password_hash: passwordHash })
    const token = generateToken(user._id)

    res.status(201).json({
      success: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
      },
    })
  } catch (error) {
    console.error("Registration error:", error)
    res.status(500).json({ error: "Server error during registration" })
  }
})

// Login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body

    // Validation
    if (!email || !password) {
      return res.status(400).json({ error: "Please provide email and password" })
    }

    // Find user
    const user = await User.findOne({ email }).select(
      "_id name email password_hash dosha_primary dosha_secondary onboarding_completed",
    )

    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" })
    }

    // Check password
    const isPasswordValid = await bcrypt.compare(password, user.password_hash)
    if (!isPasswordValid) {
      return res.status(401).json({ error: "Invalid credentials" })
    }

    const token = generateToken(user._id)

    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        dosha_primary: user.dosha_primary,
        dosha_secondary: user.dosha_secondary,
        onboarding_completed: user.onboarding_completed,
      },
    })
  } catch (error) {
    console.error("Login error:", error)
    res.status(500).json({ error: "Server error during login" })
  }
})

// Verify token
router.get("/verify", async (req, res) => {
  const authHeader = req.headers["authorization"]
  const token = authHeader && authHeader.split(" ")[1]

  if (!token) {
    return res.status(401).json({ error: "No token provided" })
  }

  try {
    const jwt = require("jsonwebtoken")
    const decoded = jwt.verify(token, process.env.JWT_SECRET)

    const user = await User.findById(decoded.userId).select(
      "_id name email dosha_primary dosha_secondary onboarding_completed",
    )

    if (!user) {
      return res.status(401).json({ error: "User not found" })
    }

    res.json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        dosha_primary: user.dosha_primary,
        dosha_secondary: user.dosha_secondary,
        onboarding_completed: user.onboarding_completed,
      },
    })
  } catch (error) {
    res.status(401).json({ error: "Invalid token" })
  }
})

module.exports = router
