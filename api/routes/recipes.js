const express = require("express")
const { Recipe } = require("../config/database")
const router = express.Router()
const { GoogleGenerativeAI } = require("@google/generative-ai")
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)

// Get all recipes with filters
router.get("/", async (req, res) => {
  try {
    const { dosha, meal_type, cooking_time, search, limit = 20 } = req.query

    const filter = {}
    if (dosha) filter["dosha_benefits." + dosha] = { $exists: true }
    if (meal_type) filter.meal_type = meal_type
    if (cooking_time === "quick") filter.cooking_time = { $lte: 15 }
    if (cooking_time === "medium") filter.cooking_time = { $gte: 15, $lte: 30 }
    if (cooking_time === "long") filter.cooking_time = { $gt: 30 }
    if (search) filter.$or = [{ name: new RegExp(search, "i") }, { description: new RegExp(search, "i") }]

    const recipes = await Recipe.find(filter).sort({ created_at: -1 }).limit(Number.parseInt(limit))
    res.json({ success: true, recipes })
  } catch (error) {
    console.error("Get recipes error:", error)
    res.status(500).json({ error: "Error fetching recipes" })
  }
})

// Get single recipe
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params
    const recipe = await Recipe.findById(id)
    if (!recipe) return res.status(404).json({ error: "Recipe not found" })
    res.json({ success: true, recipe })
  } catch (error) {
    console.error("Get recipe error:", error)
    res.status(500).json({ error: "Error fetching recipe" })
  }
})

// Create new recipe (admin only)
router.post("/", async (req, res) => {
  try {
    const recipe = await Recipe.create(req.body)
    res.status(201).json({ success: true, recipe })
  } catch (error) {
    console.error("Create recipe error:", error)
    res.status(500).json({ error: "Error creating recipe" })
  }
})

module.exports = router

// AI-generated recipes
router.get("/ai", async (req, res) => {
  try {
    const { search = "", meal_type = "", dosha = "", cooking_time = "" } = req.query

    const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" })
    const prompt = `Generate 6 Satvic recipe suggestions as JSON array. Each item has: name, description, meal_type, cooking_time (minutes), dosha_benefits (object).
Query: ${search}. Meal type: ${meal_type}. Dosha: ${dosha}. Cooking time filter: ${cooking_time}.
Return ONLY JSON array.`

    const result = await model.generateContent(prompt)
    const text = result.response.text()
    let parsed
    try {
      parsed = JSON.parse(text)
    } catch (e) {
      return res.status(502).json({ error: "AI returned invalid JSON" })
    }

    res.json({ success: true, recipes: parsed })
  } catch (error) {
    console.error("AI recipes error:", error)
    res.status(500).json({ error: "Error generating recipes" })
  }
})
