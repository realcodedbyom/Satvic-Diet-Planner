const { pgPool } = require("../api/config/database")

const sampleRecipes = [
  {
    name: "Healing Kitchari",
    description:
      "Traditional one-pot meal of mung dal and basmati rice, cooked with digestive spices and ghee. Perfect for cleansing and nourishing.",
    ingredients: [
      "1 cup basmati rice",
      "1/2 cup split mung dal",
      "1 tbsp ghee",
      "1 tsp cumin seeds",
      "1 tsp coriander seeds",
      "1/2 tsp turmeric",
      "1 inch ginger, minced",
      "4 cups water",
      "Salt to taste",
      "Fresh cilantro for garnish",
    ],
    instructions: [
      "Wash rice and dal until water runs clear",
      "Heat ghee in a pot and add cumin seeds",
      "Add ginger and sauté for 30 seconds",
      "Add rice, dal, turmeric, and water",
      "Bring to boil, then simmer covered for 25-30 minutes",
      "Season with salt and garnish with cilantro",
    ],
    dosha_benefits: {
      vata: "Grounding and nourishing",
      pitta: "Cooling and easy to digest",
      kapha: "Light and cleansing",
    },
    meal_type: "dinner",
    cooking_time: 30,
    difficulty_level: "easy",
    nutritional_info: {
      calories: 280,
      protein: 12,
      carbs: 52,
      fat: 4,
      fiber: 8,
    },
    seasonal_tags: ["autumn", "winter", "spring"],
    image_url: "/kitchari-bowl-with-rice-and-lentils.jpg",
  },
  {
    name: "Spiced Oats Porridge",
    description:
      "Warming breakfast porridge with cardamom, cinnamon, and seasonal fruits. Grounding and energizing start to your day.",
    ingredients: [
      "1 cup rolled oats",
      "2 cups water or plant milk",
      "1/2 tsp cinnamon",
      "1/4 tsp cardamom",
      "1 tbsp ghee or coconut oil",
      "1 tbsp maple syrup",
      "1/4 cup chopped almonds",
      "1 apple, diced",
      "Pinch of salt",
    ],
    instructions: [
      "Heat ghee in a saucepan",
      "Add oats and toast for 2 minutes",
      "Add spices and cook for 30 seconds",
      "Add liquid and bring to boil",
      "Simmer for 10-15 minutes until creamy",
      "Stir in maple syrup, top with fruits and nuts",
    ],
    dosha_benefits: {
      vata: "Warming and grounding",
      kapha: "Energizing and light",
    },
    meal_type: "breakfast",
    cooking_time: 15,
    difficulty_level: "easy",
    nutritional_info: {
      calories: 320,
      protein: 8,
      carbs: 45,
      fat: 12,
      fiber: 6,
    },
    seasonal_tags: ["autumn", "winter"],
    image_url: "/oats-porridge-with-fruits-and-nuts.jpg",
  },
  {
    name: "Cooling Vegetable Curry",
    description:
      "Seasonal vegetables cooked with cooling spices like coriander and fennel. Perfect for balancing excess heat in the body.",
    ingredients: [
      "2 cups mixed seasonal vegetables",
      "1 tbsp coconut oil",
      "1 tsp coriander seeds",
      "1 tsp fennel seeds",
      "1/2 tsp turmeric",
      "1 cup coconut milk",
      "1 tbsp fresh cilantro",
      "1 tsp lime juice",
      "Salt to taste",
    ],
    instructions: [
      "Heat oil and add coriander and fennel seeds",
      "Add vegetables and turmeric",
      "Cook for 5 minutes until slightly tender",
      "Add coconut milk and simmer for 15 minutes",
      "Season with salt and lime juice",
      "Garnish with fresh cilantro",
    ],
    dosha_benefits: {
      pitta: "Cooling and soothing",
    },
    meal_type: "lunch",
    cooking_time: 25,
    difficulty_level: "medium",
    nutritional_info: {
      calories: 180,
      protein: 4,
      carbs: 12,
      fat: 14,
      fiber: 5,
    },
    seasonal_tags: ["summer", "spring"],
    image_url: "/vegetable-curry-with-coconut-milk.jpg",
  },
  {
    name: "Golden Milk Latte",
    description:
      "Warming turmeric latte with healing spices. Perfect evening drink for relaxation and anti-inflammatory benefits.",
    ingredients: [
      "1 cup plant milk",
      "1/2 tsp turmeric",
      "1/4 tsp cinnamon",
      "1/8 tsp ginger powder",
      "Pinch of black pepper",
      "1 tsp ghee or coconut oil",
      "1 tsp maple syrup",
      "Pinch of cardamom",
    ],
    instructions: [
      "Heat milk in a saucepan",
      "Whisk in all spices",
      "Simmer for 5 minutes",
      "Add ghee and maple syrup",
      "Strain and serve warm",
      "Sprinkle with cardamom",
    ],
    dosha_benefits: {
      vata: "Warming and calming",
      kapha: "Stimulating and cleansing",
    },
    meal_type: "snack",
    cooking_time: 10,
    difficulty_level: "easy",
    nutritional_info: {
      calories: 120,
      protein: 3,
      carbs: 8,
      fat: 8,
      fiber: 1,
    },
    seasonal_tags: ["autumn", "winter"],
    image_url: "/golden-turmeric-latte-in-cup.jpg",
  },
  {
    name: "Quinoa Vegetable Bowl",
    description:
      "Nutritious bowl with quinoa, seasonal vegetables, and tahini dressing. Balanced meal for sustained energy.",
    ingredients: [
      "1 cup quinoa",
      "2 cups vegetable broth",
      "1 cup roasted vegetables",
      "2 tbsp tahini",
      "1 tbsp lemon juice",
      "1 tsp olive oil",
      "1/4 cup pumpkin seeds",
      "Fresh herbs for garnish",
      "Salt and pepper to taste",
    ],
    instructions: [
      "Cook quinoa in vegetable broth for 15 minutes",
      "Roast seasonal vegetables with olive oil",
      "Mix tahini with lemon juice for dressing",
      "Combine quinoa and vegetables in bowl",
      "Drizzle with tahini dressing",
      "Top with seeds and fresh herbs",
    ],
    dosha_benefits: {
      vata: "Grounding and nourishing",
      pitta: "Cooling and satisfying",
    },
    meal_type: "lunch",
    cooking_time: 30,
    difficulty_level: "medium",
    nutritional_info: {
      calories: 380,
      protein: 14,
      carbs: 48,
      fat: 16,
      fiber: 8,
    },
    seasonal_tags: ["spring", "summer", "autumn"],
    image_url: "/quinoa-bowl-with-vegetables-and-seeds.jpg",
  },
]

async function seedDatabase() {
  console.log("🌱 Starting database seeding...")

  try {
    const client = await pgPool.connect()

    // Clear existing recipes
    await client.query("DELETE FROM recipes")
    console.log("✅ Cleared existing recipes")

    // Insert sample recipes
    for (const recipe of sampleRecipes) {
      await client.query(
        `INSERT INTO recipes (name, description, ingredients, instructions, dosha_benefits, 
         meal_type, cooking_time, difficulty_level, nutritional_info, seasonal_tags, image_url)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          recipe.name,
          recipe.description,
          JSON.stringify(recipe.ingredients),
          JSON.stringify(recipe.instructions),
          JSON.stringify(recipe.dosha_benefits),
          recipe.meal_type,
          recipe.cooking_time,
          recipe.difficulty_level,
          JSON.stringify(recipe.nutritional_info),
          JSON.stringify(recipe.seasonal_tags),
          recipe.image_url,
        ],
      )
    }

    console.log(`✅ Inserted ${sampleRecipes.length} sample recipes`)

    // Create sample user for testing
    const bcrypt = require("bcryptjs")
    const hashedPassword = await bcrypt.hash("password123", 12)

    await client.query(
      `INSERT INTO users (name, email, password_hash, dosha_primary, dosha_secondary, constitution)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (email) DO NOTHING`,
      [
        "Test User",
        "test@satvic.com",
        hashedPassword,
        "pitta",
        "vata",
        JSON.stringify({
          primaryDosha: "pitta",
          secondaryDosha: "vata",
          constitution: "pitta-vata",
          recommendations: [
            "Focus on cooling foods",
            "Eat regular meals",
            "Avoid spicy foods",
            "Practice calming activities",
          ],
        }),
      ],
    )

    console.log("✅ Created test user (test@satvic.com / password123)")

    client.release()
    console.log("🎉 Database seeding completed successfully!")
  } catch (error) {
    console.error("❌ Database seeding failed:", error)
    process.exit(1)
  }
}

// Run seeding if called directly
if (require.main === module) {
  seedDatabase().then(() => {
    process.exit(0)
  })
}

module.exports = seedDatabase
