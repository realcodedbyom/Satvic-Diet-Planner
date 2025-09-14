// Satvic Diet Planner - Enhanced Frontend Application
class SatvicApp {
  constructor() {
    this.baseURL = "/api"
    this.token = localStorage.getItem("satvic_token")
    this.user = null
    this.currentSection = "landing"
    this.onboardingStep = 1
    this.onboardingResponses = {}
    this.isProfileOnboarding = false
    this.onboardingQuestions = []
    this.currentQuestionIndex = 0
    this.totalOnboardingSteps = 0

    this.init()
  }

  async beginOnboardingFlow() {
    try {
      this.isProfileOnboarding = true
      // Fetch latest profile
      const resp = await this.makeRequest("/users/profile", "GET")
      const user = resp?.data?.user || {}
      const profile = user.profile || {}

      // Build dynamic questions for only missing fields present in profile page
      const questions = []

      if (!profile.age) {
        questions.push({
          field: "age",
          prompt: "To personalize your plan, what is your age? (in years)",
          parser: (txt) => {
            const n = Number.parseInt(txt, 10)
            if (Number.isNaN(n) || n < 1 || n > 120) throw new Error("Please enter a valid age between 1 and 120.")
            return n
          },
        })
      }

      if (!profile.height) {
        questions.push({
          field: "height",
          prompt: "What is your height in centimeters?",
          parser: (txt) => {
            const n = Number.parseInt(txt, 10)
            if (Number.isNaN(n) || n < 100 || n > 250) throw new Error("Please enter a valid height in cm (100-250).")
            return n
          },
        })
      }

      if (!profile.activity_level) {
        questions.push({
          field: "activity_level",
          prompt:
            "How active are you? Reply with one: sedentary, light, moderate, active, very_active.",
          parser: (txt) => {
            const value = String(txt || "").toLowerCase().replace(/\s+/g, "_")
            const allowed = ["sedentary", "light", "moderate", "active", "very_active"]
            if (!allowed.includes(value)) throw new Error("Please reply: sedentary, light, moderate, active, or very_active.")
            return value
          },
        })
      }

      const hasGoals = Array.isArray(profile.health_goals) && profile.health_goals.length > 0
      if (!hasGoals) {
        questions.push({
          field: "health_goals",
          prompt:
            "Select your health goals. Reply with comma-separated values from: weight_loss, weight_gain, muscle_gain, better_energy, better_sleep, stress_management.",
          parser: (txt) => {
            const allowed = new Set([
              "weight_loss",
              "weight_gain",
              "muscle_gain",
              "better_energy",
              "better_sleep",
              "stress_management",
            ])
            const values = String(txt || "")
              .toLowerCase()
              .split(/[,\n]/)
              .map((s) => s.trim().replace(/\s+/g, "_"))
              .filter(Boolean)
            const filtered = [...new Set(values.filter((v) => allowed.has(v)))]
            if (filtered.length === 0) throw new Error("Please choose at least one valid goal from the list.")
            return filtered
          },
        })
      }

      this.onboardingQuestions = questions
      this.currentQuestionIndex = 0
      this.totalOnboardingSteps = questions.length
      this.updateOnboardingProgress()

      if (this.totalOnboardingSteps === 0) {
        // Nothing to ask, complete immediately
        await this.completeOnboarding()
        return
      }

      // Greet and ask first
      this.addOnboardingMessage(
        `<p class="text-gray-800">Great to have you here, ${user.name || "friend"}! I'll just capture a few quick profile details to personalize your experience.</p>`,
        "ai",
        true,
      )
      this.presentCurrentQuestion()
    } catch (error) {
      console.log("[v0] beginOnboardingFlow error:", error.message)
    }
  }

  presentCurrentQuestion() {
    if (!this.isProfileOnboarding) return
    const q = this.onboardingQuestions[this.currentQuestionIndex]
    if (!q) return
    this.addOnboardingMessage(`<p>${q.prompt}</p>`, "ai", true)
    this.updateOnboardingProgress()
  }

  async handleProfileOnboardingResponse(message) {
    const question = this.onboardingQuestions[this.currentQuestionIndex]
    if (!question) return
    try {
      const parsed = question.parser(message)
      await this.saveProfilePartial({ [question.field]: parsed })

      this.currentQuestionIndex += 1
      if (this.currentQuestionIndex >= this.onboardingQuestions.length) {
        // Done
        await this.completeOnboarding()
      } else {
        this.presentCurrentQuestion()
      }
    } catch (e) {
      this.addOnboardingMessage(`<p class="text-red-600">${e.message}</p>`, "ai", true)
      // Re-ask same question
      this.presentCurrentQuestion()
    }
  }

  async saveProfilePartial(partialProfile) {
    try {
      await this.makeRequest("/users/profile", "PUT", { profile: partialProfile })
    } catch (e) {
      console.log("[v0] saveProfilePartial error:", e.message)
    }
  }

  init() {
    console.log("[v0] Initializing Satvic App...")
    this.setupEventListeners()
    this.checkAuthStatus()
  }

  async checkAuthStatus() {
    console.log("[v0] Checking authentication status...")

    if (!this.token) {
      console.log("[v0] No token found, showing landing")
      this.hideAuthenticatedUI()
      this.showSection("landing")
      return
    }

    try {
      const response = await this.makeRequest("/auth/verify", "GET")

      if (response.data && response.data.user) {
        this.user = response.data.user
        console.log("[v0] User authenticated:", this.user.email)

        this.showAuthenticatedUI()

        // Determine which section to show
        if (!this.user.onboarding_completed) {
          this.showSection("onboarding")
          this.beginOnboardingFlow()
        } else {
          this.showSection("dashboard")
          this.loadDashboardData()
        }
      } else {
        throw new Error("Invalid token")
      }
    } catch (error) {
      console.log("[v0] Authentication failed:", error.message)
      this.logout()
    }
  }

  showAuthenticatedUI() {
    document.getElementById("hamburgerBtn").style.display = "block"
    const ctas = document.getElementById("publicCtas")
    if (ctas) ctas.style.display = "none"
  }

  hideAuthenticatedUI() {
    document.getElementById("hamburgerBtn").style.display = "none"
    const ctas = document.getElementById("publicCtas")
    if (ctas) ctas.style.display = "flex"
  }

  setupEventListeners() {
    document.getElementById("loginForm").addEventListener("submit", (e) => this.handleLogin(e))
    document.getElementById("registerForm").addEventListener("submit", (e) => this.handleRegister(e))

    document.getElementById("showRegister").addEventListener("click", (e) => {
      e.preventDefault()
      this.showSection("register")
    })

    document.getElementById("showLogin").addEventListener("click", (e) => {
      e.preventDefault()
      this.showSection("login")
    })

    document.getElementById("logoutBtn").addEventListener("click", (e) => {
      e.preventDefault()
      this.logout()
    })

    this.setupPasswordToggles()

    this.setupHamburgerMenu()

    this.setupAIChat()

    this.setupMealPlanning()

    this.setupRecipeSearch()

    this.setupPasswordValidation()

    this.setupProgressTracking()

    this.setupNotifications()

    this.setupProfile()

    this.setupShopping()

    // Landing / navbar CTA buttons
    ;[
      { id: "navSignIn", target: "login" },
      { id: "heroSignIn", target: "login" },
      { id: "navGetStarted", target: "register" },
      { id: "heroGetStarted", target: "register" },
    ].forEach(({ id, target }) => {
      const btn = document.getElementById(id)
      if (btn) {
        btn.addEventListener("click", (e) => {
          e.preventDefault()
          this.showSection(target)
        })
      }
    })
  }

  setupShopping() {
    const btn = document.getElementById("generateShoppingList")
    if (btn) {
      btn.addEventListener("click", () => this.generateShoppingList())
    }
  }

  async generateShoppingList() {
    const budgetInput = document.getElementById("shoppingBudget")
    const goalInput = document.getElementById("shoppingGoal")
    const itemsGrid = document.getElementById("shoppingItems")
    const summaryBox = document.getElementById("shoppingSummary")
    const summaryText = document.getElementById("shoppingSummaryText")
    const btn = document.getElementById("generateShoppingList")

    if (!budgetInput || !goalInput || !itemsGrid || !summaryBox || !summaryText || !btn) return

    const budget = Number.parseInt(budgetInput.value, 10)
    const goal = (goalInput.value || "").trim()

    if (!goal) {
      alert("Please describe what you want to make.")
      return
    }
    if (Number.isNaN(budget) || budget <= 0) {
      alert("Please enter a valid budget in rupees (₹).")
      return
    }

    const original = btn.innerHTML
    btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Generating...'
    btn.disabled = true

    itemsGrid.innerHTML = ""
    summaryBox.classList.add("hidden")
    summaryText.textContent = ""

    try {
      const resp = await this.makeRequest("/shopping/generate", "POST", {
        budget_inr: budget,
        goal: goal,
      })

      const payload = resp.data || {}
      const data = payload.data || payload
      const items = Array.isArray(data.items) ? data.items : []
      const summary = data.summary || {}

      // Render summary
      const est = summary.estimated_cost_inr != null ? `Estimated cost: ₹${summary.estimated_cost_inr}` : ""
      const bud = summary.budget_inr != null ? `Budget: ₹${summary.budget_inr}` : ""
      const gap = summary.estimated_cost_inr != null && summary.budget_inr != null
        ? ` (${summary.under_budget ? "under" : "over"} by ₹${Math.abs((summary.budget_inr || 0) - (summary.estimated_cost_inr || 0))})`
        : ""
      summaryText.textContent = `${bud}${bud && est ? " · " : ""}${est}${gap}${summary.note ? ` · ${summary.note}` : ""}`
      summaryBox.classList.remove("hidden")

      // Render items
      if (items.length === 0) {
        itemsGrid.innerHTML = '<p class="text-gray-500 col-span-full">No items suggested.</p>'
        return
      }

      items.forEach((it) => {
        const card = document.createElement("div")
        card.className = "bg-white rounded-xl shadow-md p-5 border border-gray-100"
        const qty =
          it.quantity != null && it.unit
            ? `${it.quantity} ${it.unit}`
            : it.quantity != null
            ? String(it.quantity)
            : "—"
        const price = it.approx_price_inr != null ? `₹${it.approx_price_inr}` : "—"
        const category = it.category || "Other"
        const priority = it.priority ? `<span class="ml-2 text-xs px-2 py-0.5 rounded-full ${
          it.priority === "high"
            ? "bg-red-100 text-red-700"
            : it.priority === "medium"
            ? "bg-yellow-100 text-yellow-700"
            : "bg-gray-100 text-gray-700"
        }">${it.priority}</span>` : ""
        card.innerHTML = `
          <div class="flex items-start justify-between mb-2">
            <h4 class="text-lg font-semibold text-gray-800">${it.name || "Item"}${priority}</h4>
            <span class="text-sm text-gray-500">${category}</span>
          </div>
          <div class="grid grid-cols-2 gap-3 text-sm text-gray-700">
            <div><span class="text-gray-500">Quantity:</span> <span class="font-medium">${qty}</span></div>
            <div><span class="text-gray-500">Approx Price:</span> <span class="font-medium">${price}</span></div>
          </div>
        `
        itemsGrid.appendChild(card)
      })
    } catch (error) {
      console.log("[v0] Shopping generate error:", error.message)
      alert("Failed to generate shopping list. Please try again.")
    } finally {
      btn.innerHTML = original
      btn.disabled = false
    }
  }

  setupPasswordToggles() {
    const toggles = [
      { button: "toggleLoginPassword", input: "password" },
      { button: "toggleRegPassword", input: "reg-password" },
      { button: "toggleConfirmPassword", input: "reg-confirm" },
    ]

    toggles.forEach(({ button, input }) => {
      const toggleBtn = document.getElementById(button)
      const inputField = document.getElementById(input)

      if (toggleBtn && inputField) {
        toggleBtn.addEventListener("click", () => {
          const type = inputField.type === "password" ? "text" : "password"
          inputField.type = type

          const icon = toggleBtn.querySelector("i")
          icon.className = type === "password" ? "fas fa-eye" : "fas fa-eye-slash"
        })
      }
    })
  }

  setupPasswordValidation() {
    const password = document.getElementById("reg-password")
    const confirm = document.getElementById("reg-confirm")
    const matchDiv = document.getElementById("passwordMatch")
    const matchText = document.getElementById("passwordMatchText")

    const validatePasswords = () => {
      if (confirm.value === "") {
        matchDiv.classList.add("hidden")
        return
      }

      matchDiv.classList.remove("hidden")

      if (password.value === confirm.value) {
        matchDiv.className = "mt-1 text-xs text-green-600"
        matchText.textContent = "✓ Passwords match"
      } else {
        matchDiv.className = "mt-1 text-xs text-red-600"
        matchText.textContent = "✗ Passwords do not match"
      }
    }

    password.addEventListener("input", validatePasswords)
    confirm.addEventListener("input", validatePasswords)
  }

  setupNavigation() {
    document.querySelectorAll(".nav-link").forEach((link) => {
      link.addEventListener("click", (e) => {
        e.preventDefault()
        const target = link.getAttribute("data-target")
        this.showSection(target)

        document.querySelectorAll(".nav-link").forEach((l) => l.classList.remove("active-tab"))
        link.classList.add("active-tab")
      })
    })

    const mobileMenuBtn = document.getElementById("mobileMenuBtn")
    const mobileMenu = document.getElementById("mobileMenu")

    if (mobileMenuBtn && mobileMenu) {
      mobileMenuBtn.addEventListener("click", () => {
        mobileMenu.classList.toggle("hidden")
      })
    }
  }

  setupAIChat() {
    const onboardingInput = document.getElementById("onboardingInput")
    const onboardingSend = document.getElementById("onboardingSend")

    if (onboardingInput && onboardingSend) {
      onboardingSend.addEventListener("click", () => this.sendOnboardingMessage())
      onboardingInput.addEventListener("keypress", (e) => {
        if (e.key === "Enter") this.sendOnboardingMessage()
      })
    }

    const chatInput = document.getElementById("chatInput")
    const chatSend = document.getElementById("chatSend")

    if (chatInput && chatSend) {
      chatSend.addEventListener("click", () => this.sendChatMessage())
      chatInput.addEventListener("keypress", (e) => {
        if (e.key === "Enter") this.sendChatMessage()
      })
    }

    document.querySelectorAll(".quick-question").forEach((btn) => {
      btn.addEventListener("click", () => {
        const question = btn.textContent.trim()
        document.getElementById("chatInput").value = question
        this.sendChatMessage()
      })
    })

    // Quick recipe suggestions chips
    document.querySelectorAll(".quick-recipe").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const query = btn.getAttribute("data-query") || "healthy meal"
        const params = new URLSearchParams({ search: query })
        try {
          const response = await this.makeRequest(`/recipes/ai?${params.toString()}`, "GET")
          if (response.data && response.data.recipes) {
            this.displayRecipes(response.data.recipes)
          }
        } catch (_) {}
      })
    })
  }

  setupMealPlanning() {
    const generateBtn = document.getElementById("generateMealPlan")
    if (generateBtn) {
      generateBtn.addEventListener("click", () => this.generateMealPlan())
    }
  }

  setupRecipeSearch() {
    const searchBtn = document.getElementById("searchRecipes")
    if (searchBtn) {
      searchBtn.addEventListener("click", () => this.searchRecipes())
    }

    this.loadFeaturedRecipes()
  }

  async handleLogin(e) {
    e.preventDefault()

    const email = document.getElementById("email").value.trim()
    const password = document.getElementById("password").value

    if (!email || !password) {
      this.showError("loginError", "loginErrorText", "Please fill in all fields")
      return
    }

    this.setLoading("loginBtn", "loginBtnText", "loginSpinner", true, "Signing In...")

    try {
      const response = await this.makeRequest("/auth/login", "POST", {
        email,
        password,
      })

      if (response.data) {
        this.token = response.data.token
        this.user = response.data.user

        localStorage.setItem("satvic_token", this.token)

        console.log("[v0] Login successful for:", email)

        this.showAuthenticatedUI()

        if (!this.user.onboarding_completed) {
          this.showSection("onboarding")
          this.beginOnboardingFlow()
        } else {
          this.showSection("dashboard")
          this.loadDashboardData()
        }

        this.hideError("loginError")
      }
    } catch (error) {
      console.log("[v0] Login error:", error.message)
      this.showError("loginError", "loginErrorText", error.message || "Login failed. Please try again.")
    } finally {
      this.setLoading("loginBtn", "loginBtnText", "loginSpinner", false, "Begin Your Satvic Journey")
    }
  }

  async handleRegister(e) {
    e.preventDefault()

    const name = document.getElementById("reg-name").value.trim()
    const email = document.getElementById("reg-email").value.trim()
    const password = document.getElementById("reg-password").value
    const confirmPassword = document.getElementById("reg-confirm").value

    if (!name || !email || !password || !confirmPassword) {
      this.showError("registerError", "registerErrorText", "Please fill in all fields")
      return
    }

    if (password !== confirmPassword) {
      this.showError("registerError", "registerErrorText", "Passwords do not match")
      return
    }

    if (password.length < 6) {
      this.showError("registerError", "registerErrorText", "Password must be at least 6 characters long")
      return
    }

    this.setLoading("registerBtn", "registerBtnText", "registerSpinner", true, "Creating Account...")

    try {
      const response = await this.makeRequest("/auth/register", "POST", {
        name,
        email,
        password,
      })

      if (response.data) {
        this.token = response.data.token
        this.user = response.data.user

        localStorage.setItem("satvic_token", this.token)

        console.log("[v0] Registration successful for:", email)

        this.showSuccess("registerSuccess", "registerSuccessText", "Account created successfully! Welcome to Satvic.")
        this.hideError("registerError")

        this.showAuthenticatedUI()

        setTimeout(() => {
          this.showSection("onboarding")
        }, 2000)
      }
    } catch (error) {
      console.log("[v0] Registration error:", error.message)
      this.showError("registerError", "registerErrorText", error.message || "Registration failed. Please try again.")
    } finally {
      this.setLoading("registerBtn", "registerBtnText", "registerSpinner", false, "Create Account")
    }
  }

  logout() {
    console.log("[v0] Logging out user")

    this.token = null
    this.user = null
    localStorage.removeItem("satvic_token")

    this.hideAuthenticatedUI()

    this.showSection("landing")

    this.hideError("loginError")
    this.hideError("registerError")

    document.getElementById("loginForm").reset()
    document.getElementById("registerForm").reset()
  }

  async sendOnboardingMessage() {
    const input = document.getElementById("onboardingInput")
    const message = input.value.trim()

    if (!message) return

    this.addOnboardingMessage(message, "user")
    this.showTyping("onboardingChat")
    input.value = ""

    try {
      if (this.isProfileOnboarding) {
        await this.handleProfileOnboardingResponse(message)
      } else {
        const response = await this.makeRequest("/ai/onboarding", "POST", {
          message,
          step: this.onboardingStep,
          previousResponses: this.onboardingResponses,
        })

        if (response.data) {
          this.addOnboardingMessage(response.data.response, "ai", true)

          this.onboardingStep = response.data.step
          this.onboardingResponses[this.onboardingStep - 1] = message

          if (response.data.completed) {
            setTimeout(() => {
              this.completeOnboarding()
            }, 2000)
          }
          this.updateOnboardingProgress()
        }
      }
    } catch (error) {
      console.log("[v0] Onboarding error:", error.message)
      this.addOnboardingMessage("Sorry, I encountered an error. Please try again.", "ai")
    } finally {
      this.hideTyping("onboardingChat")
    }
  }

  addOnboardingMessage(message, sender, isHtml = false) {
    const chat = document.getElementById("onboardingChat")
    const messageDiv = document.createElement("div")
    messageDiv.className = `flex items-start mb-4 chat-message ${sender === "user" ? "justify-end" : ""}`

    if (sender === "user") {
      messageDiv.innerHTML = `
                <div class="bg-green-600 text-white p-4 rounded-lg shadow-sm max-w-md">
                    <p>${message}</p>
                </div>
                <div class="bg-green-600 p-3 rounded-full ml-4">
                    <i class="fas fa-user text-white"></i>
                </div>
            `
    } else {
      const bubble = document.createElement("div")
      bubble.className = "bg-white p-4 rounded-lg shadow-sm max-w-md"
      if (isHtml) {
        bubble.innerHTML = message
      } else {
        bubble.innerHTML = `<p class="text-gray-800">${message}</p>`
      }
      messageDiv.innerHTML = `
                <div class="bg-green-100 p-3 rounded-full mr-4">
                    <i class="fas fa-robot text-green-600"></i>
                </div>
            `
      messageDiv.appendChild(bubble)
    }

    chat.appendChild(messageDiv)
    chat.scrollTop = chat.scrollHeight
  }

  async completeOnboarding() {
    try {
      await this.makeRequest("/users/profile", "PUT", { onboarding_completed: true })

      this.user.onboarding_completed = true
      this.showSection("dashboard")
      this.isProfileOnboarding = false
      this.onboardingQuestions = []
      this.currentQuestionIndex = 0
      this.totalOnboardingSteps = 0
    } catch (error) {
      console.log("[v0] Error completing onboarding:", error.message)
    }
  }

  async sendChatMessage() {
    const input = document.getElementById("chatInput")
    const message = input.value.trim()

    if (!message) return

    this.addChatMessage(message, "user")
    this.showTyping("chatContainer")
    input.value = ""

    try {
      const response = await this.makeRequest("/ai/chat", "POST", {
        message,
      })

      if (response.data) {
        this.addChatMessage(response.data.response, "ai", true)
      }
    } catch (error) {
      console.log("[v0] Chat error:", error.message)
      this.addChatMessage("Sorry, I encountered an error. Please try again.", "ai")
    }
    finally {
      this.hideTyping("chatContainer")
    }
  }

  addChatMessage(message, sender, isHtml = false) {
    const chat = document.getElementById("chatContainer")
    const messageDiv = document.createElement("div")
    messageDiv.className = `flex items-start mb-4 chat-message ${sender === "user" ? "justify-end" : ""}`

    if (sender === "user") {
      messageDiv.innerHTML = `
                <div class="bg-green-600 text-white p-4 rounded-lg shadow-sm max-w-md">
                    <p>${message}</p>
                </div>
                <div class="bg-green-600 p-3 rounded-full ml-4">
                    <i class="fas fa-user text-white"></i>
                </div>
            `
    } else {
      const bubble = document.createElement("div")
      bubble.className = "bg-white p-4 rounded-lg shadow-sm max-w-md"
      if (isHtml) {
        bubble.innerHTML = message
      } else {
        bubble.innerHTML = `<p class="text-gray-800">${message}</p>`
      }
      messageDiv.innerHTML = `
                <div class="bg-green-100 p-3 rounded-full mr-4">
                    <i class="fas fa-robot text-green-600"></i>
                </div>
            `
      messageDiv.appendChild(bubble)
    }

    chat.appendChild(messageDiv)
    chat.scrollTop = chat.scrollHeight
  }

  showTyping(containerId) {
    const container = document.getElementById(containerId)
    if (!container) return
    const typingDiv = document.createElement("div")
    typingDiv.id = `${containerId}-typing`
    typingDiv.className = "flex items-start mb-4 chat-message"
    typingDiv.innerHTML = `
      <div class="bg-green-100 p-3 rounded-full mr-4">
        <i class="fas fa-robot text-green-600"></i>
      </div>
      <div class="bg-white p-4 rounded-lg shadow-sm max-w-md">
        <p class="text-gray-400"><i class="fas fa-ellipsis-h animate-pulse"></i> typing...</p>
      </div>
    `
    container.appendChild(typingDiv)
    container.scrollTop = container.scrollHeight
  }

  hideTyping(containerId) {
    const typingDiv = document.getElementById(`${containerId}-typing`)
    if (typingDiv && typingDiv.parentNode) {
      typingDiv.parentNode.removeChild(typingDiv)
    }
  }

  async generateMealPlan() {
    const period = document.getElementById("mealPlanPeriod").value
    const focus = document.getElementById("mealPlanFocus").value

    const btn = document.getElementById("generateMealPlan")
    const originalText = btn.innerHTML
    btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Generating...'
    btn.disabled = true

    try {
      const response = await this.makeRequest("/meal-plans/generate", "POST", {
        period,
        focus,
      })

      if (response.data && response.data.mealPlan) {
        this.displayMealPlan(response.data.mealPlan)
        const container = document.getElementById("generatedMealPlan")
        const content = document.getElementById("mealPlanContent")
        if (container && content) {
          container.classList.remove("hidden")
          // Also render a simple HTML list for readability
          const days = response.data.mealPlan.days || []
          content.innerHTML = days
            .map((d) => `
              <div class="mb-6">
                <h3 class="text-xl font-semibold text-green-700 mb-2">${d.date}</h3>
                <ul class="list-disc ml-5 text-gray-700">
                  <li><strong>Breakfast:</strong> ${d.breakfast?.name || "TBD"} - ${d.breakfast?.description || ""}</li>
                  <li><strong>Lunch:</strong> ${d.lunch?.name || "TBD"} - ${d.lunch?.description || ""}</li>
                  <li><strong>Dinner:</strong> ${d.dinner?.name || "TBD"} - ${d.dinner?.description || ""}</li>
                </ul>
              </div>
            `)
            .join("")
        }
      }
    } catch (error) {
      console.log("[v0] Meal plan generation error:", error.message)
      alert("Failed to generate meal plan. Please try again.")
    } finally {
      btn.innerHTML = originalText
      btn.disabled = false
    }
  }

  displayMealPlan(mealPlan) {
    const container = document.getElementById("mealPlanResults")
    if (!container) return
    const days = mealPlan.days || []
    if (days.length === 0) {
      container.innerHTML = '<p class="text-gray-500">No plan generated.</p>'
      return
    }
    container.innerHTML = days
      .map(
        (d) => `
      <div class="border border-gray-200 rounded-xl p-4">
        <h3 class="text-lg font-semibold text-green-700 mb-3">${d.date}</h3>
        ${["breakfast", "lunch", "dinner"]
          .map((meal) => {
            const m = d[meal] || {}
            return `
            <div class="mb-3">
              <h4 class="font-medium text-gray-800 capitalize">${meal}</h4>
              <p class="text-gray-600 text-sm">${m.name || "TBD"} - ${m.description || ""}</p>
            </div>`
          })
          .join("")}
      </div>`,
      )
      .join("")
  }

  async searchRecipes() {
    const search = document.getElementById("recipeSearch").value
    const dosha = document.getElementById("doshaFilter").value
    const mealType = document.getElementById("mealTypeFilter").value
    const cookingTime = document.getElementById("cookingTimeFilter").value

    try {
      const params = new URLSearchParams()
      if (search) params.append("search", search)
      if (dosha) params.append("dosha", dosha)
      if (mealType) params.append("meal_type", mealType)
      if (cookingTime) params.append("cooking_time", cookingTime)

      let response
      if (search) {
        response = await this.makeRequest(`/recipes/ai?${params.toString()}`, "GET")
      } else {
        response = await this.makeRequest(`/recipes?${params.toString()}`, "GET")
      }

      if (response.data) {
        this.displayRecipes(response.data.recipes)
      }
    } catch (error) {
      console.log("[v0] Recipe search error:", error.message)
      // Fallback to DB if AI fails
      try {
        const params = new URLSearchParams()
        if (search) params.append("search", search)
        if (dosha) params.append("dosha", dosha)
        if (mealType) params.append("meal_type", mealType)
        if (cookingTime) params.append("cooking_time", cookingTime)
        const resp = await this.makeRequest(`/recipes?${params.toString()}`, "GET")
        if (resp.data) this.displayRecipes(resp.data.recipes)
      } catch (_) {}
    }
  }

  async loadFeaturedRecipes() {
    try {
      const response = await this.makeRequest("/recipes?limit=6", "GET")

      if (response.data && response.data.recipes) {
        this.displayRecipes(response.data.recipes, "featuredRecipes")
      }
    } catch (error) {
      console.log("[v0] Error loading featured recipes:", error.message)
    }
  }

  displayRecipes(recipes, containerId = "featuredRecipes") {
    const container = document.getElementById(containerId)
    if (!container) return

    container.innerHTML = ""

    if (recipes.length === 0) {
      container.innerHTML =
        '<p class="text-gray-500 text-center col-span-full">No recipes found matching your criteria.</p>'
      return
    }

    recipes.forEach((recipe) => {
      const recipeCard = document.createElement("div")
      recipeCard.className = "bg-white rounded-xl shadow-md overflow-hidden hover:shadow-lg transition duration-200"
      const ingredients = Array.isArray(recipe.ingredients) ? recipe.ingredients : []
      const instructions = Array.isArray(recipe.instructions) ? recipe.instructions : []
      recipeCard.innerHTML = `
        <div class="h-48 bg-gradient-to-br from-green-100 to-green-200 flex items-center justify-center">
          <i class="fas fa-utensils text-green-600 text-4xl"></i>
        </div>
        <div class="p-6">
          <h3 class="text-lg font-semibold text-gray-800 mb-2">${recipe.name || "Healthy Recipe"}</h3>
          <p class="text-gray-600 text-sm mb-4">${recipe.description || "A nourishing recipe for balanced nutrition."}</p>
          <div class="flex items-center justify-between mb-4">
            <span class="text-sm text-green-600 font-medium">${recipe.meal_type || "Any meal"}</span>
            <span class="text-sm text-gray-500">${recipe.cooking_time || 30} mins</span>
          </div>
          ${ingredients.length ? `<h4 class="font-medium text-gray-800 mb-1">Ingredients</h4>
            <ul class="list-disc ml-5 text-sm text-gray-700 mb-3">${ingredients
              .slice(0, 8)
              .map((i) => `<li>${i}</li>`) 
              .join("")}</ul>` : ""}
          ${instructions.length ? `<h4 class="font-medium text-gray-800 mb-1">Steps</h4>
            <ol class="list-decimal ml-5 text-sm text-gray-700">${instructions
              .slice(0, 6)
              .map((s) => `<li class="mb-1">${s}</li>`) 
              .join("")}</ol>` : ""}
        </div>
      `
      container.appendChild(recipeCard)
    })
  }

  showSection(sectionName) {
    console.log("[v0] Showing section:", sectionName)

    document.querySelectorAll("main section").forEach((section) => {
      section.classList.add("section-hidden")
    })

    const targetSection = document.getElementById(sectionName)
    if (targetSection) {
      targetSection.classList.remove("section-hidden")
      this.currentSection = sectionName

      if (sectionName === "progress") {
        this.loadProgressData()
      } else if (sectionName === "notifications") {
        this.loadNotifications()
      } else if (sectionName === "profile") {
        this.loadProfile()
      } else if (sectionName === "onboarding") {
        this.updateOnboardingProgress()
      }
    }
  }

  updateOnboardingProgress() {
    const dotsContainer = document.getElementById("onboardingProgressDots")
    const stepText = document.getElementById("onboardingProgressText")

    if (!dotsContainer || !stepText) return

    const total = this.totalOnboardingSteps || 0
    const current = Math.min(this.currentQuestionIndex + 1, total)

    // Render dots dynamically
    dotsContainer.innerHTML = ""
    for (let i = 0; i < total; i++) {
      const dot = document.createElement("div")
      dot.className = i === this.currentQuestionIndex ? "w-3 h-3 bg-green-600 rounded-full" : "w-3 h-3 bg-gray-300 rounded-full"
      dotsContainer.appendChild(dot)
    }

    if (total === 0) {
      stepText.textContent = "Preparing your quick profile..."
    } else {
      stepText.textContent = `Step ${current} of ${total}: Quick profile setup`
    }
  }

  showError(containerId, textId, message) {
    const container = document.getElementById(containerId)
    const textElement = document.getElementById(textId)

    if (container && textElement) {
      textElement.textContent = message
      container.classList.remove("hidden")
    }
  }

  hideError(containerId) {
    const container = document.getElementById(containerId)
    if (container) {
      container.classList.add("hidden")
    }
  }

  showSuccess(containerId, textId, message) {
    const container = document.getElementById(containerId)
    const textElement = document.getElementById(textId)

    if (container && textElement) {
      textElement.textContent = message
      container.classList.remove("hidden")
    }
  }

  setLoading(btnId, textId, spinnerId, isLoading, text) {
    const btn = document.getElementById(btnId)
    const textElement = document.getElementById(textId)
    const spinner = document.getElementById(spinnerId)

    if (btn && textElement && spinner) {
      btn.disabled = isLoading
      textElement.textContent = text

      if (isLoading) {
        spinner.classList.remove("hidden")
      } else {
        spinner.classList.add("hidden")
      }
    }
  }

  async makeRequest(endpoint, method = "GET", data = null) {
    const url = `${this.baseURL}${endpoint}`
    const options = {
      method,
      headers: {
        "Content-Type": "application/json",
      },
    }

    if (this.token) {
      options.headers["Authorization"] = `Bearer ${this.token}`
    }

    if (data && (method === "POST" || method === "PUT")) {
      options.body = JSON.stringify(data)
    }

    console.log("[v0] Making request:", method, url)

    const response = await fetch(url, options)
    const result = await response.json()

    if (!response.ok) {
      throw new Error(result.error || `HTTP ${response.status}`)
    }

    // Normalize to unwrap API envelope so callers can use response.data directly
    const payload = result && typeof result === "object" && "data" in result ? result.data : result
    return { data: payload, message: result.message, status: response.status, ok: true }
  }

  setupHamburgerMenu() {
    const hamburgerBtn = document.getElementById("hamburgerBtn")
    const hamburgerMenu = document.getElementById("hamburgerMenu")
    const menuOverlay = document.getElementById("menuOverlay")
    const closeMenuBtn = document.getElementById("closeMenuBtn")

    hamburgerBtn.addEventListener("click", () => {
      hamburgerMenu.classList.add("open")
      menuOverlay.classList.add("open")
    })

    const closeMenu = () => {
      hamburgerMenu.classList.remove("open")
      menuOverlay.classList.remove("open")
    }

    closeMenuBtn.addEventListener("click", closeMenu)
    menuOverlay.addEventListener("click", closeMenu)

    document.querySelectorAll(".nav-link").forEach((link) => {
      link.addEventListener("click", (e) => {
        e.preventDefault()
        const target = link.getAttribute("data-target")
        this.showSection(target)

        document.querySelectorAll(".nav-link").forEach((l) => l.classList.remove("active-tab"))
        link.classList.add("active-tab")

        closeMenu()
      })
    })

    document.getElementById("profileBtn").addEventListener("click", () => {
      this.showSection("profile")
      this.loadProfile()
      closeMenu()
    })

    document.getElementById("notificationsBtn").addEventListener("click", () => {
      this.showSection("notifications")
      this.loadNotifications()
      closeMenu()
    })
  }

  setupProgressTracking() {
    const checkinForm = document.getElementById("checkinForm")
    if (checkinForm) {
      checkinForm.addEventListener("submit", (e) => this.handleCheckin(e))
    }
  }

  setupNotifications() {
    const reminderForm = document.getElementById("reminderForm")
    if (reminderForm) {
      reminderForm.addEventListener("submit", (e) => this.handleCreateReminder(e))
    }
  }

  setupProfile() {
    const profileForm = document.getElementById("profileForm")
    if (profileForm) {
      profileForm.addEventListener("submit", (e) => this.handleUpdateProfile(e))
    }
  }

  async loadDashboardData() {
    try {
      const progressResponse = await this.makeRequest("/progress/analytics?days=7", "GET")

      if (progressResponse.data && progressResponse.data.analytics) {
        const analytics = progressResponse.data.analytics

        document.getElementById("currentWeight").textContent = analytics.avg_weight
          ? `${analytics.avg_weight.toFixed(1)} kg`
          : "--"
        document.getElementById("energyLevel").textContent = analytics.avg_energy
          ? analytics.avg_energy.toFixed(1)
          : "--"
        document.getElementById("wellnessScore").textContent = analytics.avg_mood ? analytics.avg_mood.toFixed(1) : "--"

        if (analytics.avg_energy) {
          const energyPercent = (analytics.avg_energy / 10) * 100
          document.getElementById("energyProgress").style.width = `${energyPercent}%`
          document.getElementById("energyStatus").textContent = `${analytics.avg_energy.toFixed(1)}/10`
        }
      }

      const recentResponse = await this.makeRequest("/progress?limit=10", "GET")
      if (recentResponse.data) {
        const todayCheckins = Array.isArray(recentResponse.data.progress)
          ? recentResponse.data.progress.filter((p) => {
              const checkDate = new Date(p.date).toDateString()
              const today = new Date().toDateString()
              return checkDate === today
            }).length
          : 0

        const targetMeals = 3
        const completed = Math.min(todayCheckins, targetMeals)
        document.getElementById("mealsToday").textContent = `${completed}/${targetMeals}`
        document.getElementById("mealsProgress").style.width = `${(completed / targetMeals) * 100}%`
        document.getElementById("mealsStatus").textContent =
          completed > 0 ? `${completed} of ${targetMeals} meals logged` : "No meals logged today"
      }
    } catch (error) {
      console.log("[v0] Error loading dashboard data:", error.message)
    }
  }

  async handleCheckin(e) {
    e.preventDefault()

    const weight = document.getElementById("checkinWeight").value
    const energy = document.getElementById("checkinEnergy").value
    const mood = document.getElementById("checkinMood").value
    const sleep = document.getElementById("checkinSleep").value
    const water = document.getElementById("checkinWater").value || 0
    const exercise = document.getElementById("checkinExercise").value || 0
    const notes = document.getElementById("checkinNotes").value

    if (!weight || !energy || !mood || !sleep) {
      alert("Please fill in all required fields")
      return
    }

    const btn = document.getElementById("checkinBtn")
    const originalText = btn.innerHTML
    btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Saving...'
    btn.disabled = true

    try {
      const response = await this.makeRequest("/progress", "POST", {
        date: new Date().toISOString(),
        weight: Number.parseFloat(weight),
        energy_level: Number.parseInt(energy),
        mood: Number.parseInt(mood),
        sleep_quality: Number.parseInt(sleep),
        water_intake: Number.parseInt(water),
        exercise_minutes: Number.parseInt(exercise),
        notes: notes,
      })

      if (response.data) {
        alert("Check-in saved successfully!")
        document.getElementById("checkinForm").reset()
        this.loadProgressData()
        this.loadDashboardData()
      }
    } catch (error) {
      console.log("[v0] Check-in error:", error.message)
      alert("Failed to save check-in. Please try again.")
    } finally {
      btn.innerHTML = originalText
      btn.disabled = false
    }
  }

  async loadProgressData() {
    try {
      const analyticsResponse = await this.makeRequest("/progress/analytics?days=30", "GET")
      if (analyticsResponse.data && analyticsResponse.data.analytics) {
        const analytics = analyticsResponse.data.analytics

        document.getElementById("totalCheckins").textContent = analytics.total_entries || 0
        document.getElementById("avgWeight").textContent = analytics.avg_weight
          ? `${analytics.avg_weight.toFixed(1)} kg`
          : "--"
        document.getElementById("avgEnergy").textContent = analytics.avg_energy ? analytics.avg_energy.toFixed(1) : "--"
        document.getElementById("avgMood").textContent = analytics.avg_mood ? analytics.avg_mood.toFixed(1) : "--"

        if (analytics.total_entries > 1) {
          document.getElementById("weightChange").textContent = "Tracking progress"
        }
      }

      const progressResponse = await this.makeRequest("/progress?limit=10", "GET")
      if (progressResponse.data) {
        this.displayRecentCheckins(progressResponse.data.progress)
      }
    } catch (error) {
      console.log("[v0] Error loading progress data:", error.message)
    }
  }

  displayRecentCheckins(checkins) {
    const container = document.getElementById("recentCheckins")
    if (!container) return

    if (checkins.length === 0) {
      container.innerHTML =
        '<p class="text-gray-500 text-center py-8">No check-ins yet. Add your first check-in above!</p>'
      return
    }

    container.innerHTML = checkins
      .map(
        (checkin) => `
      <div class="border border-gray-200 rounded-lg p-4">
        <div class="flex justify-between items-start mb-2">
          <h4 class="font-semibold text-gray-800">${new Date(checkin.date).toLocaleDateString()}</h4>
          <span class="text-sm text-gray-500">${new Date(checkin.date).toLocaleDateString()}</span>
        </div>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <span class="text-gray-600">Weight:</span>
            <span class="font-medium ml-1">${checkin.weight} kg</span>
          </div>
          <div>
            <span class="text-gray-600">Energy:</span>
            <span class="font-medium ml-1">${checkin.energy_level}/10</span>
          </div>
          <div>
            <span class="text-gray-600">Mood:</span>
            <span class="font-medium ml-1">${checkin.mood}/10</span>
          </div>
          <div>
            <span class="text-gray-600">Sleep:</span>
            <span class="font-medium ml-1">${checkin.sleep_quality}/10</span>
          </div>
        </div>
        ${checkin.notes ? `<p class="text-gray-600 text-sm mt-2">${checkin.notes}</p>` : ""}
      </div>
    `,
      )
      .join("")
  }

  async handleCreateReminder(e) {
    e.preventDefault()

    const title = document.getElementById("reminderTitle").value
    const dateTime = document.getElementById("reminderDateTime").value
    const message = document.getElementById("reminderMessage").value

    if (!title || !dateTime || !message) {
      alert("Please fill in all fields")
      return
    }

    try {
      const response = await this.makeRequest("/notifications", "POST", {
        title: title,
        message: message,
        scheduled_for: new Date(dateTime).toISOString(),
        type: "reminder",
      })

      if (response.data) {
        alert("Reminder created successfully!")
        document.getElementById("reminderForm").reset()
        this.loadNotifications()
      }
    } catch (error) {
      console.log("[v0] Reminder creation error:", error.message)
      alert("Failed to create reminder. Please try again.")
    }
  }

  async loadNotifications() {
    try {
      const response = await this.makeRequest("/notifications", "GET")
      if (response.data) {
        this.displayNotifications(response.data.notifications)

        const unreadCount = response.data.notifications.filter((n) => !n.read).length
        const badge = document.getElementById("notificationBadge")
        if (unreadCount > 0) {
          badge.textContent = unreadCount
          badge.classList.remove("hidden")
        } else {
          badge.classList.add("hidden")
        }
      }
    } catch (error) {
      console.log("[v0] Error loading notifications:", error.message)
    }
  }

  displayNotifications(notifications) {
    const container = document.getElementById("notificationsList")
    if (!container) return

    if (notifications.length === 0) {
      container.innerHTML = '<p class="text-gray-500 text-center py-8">No notifications yet.</p>'
      return
    }

    container.innerHTML = notifications
      .map(
        (notification) => `
      <div class="border border-gray-200 rounded-lg p-4 ${notification.read ? "bg-gray-50" : "bg-white"}">
        <div class="flex justify-between items-start mb-2">
          <h4 class="font-semibold text-gray-800">${notification.title}</h4>
          <span class="text-sm text-gray-500">${new Date(notification.scheduled_for).toLocaleDateString()}</span>
        </div>
        <p class="text-gray-600 text-sm">${notification.message}</p>
        <div class="flex justify-between items-center mt-2">
          <span class="text-xs text-gray-400">${notification.type}</span>
          ${!notification.read ? '<span class="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">New</span>' : ""}
        </div>
      </div>
    `,
      )
      .join("")
  }

  async loadProfile() {
    try {
      const response = await this.makeRequest("/users/profile", "GET")
      if (response.data && response.data.user) {
        const user = response.data.user

        document.getElementById("profileName").value = user.name || ""
        document.getElementById("profileEmail").value = user.email || ""

        if (user.profile) {
          document.getElementById("profileAge").value = user.profile.age || ""
          document.getElementById("profileHeight").value = user.profile.height || ""
          document.getElementById("profileActivity").value = user.profile.activity_level || ""

          const goalsSelect = document.getElementById("profileGoals")
          if (user.profile.health_goals && Array.isArray(user.profile.health_goals)) {
            Array.from(goalsSelect.options).forEach((option) => {
              option.selected = user.profile.health_goals.includes(option.value)
            })
          }
        }
      }
    } catch (error) {
      console.log("[v0] Error loading profile:", error.message)
    }
  }

  async handleUpdateProfile(e) {
    e.preventDefault()

    const age = document.getElementById("profileAge").value
    const height = document.getElementById("profileHeight").value
    const activity = document.getElementById("profileActivity").value
    const goalsSelect = document.getElementById("profileGoals")
    const healthGoals = Array.from(goalsSelect.selectedOptions).map((option) => option.value)

    try {
      const response = await this.makeRequest("/users/profile", "PUT", {
        profile: {
          age: age ? Number.parseInt(age) : null,
          height: height ? Number.parseInt(height) : null,
          activity_level: activity || null,
          health_goals: healthGoals,
        },
      })

      if (response.message) {
        alert("Profile updated successfully!")
      }
    } catch (error) {
      console.log("[v0] Profile update error:", error.message)
      alert("Failed to update profile. Please try again.")
    }
  }
}

document.addEventListener("DOMContentLoaded", () => {
  console.log("[v0] DOM loaded, initializing Satvic App")
  window.satvicApp = new SatvicApp()
})
