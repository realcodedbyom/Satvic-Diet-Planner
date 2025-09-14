const express = require("express")
const { MealPlan, User } = require("../config/database")
const router = express.Router()
const { GoogleGenerativeAI } = require("@google/generative-ai")
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)

// Get meal plans
router.get("/", async (req, res) => {
  try {
    const { start_date, end_date, limit = 30 } = req.query
    const userId = req.user.id

    const filter = { user_id: userId }
    if (start_date) filter.date = { ...(filter.date || {}), $gte: new Date(start_date) }
    if (end_date) filter.date = { ...(filter.date || {}), $lte: new Date(end_date) }

    const mealPlans = await MealPlan.find(filter).sort({ date: -1 }).limit(Number.parseInt(limit))
    res.json({ success: true, mealPlans })
  } catch (error) {
    console.error("Get meal plans error:", error)
    res.status(500).json({ error: "Error fetching meal plans" })
  }
})

// Create or update meal plan
router.post("/", async (req, res) => {
  try {
    const { date, breakfast, lunch, dinner, snacks, focus_area } = req.body
    const userId = req.user.id

    const existing = await MealPlan.findOne({ user_id: userId, date: new Date(date) })
    let saved
    if (existing) {
      existing.breakfast = breakfast
      existing.lunch = lunch
      existing.dinner = dinner
      existing.snacks = snacks
      existing.focus_area = focus_area
      existing.updated_at = new Date()
      saved = await existing.save()
    } else {
      saved = await MealPlan.create({ user_id: userId, date, breakfast, lunch, dinner, snacks, focus_area })
    }

    res.json({ success: true, mealPlan: saved })
  } catch (error) {
    console.error("Create/update meal plan error:", error)
    res.status(500).json({ error: "Error saving meal plan" })
  }
})

// Delete meal plan
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params
    const userId = req.user.id
    const deleted = await MealPlan.findOneAndDelete({ _id: id, user_id: userId })
    if (!deleted) return res.status(404).json({ error: "Meal plan not found" })
    res.json({ success: true, message: "Meal plan deleted successfully" })
  } catch (error) {
    console.error("Delete meal plan error:", error)
    res.status(500).json({ error: "Error deleting meal plan" })
  }
})

module.exports = router

// AI generate meal plan
router.post("/generate", async (req, res) => {
  try {
    const { period = "weekly", focus = "balance", preferences = {} } = req.body
    const userId = req.user.id

    const user = await User.findById(userId).select("dosha_primary dosha_secondary preferences")

    const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" })
    const prompt = `Create a ${period} Satvic meal plan for a user with primary dosha ${user.dosha_primary ||
      "unknown"} and secondary dosha ${user.dosha_secondary || "unknown"}.
Focus area: ${focus}
Preferences: ${JSON.stringify(preferences || user.preferences || {})}

Return ONLY valid JSON with keys: period, days[]. Each day has date, breakfast, lunch, dinner.
Each meal has name, description, dosha_benefits.`

    const result = await model.generateContent(prompt)
    let text = result.response.text()

    let parsed
    try {
      parsed = JSON.parse(text)
    } catch (e) {
      return res.status(502).json({ error: "AI returned invalid JSON" })
    }

    return res.json({ success: true, mealPlan: parsed })
  } catch (error) {
    console.error("AI meal plan generation error:", error)
    res.status(500).json({ error: "Error generating meal plan" })
  }
})
