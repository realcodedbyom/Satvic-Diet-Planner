const express = require("express")
const { Notification } = require("../config/database")
const router = express.Router()

// Create a notification/reminder
router.post("/", async (req, res) => {
  try {
    const userId = req.user.id
    const { title, message, scheduled_for, type = "reminder" } = req.body

    if (!title || !message || !scheduled_for) {
      return res.status(400).json({ error: "title, message, and scheduled_for are required" })
    }

    const notification = await Notification.create({ user_id: userId, title, message, type, scheduled_for })
    res.status(201).json({ success: true, notification })
  } catch (error) {
    console.error("Create notification error:", error)
    res.status(500).json({ error: "Error creating notification" })
  }
})

// List notifications
router.get("/", async (req, res) => {
  try {
    const userId = req.user.id
    const notifications = await Notification.find({ user_id: userId }).sort({ scheduled_for: -1 }).limit(100)
    res.json({ success: true, notifications })
  } catch (error) {
    console.error("Get notifications error:", error)
    res.status(500).json({ error: "Error fetching notifications" })
  }
})

module.exports = router

