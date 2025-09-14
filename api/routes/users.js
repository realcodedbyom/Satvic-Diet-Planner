const express = require("express")
const { User } = require("../config/database")
const router = express.Router()

// Get user profile
router.get("/profile", async (req, res) => {
  try {
    const userId = req.user.id
    const user = await User.findById(userId).select(
      "_id name email dosha_primary dosha_secondary constitution preferences onboarding_completed profile",
    )
    if (!user) return res.status(404).json({ error: "User not found" })
    res.json({ success: true, user })
  } catch (error) {
    console.error("Get profile error:", error)
    res.status(500).json({ error: "Error fetching user profile" })
  }
})

// Update user profile
router.put("/profile", async (req, res) => {
  try {
    const userId = req.user.id
    const { dosha_primary, dosha_secondary, constitution, preferences, onboarding_completed, profile } = req.body

    const update = { updated_at: new Date() }
    if (dosha_primary !== undefined) update.dosha_primary = dosha_primary
    if (dosha_secondary !== undefined) update.dosha_secondary = dosha_secondary
    if (constitution !== undefined) update.constitution = constitution
    if (preferences !== undefined) update.preferences = preferences
    if (onboarding_completed !== undefined) update.onboarding_completed = onboarding_completed
    if (profile !== undefined) {
      // Merge profile fields rather than overwrite entire object
      const existing = await User.findById(userId).select("profile")
      update.profile = {
        ...(existing?.profile?.toObject ? existing.profile.toObject() : existing?.profile || {}),
        ...profile,
      }
    }

    const user = await User.findByIdAndUpdate(userId, update, { new: true }).select(
      "_id name email dosha_primary dosha_secondary onboarding_completed",
    )
    res.json({ success: true, user })
  } catch (error) {
    console.error("Update profile error:", error)
    res.status(500).json({ error: "Error updating user profile" })
  }
})

// Delete user account
router.delete("/account", async (req, res) => {
  try {
    const userId = req.user.id
    const deleted = await User.findByIdAndDelete(userId)
    if (!deleted) {
      return res.status(404).json({ error: "User not found" })
    }

    res.json({
      success: true,
      message: "Account deleted successfully",
    })
  } catch (error) {
    console.error("Delete account error:", error)
    res.status(500).json({ error: "Error deleting account" })
  }
})

module.exports = router
