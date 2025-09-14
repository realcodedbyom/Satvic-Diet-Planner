const express = require("express")
const router = express.Router()
const { GoogleGenerativeAI } = require("@google/generative-ai")
const { AiConversation, User } = require("../config/database")

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)

function buildFallbackList(budgetInr, goal) {
  const essentials = [
    { name: "Whole wheat atta", quantity: 2, unit: "kg", approx_price_inr: 120, category: "grains", priority: "high" },
    { name: "Moong dal", quantity: 1, unit: "kg", approx_price_inr: 140, category: "legumes", priority: "high" },
    { name: "Seasonal mixed vegetables", quantity: 2, unit: "kg", approx_price_inr: 160, category: "vegetables", priority: "high" },
    { name: "Tomatoes", quantity: 1, unit: "kg", approx_price_inr: 60, category: "vegetables", priority: "high" },
    { name: "Cucumbers", quantity: 1, unit: "kg", approx_price_inr: 50, category: "vegetables", priority: "medium" },
    { name: "Fruits (bananas/apples seasonal)", quantity: 1, unit: "kg", approx_price_inr: 90, category: "fruits", priority: "medium" },
    { name: "A2 milk or curd", quantity: 1, unit: "L", approx_price_inr: 70, category: "dairy", priority: "medium" },
    { name: "Cold-pressed groundnut oil", quantity: 1, unit: "L", approx_price_inr: 180, category: "condiments", priority: "high" },
    { name: "Rock salt (sendha namak)", quantity: 1, unit: "kg", approx_price_inr: 40, category: "spices", priority: "high" },
    { name: "Turmeric powder", quantity: 100, unit: "g", approx_price_inr: 30, category: "spices", priority: "high" },
    { name: "Cumin seeds", quantity: 100, unit: "g", approx_price_inr: 35, category: "spices", priority: "high" },
    { name: "Coriander powder", quantity: 100, unit: "g", approx_price_inr: 30, category: "spices", priority: "high" },
    { name: "Jaggery (unrefined)", quantity: 500, unit: "g", approx_price_inr: 40, category: "condiments", priority: "medium" },
    { name: "Peanuts or almonds", quantity: 250, unit: "g", approx_price_inr: 120, category: "nuts & seeds", priority: "medium" },
  ]

  // Trim or add based on budget
  let total = essentials.reduce((s, it) => s + it.approx_price_inr, 0)
  let items = [...essentials]

  if (total > budgetInr) {
    // Remove low priority until within budget
    const priorities = ["low", "medium", "high"]
    for (const p of priorities) {
      for (let i = items.length - 1; i >= 0 && total > budgetInr; i--) {
        if (items[i].priority === p) {
          total -= items[i].approx_price_inr
          items.splice(i, 1)
        }
      }
      if (total <= budgetInr) break
    }
  } else if (budgetInr - total >= 150) {
    // Add optional sattvic extras if budget allows
    const extras = [
      { name: "Ghee (cow)", quantity: 200, unit: "g", approx_price_inr: 150, category: "dairy", priority: "low" },
      { name: "Sesame seeds", quantity: 200, unit: "g", approx_price_inr: 80, category: "nuts & seeds", priority: "low" },
      { name: "Coconut (fresh)", quantity: 1, unit: "pcs", approx_price_inr: 40, category: "fruits", priority: "low" },
    ]
    for (const ex of extras) {
      if (total + ex.approx_price_inr <= budgetInr) {
        items.push(ex)
        total += ex.approx_price_inr
      }
    }
  }

  return {
    summary: {
      budget_inr: budgetInr,
      estimated_cost_inr: total,
      under_budget: total <= budgetInr,
      note: `Fallback list for: ${goal}`,
    },
    items,
  }
}

// POST /api/shopping/generate
// Body: { budget_inr: number, goal: string }
// Returns: { items: [...], summary: {...} }
router.post("/generate", async (req, res) => {
  try {
    const userId = req.user.id
    const { budget_inr, goal } = req.body

    if (!goal || !budget_inr || Number.isNaN(Number.parseInt(budget_inr))) {
      return res.status(400).json({ error: "Please provide a valid budget_inr and goal" })
    }

    // Fetch user context for personalization (optional)
    const user = await User.findById(userId).select("dosha_primary dosha_secondary preferences profile")

    const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" })
    const prompt = `You are a Satvic (sattvic) diet expert. Create a shopping list that adheres strictly to sattvic principles (no onion, no garlic, no eggs, no mushrooms, no alcohol, no processed foods; emphasize whole grains, fresh vegetables, fruits, nuts, seeds, legumes like moong/urad/masoor, clean dairy like A2 milk/curd/paneer if appropriate). Optimize quantities to fit within a budget in INR.

User primary dosha: ${user?.dosha_primary || "unknown"}; secondary dosha: ${user?.dosha_secondary || "unknown"}.
User preferences: ${JSON.stringify(user?.preferences || {})}.
User profile: ${JSON.stringify({ age: user?.profile?.age, activity_level: user?.profile?.activity_level })}.

Budget (INR): ${Number.parseInt(budget_inr)}
Cooking goal: ${goal}

Return ONLY valid JSON with this schema:
{
  "summary": {
    "budget_inr": number,
    "estimated_cost_inr": number,
    "under_budget": boolean,
    "note": string
  },
  "items": [
    {
      "name": string,              // e.g., "Moong dal"
      "quantity": number,          // numeric quantity
      "unit": string,              // e.g., "kg", "g", "L", "pcs"
      "approx_price_inr": number,  // realistic estimate for Indian market
      "category": string,          // e.g., "grains", "legumes", "vegetables", "fruits", "dairy", "spices", "condiments"
      "priority": "high"|"medium"|"low" // high for essentials to meet the goal within budget
    }
  ]
}
Ensure ALL items are sattvic-compliant. Prefer seasonal/local produce. If the budget is tight, prioritize essentials and mark optional items as low priority.`

    const result = await model.generateContent(prompt)
    const text = result.response.text()

    let parsed
    try {
      parsed = JSON.parse(text)
    } catch (e) {
      // Fallback if AI returns invalid JSON
      const fb = buildFallbackList(Number.parseInt(budget_inr), goal)
      return res.json({ success: true, data: fb })
    }

    // Light validation/normalization
    const summary = parsed.summary || {}
    const items = Array.isArray(parsed.items) ? parsed.items : []

    const normSummary = {
      budget_inr: Number.parseInt(summary.budget_inr) || Number.parseInt(budget_inr),
      estimated_cost_inr: Number.parseInt(summary.estimated_cost_inr) || items.reduce((sum, it) => sum + (Number(it.approx_price_inr) || 0), 0),
      under_budget: Boolean(summary.under_budget ?? ((Number.parseInt(budget_inr) || 0) >= (Number.parseInt(summary.estimated_cost_inr) || items.reduce((s, it) => s + (Number(it.approx_price_inr) || 0), 0)))),
      note: summary.note || "",
    }

    const normItems = items.map((it) => ({
      name: String(it.name || "Item"),
      quantity: Number(it.quantity || 0),
      unit: String(it.unit || ""),
      approx_price_inr: Number(it.approx_price_inr || 0),
      category: String(it.category || "other"),
      priority: ["high", "medium", "low"].includes(String(it.priority || "").toLowerCase())
        ? String(it.priority).toLowerCase()
        : "medium",
    }))

    // Save request/response for audit
    try {
      await AiConversation.create({
        user_id: userId,
        conversation_type: "shopping_generate",
        messages: { budget_inr, goal, response: { summary: normSummary, items: normItems } },
      })
    } catch (_) {}

    return res.json({ success: true, data: { summary: normSummary, items: normItems } })
  } catch (error) {
    console.error("Shopping generation error:", error)
    const budgetInr = Number.parseInt(req.body?.budget_inr)
    const goal = req.body?.goal || ""
    if (!Number.isNaN(budgetInr) && goal) {
      const fb = buildFallbackList(budgetInr, goal)
      return res.json({ success: true, data: fb })
    }
    return res.status(500).json({ error: "Error generating shopping list" })
  }
})

module.exports = router

