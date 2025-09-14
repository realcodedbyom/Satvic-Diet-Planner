const express = require("express")
const { ProgressLog } = require("../config/database")
const router = express.Router()

// Log daily progress
router.post("/log", async (req, res) => {
  try {
    const {
      date,
      energy_morning,
      energy_afternoon,
      energy_evening,
      digestion_score,
      sleep_quality,
      mood_score,
      weight,
      notes,
    } = req.body

    const userId = req.user.id
    const existing = await ProgressLog.findOne({ user_id: userId, date: new Date(date) })
    if (existing) {
      existing.energy_morning = energy_morning
      existing.energy_afternoon = energy_afternoon
      existing.energy_evening = energy_evening
      existing.digestion_score = digestion_score
      existing.sleep_quality = sleep_quality
      existing.mood_score = mood_score
      existing.weight = weight
      existing.notes = notes
      existing.updated_at = new Date()
      await existing.save()
      return res.json({ success: true, progress: existing })
    }
    const created = await ProgressLog.create({
      user_id: userId,
      date,
      energy_morning,
      energy_afternoon,
      energy_evening,
      digestion_score,
      sleep_quality,
      mood_score,
      weight,
      notes,
    })
    res.json({ success: true, progress: created })
  } catch (error) {
    console.error("Progress log error:", error)
    res.status(500).json({ error: "Error logging progress" })
  }
})

// Get progress data
router.get("/", async (req, res) => {
  try {
    const { start_date, end_date, limit = 30 } = req.query
    const userId = req.user.id

    const filter = { user_id: userId }
    if (start_date) filter.date = { ...(filter.date || {}), $gte: new Date(start_date) }
    if (end_date) filter.date = { ...(filter.date || {}), $lte: new Date(end_date) }

    const result = await ProgressLog.find(filter).sort({ date: -1 }).limit(Number.parseInt(limit))
    res.json({ success: true, progress: result })
  } catch (error) {
    console.error("Get progress error:", error)
    res.status(500).json({ error: "Error fetching progress data" })
  }
})

// Get progress analytics
router.get("/analytics", async (req, res) => {
  try {
    const userId = req.user.id

    const last30Days = new Date()
    last30Days.setDate(last30Days.getDate() - 30)

    const analyticsAgg = await ProgressLog.aggregate([
      { $match: { user_id: new (require("mongoose").Types.ObjectId)(userId), date: { $gte: last30Days } } },
      {
        $group: {
          _id: null,
          avg_energy_morning: { $avg: "$energy_morning" },
          avg_energy_afternoon: { $avg: "$energy_afternoon" },
          avg_energy_evening: { $avg: "$energy_evening" },
          avg_digestion: { $avg: "$digestion_score" },
          avg_sleep: { $avg: "$sleep_quality" },
          avg_mood: { $avg: "$mood_score" },
          avg_weight: { $avg: "$weight" },
          total_logs: { $sum: 1 },
        },
      },
    ])

    const last12Weeks = new Date()
    last12Weeks.setDate(last12Weeks.getDate() - 84)

    const trends = await ProgressLog.aggregate([
      { $match: { user_id: new (require("mongoose").Types.ObjectId)(userId), date: { $gte: last12Weeks } } },
      {
        $group: {
          _id: { $isoWeek: "$date" },
          avg_energy: {
            $avg: {
              $avg: ["$energy_morning", "$energy_afternoon", "$energy_evening"],
            },
          },
          avg_digestion: { $avg: "$digestion_score" },
          avg_sleep: { $avg: "$sleep_quality" },
          avg_mood: { $avg: "$mood_score" },
        },
      },
      { $sort: { "_id": 1 } },
    ])

    const raw = analyticsAgg[0] || {}
    const energyParts = [raw.avg_energy_morning, raw.avg_energy_afternoon, raw.avg_energy_evening].filter(
      (n) => typeof n === "number" && !Number.isNaN(n),
    )
    const avg_energy = energyParts.length ? energyParts.reduce((s, n) => s + n, 0) / energyParts.length : undefined

    const analytics = {
      ...raw,
      avg_energy,
      total_entries: raw.total_logs || 0,
    }

    res.json({ success: true, analytics, trends })
  } catch (error) {
    console.error("Progress analytics error:", error)
    res.status(500).json({ error: "Error fetching progress analytics" })
  }
})

module.exports = router

// Alias route to support frontend POST /api/progress
router.post("/", async (req, res) => {
  try {
    const {
      date,
      energy_level,
      mood,
      sleep_quality,
      weight,
      water_intake,
      exercise_minutes,
      notes,
    } = req.body

    const userId = req.user.id
    const existing = await ProgressLog.findOne({ user_id: userId, date: new Date(date || new Date().toISOString()) })
    if (existing) {
      existing.energy_morning = energy_level || existing.energy_morning
      existing.sleep_quality = sleep_quality || existing.sleep_quality
      existing.mood_score = mood || existing.mood_score
      existing.weight = weight || existing.weight
      existing.notes = notes || existing.notes
      existing.updated_at = new Date()
      const saved = await existing.save()
      return res.json({ success: true, progress: saved })
    }
    const created = await ProgressLog.create({
      user_id: userId,
      date: date || new Date().toISOString(),
      energy_morning: energy_level || null,
      sleep_quality: sleep_quality || null,
      mood_score: mood || null,
      weight: weight || null,
      notes: notes || null,
    })
    res.json({ success: true, progress: created })
  } catch (error) {
    console.error("Progress create error:", error)
    res.status(500).json({ error: "Error saving progress" })
  }
})
