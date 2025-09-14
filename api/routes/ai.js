const express = require("express")
const { GoogleGenerativeAI } = require("@google/generative-ai")
const { AiConversation, User } = require("../config/database")
const router = express.Router()

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)

// Onboarding chat
router.post("/onboarding", async (req, res) => {
  try {
    const { message, step, previousResponses } = req.body
    const userId = req.user.id

    const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" })

    // Create context for the AI based on step and previous responses
    const context = `You are a knowledgeable Ayurvedic nutrition expert helping someone discover their dosha constitution.
Current step: ${step}/6
Previous responses: ${JSON.stringify(previousResponses)}
User message: ${message}

Respond with concise, friendly guidance. Then ask the next question for a 6-step onboarding.
Return formatted HTML (use <p>, <ul>, <li>, <strong>) suitable for direct rendering.`

    const result = await model.generateContent(context)
    const response = result.response.text()

    // Save conversation to database
    await AiConversation.create({
      user_id: userId,
      conversation_type: "onboarding",
      messages: { step, userMessage: message, aiResponse: response },
    })

    res.json({
      success: true,
      response,
      step: step + 1,
      completed: step + 1 > 6,
    })
  } catch (error) {
    console.error("AI onboarding error:", error)
    res.status(500).json({ error: "Error processing onboarding message" })
  }
})

// General chat
router.post("/chat", async (req, res) => {
  try {
    const { message } = req.body
    const userId = req.user.id

    // Get user's dosha information
    const user = await User.findById(userId).select("dosha_primary dosha_secondary constitution")

    const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" })

    const context = `You are a Satvic diet and Ayurvedic nutrition expert.
User's constitution: Primary dosha: ${user?.dosha_primary || "unknown"}, Secondary: ${user?.dosha_secondary || "unknown"}
User question: ${message}

Provide personalized advice using Satvic and Ayurvedic principles. Return HTML with proper paragraphs and lists.`

    const result = await model.generateContent(context)
    const response = result.response.text()

    // Save conversation
    await AiConversation.create({
      user_id: userId,
      conversation_type: "general_chat",
      messages: { userMessage: message, aiResponse: response },
    })

    res.json({
      success: true,
      response,
    })
  } catch (error) {
    console.error("AI chat error:", error)
    res.status(500).json({ error: "Error processing chat message" })
  }
})

// Generate meal plan
router.post("/generate-meal-plan", async (req, res) => {
  try {
    const { period, focus, preferences } = req.body
    const userId = req.user.id

    const user = await User.findById(userId).select("dosha_primary dosha_secondary preferences")

    const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" })

    const context = `Create a ${period} Satvic meal plan for someone with ${user?.dosha_primary || "unknown"} primary dosha and ${user?.dosha_secondary || "unknown"} secondary dosha.
Focus area: ${focus}
Additional preferences: ${JSON.stringify(preferences)}

Return ONLY JSON. Schema:
{
  "period": "daily|weekly|monthly",
  "days": [
    { "date": "YYYY-MM-DD", "breakfast": {...}, "lunch": {...}, "dinner": {...} }
  ]
}
Each meal should include name, description, dosha_benefits (object), and optional snacks.`

    const result = await model.generateContent(context)
    const mealPlan = result.response.text()

    // no-op

    let parsed
    try {
      parsed = JSON.parse(mealPlan)
    } catch (e) {
      return res.status(502).json({ error: "AI returned invalid JSON for meal plan" })
    }

    res.json({ success: true, mealPlan: parsed })
  } catch (error) {
    console.error("Meal plan generation error:", error)
    res.status(500).json({ error: "Error generating meal plan" })
  }
})

module.exports = router
