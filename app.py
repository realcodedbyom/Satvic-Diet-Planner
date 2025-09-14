from flask import Flask, request, jsonify, render_template, send_from_directory
from flask_cors import CORS
from flask_jwt_extended import JWTManager, create_access_token, jwt_required, get_jwt_identity
from werkzeug.security import generate_password_hash, check_password_hash
import bcrypt
from pymongo import MongoClient
from bson import ObjectId
import google.generativeai as genai
import os
from datetime import datetime, timedelta, timezone
import re
import json
import logging
from dotenv import load_dotenv
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize Flask app
app = Flask(__name__, template_folder='templates', static_folder='templates/static')

# Configuration
app.config['JWT_SECRET_KEY'] = os.getenv('JWT_SECRET', 'ff3e4e7278c068f2bb8543a0cd01368b')
app.config['JWT_ACCESS_TOKEN_EXPIRES'] = timedelta(days=7)

# Initialize extensions
jwt = JWTManager(app)
CORS(app, origins=["*"])

# MongoDB connection
try:
    client = MongoClient(os.getenv('MONGODB_URI', 'mongodb+srv://om3479781:omkumar@satvikdiet.shu7as.mongodb.net/?retryWrites=true&w=majority&appName=satvikdiet'))
    db = client.satvic_diet_planner
    logger.info("✅ Connected to MongoDB successfully")
except Exception as e:
    logger.error(f"❌ MongoDB connection failed: {e}")
    raise

# Configure Gemini AI
try:
    api_key = os.getenv('GEMINI_API_KEY')
    if not api_key or api_key == 'your_gemini_api_key_here':
        logger.error("❌ GEMINI_API_KEY not properly configured")
        model = None
    else:
        # Use the newer client-based approach
        import google.generativeai as genai
        
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel('gemini-1.5-flash')
        
        # Test the connection
        test_response = model.generate_content("Hello")
        logger.info("✅ Gemini AI configured and tested successfully")
    
except Exception as e:
    logger.error(f"❌ Gemini AI configuration failed: {e}")
    model = None

# Helper functions
def serialize_doc(doc):
    """Convert MongoDB document to JSON serializable format"""
    if doc is None:
        return None
    if isinstance(doc, list):
        return [serialize_doc(item) for item in doc]
    if isinstance(doc, dict):
        result = {}
        for key, value in doc.items():
            if key == '_id':
                result['id'] = str(value)
            elif isinstance(value, ObjectId):
                result[key] = str(value)
            elif isinstance(value, datetime):
                result[key] = value.isoformat()
            elif isinstance(value, dict):
                result[key] = serialize_doc(value)
            elif isinstance(value, list):
                result[key] = serialize_doc(value)
            else:
                result[key] = value
        return result
    return doc

def get_user_by_id(user_id):
    """Get user by ID from database"""
    try:
        user = db.users.find_one({'_id': ObjectId(user_id)})
        return serialize_doc(user)
    except Exception as e:
        logger.error(f"Error getting user: {e}")
        return None

def create_response(data=None, message=None, error=None, status=200):
    """Create standardized API response"""
    response = {}
    if data is not None:
        response['data'] = data
    if message:
        response['message'] = message
    if error:
        response['error'] = error
        status = status if status >= 400 else 400
    
    return jsonify(response), status

# Routes

@app.route('/')
def serve_index():
    """Serve the main HTML template"""
    return render_template('index.html')

@app.route('/static/<path:filename>')
def serve_static(filename):
    """Serve static files"""
    return send_from_directory('templates/static', filename)

@app.route('/templates/static/<path:filename>')
def serve_static_legacy(filename):
    """Legacy static path compatibility for /templates/static/*"""
    return send_from_directory('templates/static', filename)

@app.route('/uploads/<path:filename>')
def serve_uploads(filename):
    """Serve uploaded files"""
    return send_from_directory('uploads', filename)

@app.route('/api/health')
def health_check():
    """Health check endpoint"""
    return create_response(data={
        'status': 'OK',
        'timestamp': datetime.now(timezone.utc).isoformat(),
        'service': 'Satvic Diet Planner Flask API',
        'version': '2.0'
    })

# Authentication Routes
@app.route('/api/auth/register', methods=['POST'])
def register():
    """User registration with enhanced validation"""
    try:
        data = request.get_json()
        
        # Validate required fields
        required_fields = ['name', 'email', 'password']
        if not data or not all(k in data for k in required_fields):
            return create_response(error='Missing required fields: name, email, password', status=400)
        
        # Validate email format
        email = data['email'].lower().strip()
        if '@' not in email or '.' not in email:
            return create_response(error='Invalid email format', status=400)
        
        # Validate password strength
        password = data['password']
        if len(password) < 6:
            return create_response(error='Password must be at least 6 characters long', status=400)
        
        # Check if user already exists
        if db.users.find_one({'email': email}):
            return create_response(error='User already exists with this email', status=409)
        
        # Create new user
        user_data = {
            'name': data['name'].strip(),
            'email': email,
            # Store both werkzeug and bcrypt hashes for compatibility with existing Node users
            'password': generate_password_hash(password),
            'password_hash': bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt(rounds=12)).decode('utf-8'),
            'created_at': datetime.now(timezone.utc),
            'onboarding_completed': False,
            'profile': {
                'age': None,
                'weight': None,
                'height': None,
                'activity_level': None,
                'dietary_preferences': [],
                'health_goals': []
            }
        }
        
        result = db.users.insert_one(user_data)
        user_id = str(result.inserted_id)
        
        # Create access token
        access_token = create_access_token(identity=user_id)
        
        # Get user data without password
        user = get_user_by_id(user_id)
        if user:
            user.pop('password', None)
        
        logger.info(f"✅ New user registered: {email}")
        return create_response(data={
            'token': access_token,
            'user': user
        }, message='Account created successfully', status=201)
        
    except Exception as e:
        logger.error(f"❌ Registration error: {e}")
        return create_response(error='Registration failed. Please try again.', status=500)

@app.route('/api/auth/login', methods=['POST'])
def login():
    """User login with enhanced security"""
    try:
        data = request.get_json()
        
        if not data or not all(k in data for k in ('email', 'password')):
            return create_response(error='Email and password are required', status=400)
        
        email = data['email'].lower().strip()
        password = data['password']
        
        # Find user
        user = db.users.find_one({'email': email})
        if not user:
            return create_response(error='Invalid email or password', status=401)

        # Support both werkzeug and bcrypt password hashes
        valid_password = False
        try:
            if 'password' in user and isinstance(user['password'], str):
                valid_password = check_password_hash(user['password'], password)
        except Exception:
            valid_password = False

        if not valid_password and 'password_hash' in user and isinstance(user['password_hash'], str):
            try:
                valid_password = bcrypt.checkpw(password.encode('utf-8'), user['password_hash'].encode('utf-8'))
            except Exception:
                valid_password = False

        if not valid_password:
            return create_response(error='Invalid email or password', status=401)
        
        # Create access token
        access_token = create_access_token(identity=str(user['_id']))
        
        # Update last login
        db.users.update_one(
            {'_id': user['_id']},
            {'$set': {'last_login': datetime.now(timezone.utc)}}
        )
        
        # Get user data without password
        user_data = serialize_doc(user)
        user_data.pop('password', None)
        
        logger.info(f"✅ User logged in: {email}")
        return create_response(data={
            'token': access_token,
            'user': user_data
        }, message='Login successful')
        
    except Exception as e:
        logger.error(f"❌ Login error: {e}")
        return create_response(error='Login failed. Please try again.', status=500)

@app.route('/api/auth/verify', methods=['GET'])
@jwt_required()
def verify_token():
    """Verify JWT token and return user data"""
    try:
        user_id = get_jwt_identity()
        user = get_user_by_id(user_id)
        
        if not user:
            return create_response(error='User not found', status=404)
        
        user.pop('password', None)
        return create_response(data={'user': user})
        
    except Exception as e:
        logger.error(f"❌ Token verification error: {e}")
        return create_response(error='Token verification failed', status=401)

# User Profile Routes
@app.route('/api/users/profile', methods=['GET'])
@jwt_required()
def get_profile():
    """Get user profile"""
    try:
        user_id = get_jwt_identity()
        user = get_user_by_id(user_id)
        
        if not user:
            return create_response(error='User not found', status=404)
        
        user.pop('password', None)
        return create_response(data={'user': user})
        
    except Exception as e:
        logger.error(f"❌ Profile retrieval error: {e}")
        return create_response(error='Failed to retrieve profile', status=500)

@app.route('/api/users/profile', methods=['PUT'])
@jwt_required()
def update_profile():
    """Update user profile"""
    try:
        user_id = get_jwt_identity()
        data = request.get_json()
        
        # Prepare update data
        update_data = {'updated_at': datetime.now(timezone.utc)}
        
        # Allow specific fields to be updated
        allowed_fields = ['onboarding_completed', 'profile']
        for field in allowed_fields:
            if field in data:
                update_data[field] = data[field]
        
        # Update user profile
        result = db.users.update_one(
            {'_id': ObjectId(user_id)},
            {'$set': update_data}
        )
        
        if result.modified_count == 0:
            return create_response(error='No changes made to profile', status=400)
        
        logger.info(f"✅ Profile updated for user: {user_id}")
        return create_response(message='Profile updated successfully')
        
    except Exception as e:
        logger.error(f"❌ Profile update error: {e}")
        return create_response(error='Profile update failed', status=500)

# AI Routes

# Helper to strip markdown code fences returned by LLMs
def _strip_code_fences(text: str) -> str:
    if not isinstance(text, str):
        return ''
    s = text.strip()
    if s.startswith('```'):
        s = re.sub(r'^```[a-zA-Z0-9]*\s*', '', s)
        s = re.sub(r'\s*```$', '', s)
    return s.strip()

@app.route('/api/ai/onboarding', methods=['POST'])
@jwt_required()
def ai_onboarding():
    """Handle AI onboarding conversation"""
    try:
        if model is None:
            # Fallback basic plan
            fallback = {
                'period': 'week',
                'days': [
                    {
                        'date': datetime.now(timezone.utc).date().isoformat(),
                        'breakfast': {'name': 'Satvic Porridge', 'description': 'Warm oats with fruits and nuts'},
                        'lunch': {'name': 'Khichdi Bowl', 'description': 'Rice-lentil khichdi with veggies'},
                        'dinner': {'name': 'Moong Dal Soup', 'description': 'Light dal soup with salad'},
                    }
                ]
            }
            return create_response(data={'mealPlan': fallback}, message='Meal plan generated (fallback)')
            
        user_id = get_jwt_identity()
        data = request.get_json()
        
        message = data.get('message', '')
        step = data.get('step', 1)
        previous_responses = data.get('previousResponses', {})
        
        # Create context for Gemini
        context = f"""
        You are a knowledgeable nutrition assistant helping a user discover their dietary preferences and health goals.
        
        Current step: {step}/5
        User's message: {message}
        Previous responses: {json.dumps(previous_responses)}
        
        RESPONSE FORMAT (IMPORTANT):
        - Return valid HTML only (no markdown)
        - Use <p> paragraphs with proper spacing after periods
        - Use <ul> and <li> for bullet points
        - Keep under 120 words
        
        Provide warm, encouraging guidance and ask the next appropriate single question.
        """
        
        # Get AI response
        response = model.generate_content(context)
        ai_response = _strip_code_fences(response.text or '')
        if '<' not in ai_response and '>' not in ai_response:
            parts = [p.strip() for p in ai_response.split('\n\n') if p.strip()]
            ai_response = ''.join(f'<p>{p.replace("\n", "<br>")}</p>' for p in parts) or '<p></p>'
        
        # Determine next step
        next_step = min(step + 1, 6)
        
        logger.info(f"✅ AI onboarding step {step} completed for user: {user_id}")
        return create_response(data={
            'response': ai_response,
            'step': next_step,
            'completed': next_step > 5
        })
        
    except Exception as e:
        logger.error(f"❌ AI onboarding error: {e}")
        return create_response(error='AI processing failed. Please try again.', status=500)

@app.route('/api/ai/generate-meal-plan', methods=['POST'])
@jwt_required()
def generate_meal_plan():
    """Generate automated meal plan using Gemini AI"""
    try:
        if model is None:
            return create_response(error='AI service is currently unavailable. Please check your API key configuration.', status=503)
            
        user_id = get_jwt_identity()
        data = request.get_json()
        
        period = data.get('period', 'week')
        focus = data.get('focus', 'balanced')
        
        # Get user profile for personalization
        user = get_user_by_id(user_id)
        profile = user.get('profile', {}) if user else {}
        
        # Create context for meal plan generation
        context = f"""
        Generate a detailed {period} meal plan focused on {focus} nutrition.
        
        User Profile:
        - Age: {profile.get('age', 'Not specified')}
        - Weight: {profile.get('weight', 'Not specified')} kg
        - Height: {profile.get('height', 'Not specified')} cm
        - Activity Level: {profile.get('activity_level', 'Not specified')}
        - Dietary Preferences: {', '.join(profile.get('dietary_preferences', []))}
        - Health Goals: {', '.join(profile.get('health_goals', []))}
        
        Requirements:
        - Create a complete {period} meal plan with breakfast, lunch, dinner, and 2 snacks per day
        - Focus on {focus} nutrition with whole foods and balanced macronutrients
        - Include specific recipe names, ingredients, and preparation methods
        - Provide nutritional benefits for each meal
        - Make it practical and easy to follow
        - Include variety and seasonal ingredients
        
        Format the response as a structured meal plan with clear days and meal times.
        """
        
        # Generate meal plan
        response = model.generate_content(context)
        meal_plan = response.text
        
        # Save meal plan to database
        meal_plan_data = {
            'user_id': ObjectId(user_id),
            'period': period,
            'focus': focus,
            'content': meal_plan,
            'generated_at': datetime.now(timezone.utc),
            'status': 'active'
        }
        
        result = db.meal_plans.insert_one(meal_plan_data)
        
        logger.info(f"✅ Meal plan generated for user: {user_id}")
        return create_response(data={
            'meal_plan': meal_plan,
            'id': str(result.inserted_id),
            'period': period,
            'focus': focus
        }, message='Meal plan generated successfully')
        
    except Exception as e:
        logger.error(f"❌ Meal plan generation error: {e}")
        return create_response(error='Meal plan generation failed. Please try again.', status=500)

# Legacy-compatible endpoint expected by the frontend
@app.route('/api/meal-plans/generate', methods=['POST'])
@jwt_required()
def generate_meal_plan_legacy():
    try:
        if model is None:
            return create_response(error='AI service is currently unavailable. Please check your API key configuration.', status=503)

        user_id = get_jwt_identity()
        data = request.get_json() or {}
        period = data.get('period', 'weekly')
        focus = data.get('focus', 'balance')

        # Fetch minimal user context (optional)
        user = get_user_by_id(user_id)
        profile = user.get('profile', {}) if user else {}

        prompt = (
            f"Create a {period} Satvic meal plan focused on {focus}.\n"
            f"User Profile: {json.dumps(profile)}\n\n"
            "Return ONLY valid JSON using this exact schema:\n"
            "{\n"
            '  "period": "daily|weekly|monthly",\n'
            '  "days": [\n'
            "    {\n"
            '      "date": "YYYY-MM-DD",\n'
            '      "breakfast": {"name": "...", "description": "..."},\n'
            '      "lunch": {"name": "...", "description": "..."},\n'
            '      "dinner": {"name": "...", "description": "..."}\n'
            "    }\n"
            "  ]\n"
            "}\n"
        )

        gen_response = model.generate_content(prompt)
        text = gen_response.text or ''

        # Strip code fences
        text = _strip_code_fences(text)

        try:
            parsed = json.loads(text)
        except Exception:
            # Fallback minimal daily plan if parsing fails
            parsed = {
                'period': period,
                'days': [
                    {
                        'date': datetime.now(timezone.utc).date().isoformat(),
                        'breakfast': {'name': 'Fruit Bowl', 'description': 'Seasonal fruits with seeds'},
                        'lunch': {'name': 'Vegetable Khichdi', 'description': 'Comforting one-pot meal'},
                        'dinner': {'name': 'Vegetable Soup', 'description': 'Light soup with steamed veggies'},
                    }
                ]
            }

        return create_response(data={'mealPlan': parsed}, message='Meal plan generated successfully')
    except Exception as e:
        logger.error(f"❌ Legacy meal plan generation error: {e}")
        return create_response(error='Error generating meal plan', status=500)

@app.route('/api/ai/generate-recipe', methods=['POST'])
@jwt_required()
def generate_recipe():
    """Generate a custom recipe using Gemini AI"""
    try:
        if model is None:
            return create_response(error='AI service is currently unavailable. Please check your API key configuration.', status=503)
            
        user_id = get_jwt_identity()
        data = request.get_json()
        
        meal_type = data.get('meal_type', 'any')
        ingredients = data.get('ingredients', [])
        dietary_restrictions = data.get('dietary_restrictions', [])
        cooking_time = data.get('cooking_time', 30)
        
        # Get user profile for personalization
        user = get_user_by_id(user_id)
        profile = user.get('profile', {}) if user else {}
        
        # Create context for recipe generation
        context = f"""
        Generate a detailed recipe based on the following requirements:
        
        Meal Type: {meal_type}
        Available Ingredients: {', '.join(ingredients) if ingredients else 'Any healthy ingredients'}
        Dietary Restrictions: {', '.join(dietary_restrictions) if dietary_restrictions else 'None'}
        Cooking Time: {cooking_time} minutes maximum
        
        User Preferences:
        - Dietary Preferences: {', '.join(profile.get('dietary_preferences', []))}
        - Health Goals: {', '.join(profile.get('health_goals', []))}
        
        Requirements:
        - Create a complete recipe with name, description, ingredients list, and step-by-step instructions
        - Include nutritional information and health benefits
        - Make it practical and achievable within the time limit
        - Focus on whole foods and balanced nutrition
        - Include serving size and preparation tips
        
        Format the response as a structured recipe with clear sections.
        """
        
        # Generate recipe
        response = model.generate_content(context)
        recipe_content = _strip_code_fences(response.text or '')
        
        # Save recipe to database
        recipe_data = {
            'user_id': ObjectId(user_id),
            'name': f"Custom {meal_type.title()} Recipe",
            'meal_type': meal_type,
            'cooking_time': cooking_time,
            'content': recipe_content,
            'ingredients': ingredients,
            'dietary_restrictions': dietary_restrictions,
            'generated_at': datetime.now(timezone.utc),
            'is_custom': True
        }
        
        result = db.recipes.insert_one(recipe_data)
        
        logger.info(f"✅ Custom recipe generated for user: {user_id}")
        return create_response(data={
            'recipe': recipe_content,
            'id': str(result.inserted_id),
            'meal_type': meal_type
        }, message='Recipe generated successfully')
        
    except Exception as e:
        logger.error(f"❌ Recipe generation error: {e}")
        return create_response(error='Recipe generation failed. Please try again.', status=500)

@app.route('/api/shopping/generate', methods=['POST'])
@jwt_required()
def generate_shopping_list():
    """Generate a shopping list from budget (₹) and cooking goal/plan."""
    try:
        data = request.get_json() or {}
        budget_inr = data.get('budget_inr')
        goal = (data.get('goal') or '').strip()
        if budget_inr is None or not isinstance(budget_inr, (int, float)) or budget_inr <= 0:
            return create_response(error='budget_inr must be a positive number', status=400)
        if not goal:
            return create_response(error='goal is required', status=400)
        items = []
        summary = {'budget_inr': int(budget_inr), 'estimated_cost_inr': None, 'under_budget': None, 'note': ''}
        if model is not None:
            schema = ('{"summary": {"budget_inr": number, "estimated_cost_inr": number, "under_budget": boolean, "note": string}, '
                      '"items": [{"name": string, "quantity": number, "unit": string, "approx_price_inr": number, "category": string, "priority": string}]}')
            prompt = ("You are a helpful Indian grocery shopping planner.\n"
                      f"Budget (INR): {int(budget_inr)}\n"
                      f"Cooking goal: {goal}\n\n"
                      "Plan practical items focusing on whole foods and typical Indian markets.\n"
                      "Prioritize essentials first, then optional items.\n\n"
                      "OUTPUT STRICTLY AS JSON ONLY (no markdown, no commentary) matching this schema: " + schema + "\n"
                      "- Use INR prices realistic for a mid-range Indian city.\n"
                      "- Keep 10-18 items max.\n"
                      "- Use units like kg, g, L, ml, pcs, pack.\n"
                      "- Category examples: produce, grains, dairy, spices, pantry, protein, other.\n"
                      "- priority must be one of: high, medium, low.\n")
            try:
                gen = model.generate_content(prompt)
                text = (gen.text or '').strip()
                if text.startswith('```'):
                    text = text.strip('`')
                    if text.startswith('json'):
                        text = text[4:]
                parsed = json.loads(text)
                items = parsed.get('items') if isinstance(parsed, dict) else []
                if not isinstance(items, list):
                    items = []
                summary_dict = parsed.get('summary') if isinstance(parsed, dict) else {}
                if isinstance(summary_dict, dict):
                    summary.update({
                        'estimated_cost_inr': summary_dict.get('estimated_cost_inr'),
                        'under_budget': summary_dict.get('under_budget'),
                        'note': summary_dict.get('note') or ''
                    })
            except Exception as e:
                logger.error(f"AI shopping generation failed: {e}")
        if not items:
            base_items = [
                { 'name': 'Atta (whole wheat flour)', 'quantity': 2, 'unit': 'kg', 'approx_price_inr': 120, 'category': 'grains', 'priority': 'high' },
                { 'name': 'Rice', 'quantity': 2, 'unit': 'kg', 'approx_price_inr': 180, 'category': 'grains', 'priority': 'high' },
                { 'name': 'Onion', 'quantity': 1, 'unit': 'kg', 'approx_price_inr': 40, 'category': 'produce', 'priority': 'high' },
                { 'name': 'Tomato', 'quantity': 1, 'unit': 'kg', 'approx_price_inr': 50, 'category': 'produce', 'priority': 'high' },
                { 'name': 'Potato', 'quantity': 1, 'unit': 'kg', 'approx_price_inr': 35, 'category': 'produce', 'priority': 'high' },
                { 'name': 'Milk/Curd', 'quantity': 2, 'unit': 'L', 'approx_price_inr': 120, 'category': 'dairy', 'priority': 'medium' },
                { 'name': 'Cooking Oil', 'quantity': 1, 'unit': 'L', 'approx_price_inr': 160, 'category': 'pantry', 'priority': 'high' },
                { 'name': 'Dal (moong/toor)', 'quantity': 1, 'unit': 'kg', 'approx_price_inr': 140, 'category': 'protein', 'priority': 'high' },
                { 'name': 'Masala basics', 'quantity': 1, 'unit': 'pack', 'approx_price_inr': 100, 'category': 'spices', 'priority': 'high' },
                { 'name': 'Leafy greens', 'quantity': 500, 'unit': 'g', 'approx_price_inr': 40, 'category': 'produce', 'priority': 'medium' },
            ]
            goal_l = goal.lower()
            if 'paneer' in goal_l:
                base_items.append({ 'name': 'Paneer', 'quantity': 500, 'unit': 'g', 'approx_price_inr': 200, 'category': 'dairy', 'priority': 'high' })
            if 'roti' in goal_l or 'chapati' in goal_l:
                base_items.append({ 'name': 'Ghee (optional)', 'quantity': 200, 'unit': 'g', 'approx_price_inr': 150, 'category': 'pantry', 'priority': 'low' })
            if any(x in goal_l for x in ['tikka', 'grill', 'marinate']):
                base_items.append({ 'name': 'Yogurt/Curd (for marinade)', 'quantity': 500, 'unit': 'g', 'approx_price_inr': 60, 'category': 'dairy', 'priority': 'medium' })
                base_items.append({ 'name': 'Spice mix (tikka masala)', 'quantity': 1, 'unit': 'pack', 'approx_price_inr': 80, 'category': 'spices', 'priority': 'medium' })
            total = 0
            items = []
            for it in base_items:
                if total + it['approx_price_inr'] <= budget_inr or it['priority'] in ('high', 'medium'):
                    items.append(it)
                    total += it['approx_price_inr']
                if total >= budget_inr * 1.15:
                    break
            summary['estimated_cost_inr'] = int(total)
            summary['under_budget'] = total <= budget_inr
            if not summary['note']:
                summary['note'] = 'Fallback estimate based on common Indian groceries.'
        if summary.get('estimated_cost_inr') is None:
            est = 0
            for it in items:
                try:
                    est += float(it.get('approx_price_inr') or 0)
                except Exception:
                    pass
            summary['estimated_cost_inr'] = int(est)
            summary['under_budget'] = est <= budget_inr
        return create_response(data={'summary': summary, 'items': items})
    except Exception as e:
        logger.error(f"❌ Shopping list generation error: {e}")
        return create_response(error='Failed to generate shopping list', status=500)

@app.route('/api/ai/chat', methods=['POST'])
@jwt_required()
def ai_chat():
    """Handle general AI chat"""
    try:
        if model is None:
            return create_response(error='AI service is currently unavailable. Please check your API key configuration.', status=503)
            
        user_id = get_jwt_identity()
        data = request.get_json()
        
        message = data.get('message', '')
        if not message.strip():
            return create_response(error='Message cannot be empty', status=400)
        
        # Get user context
        user = get_user_by_id(user_id)
        
        context = f"""
        You are a nutrition and wellness expert assistant.
        
        User's profile: {user.get('profile', {})}
        User's question: {message}
        
        RESPONSE FORMAT (IMPORTANT):
        - Return valid HTML only (no markdown)
        - Use <p> paragraphs with normal spacing after periods
        - Use <ul> and <li> for bullet points when listing items
        - Keep responses practical, encouraging, and under 180 words
        """
        
        # Get AI response
        response = model.generate_content(context)
        ai_response = _strip_code_fences(response.text or '')
        if '<' not in ai_response and '>' not in ai_response:
            parts = [p.strip() for p in ai_response.split('\n\n') if p.strip()]
            ai_response = ''.join(f'<p>{p.replace("\n", "<br>")}</p>' for p in parts) or '<p></p>'
        
        logger.info(f"✅ AI chat response generated for user: {user_id}")
        return create_response(data={'response': ai_response})
        
    except Exception as e:
        logger.error(f"❌ AI chat error: {e}")
        return create_response(error='AI processing failed. Please try again.', status=500)

@app.route('/api/recipes/ai', methods=['GET'])
@jwt_required()
def get_ai_recipes():
    """Get AI-generated recipe suggestions based on query and user profile"""
    try:
        if model is None:
            return create_response(error='AI service is currently unavailable. Please check your API key configuration.', status=503)

        user_id = get_jwt_identity()
        search_query = request.args.get('search', '').strip()
        meal_type = request.args.get('meal_type', '').strip() or 'any'
        cooking_time = request.args.get('cooking_time', '').strip()

        user = get_user_by_id(user_id)
        profile = user.get('profile', {}) if user else {}

        context = f"""
        Generate 6 healthy recipe suggestions.
        
        Query: {search_query or 'healthy quick meals'}
        Preferred meal type: {meal_type}
        Cooking time preference: {cooking_time or 'any'}
        
        User Profile: {json.dumps(profile)}
        
        Return ONLY valid JSON array (no markdown, no backticks). Each item must have:
        - name (string)
        - description (string, <= 2 sentences)
        - meal_type (string: breakfast|lunch|dinner|snack)
        - cooking_time (integer minutes)
        - ingredients (array of short strings)
        - instructions (array of short step strings)
        """
        
        ai_result = model.generate_content(context)
        text = ai_result.text or ''

        # Strip potential code fences
        text = text.strip()
        if text.startswith('```'):
            text = text.strip('`')
            if text.startswith('json'):
                text = text[4:]

        recipes = []
        try:
            parsed = json.loads(text)
            if isinstance(parsed, list):
                for i, item in enumerate(parsed[:6]):
                    recipes.append({
                        'id': f'ai_recipe_{i+1}',
                        'name': item.get('name') or f'AI Recipe {i+1}',
                        'description': item.get('description') or '',
                        'meal_type': item.get('meal_type') or meal_type,
                        'cooking_time': item.get('cooking_time') or 30,
                        'ingredients': item.get('ingredients') or [],
                        'instructions': item.get('instructions') or [],
                        'is_ai_generated': True,
                    })
        except Exception:
            # Fallback: naive block parsing
            blocks = [b.strip() for b in text.split('\n\n') if b.strip()]
            for i, block in enumerate(blocks[:6]):
                recipes.append({
                    'id': f'ai_recipe_{i+1}',
                    'name': block.split('\n', 1)[0][:60] if block else f'AI Recipe {i+1}',
                    'description': (block[:200] + '...') if len(block) > 200 else block,
                    'meal_type': meal_type,
                    'cooking_time': 30,
                    'ingredients': [],
                    'instructions': [],
                    'is_ai_generated': True,
                })

        return create_response(data={
            'recipes': recipes,
            'count': len(recipes),
            'source': 'ai_generated'
        })
    except Exception as e:
        logger.error(f"❌ AI recipe generation error: {e}")
        return create_response(error='Recipe generation failed. Please try again.', status=500)

@app.route('/api/meal-plans', methods=['GET'])
@jwt_required()
def get_meal_plans():
    """Get user's meal plans"""
    try:
        user_id = get_jwt_identity()
        
        meal_plans = list(db.meal_plans.find(
            {'user_id': ObjectId(user_id)}
        ).sort('generated_at', -1).limit(10))
        
        return create_response(data={
            'meal_plans': serialize_doc(meal_plans),
            'count': len(meal_plans)
        })
        
    except Exception as e:
        logger.error(f"❌ Meal plans retrieval error: {e}")
        return create_response(error='Failed to retrieve meal plans', status=500)

@app.route('/api/meal-plans', methods=['POST'])
@jwt_required()
def create_or_update_meal_plan():
    """Create or update a user's meal plan by date"""
    try:
        user_id = get_jwt_identity()
        data = request.get_json() or {}

        date_str = data.get('date')
        if not date_str:
            return create_response(error='date is required (ISO string)', status=400)

        try:
            plan_date = datetime.fromisoformat(date_str.replace('Z', '+00:00'))
        except Exception:
            return create_response(error='Invalid date format', status=400)

        update_fields = {
            'breakfast': data.get('breakfast'),
            'lunch': data.get('lunch'),
            'dinner': data.get('dinner'),
            'snacks': data.get('snacks'),
            'focus_area': data.get('focus_area'),
            'updated_at': datetime.now(timezone.utc),
        }

        # Upsert by user + date
        existing = db.meal_plans.find_one({'user_id': ObjectId(user_id), 'date': plan_date})
        if existing:
            db.meal_plans.update_one(
                {'_id': existing['_id']},
                {'$set': update_fields}
            )
            saved = db.meal_plans.find_one({'_id': existing['_id']})
        else:
            new_plan = {
                'user_id': ObjectId(user_id),
                'date': plan_date,
                'breakfast': data.get('breakfast'),
                'lunch': data.get('lunch'),
                'dinner': data.get('dinner'),
                'snacks': data.get('snacks'),
                'focus_area': data.get('focus_area'),
                'created_at': datetime.now(timezone.utc),
                'updated_at': datetime.now(timezone.utc),
            }
            result = db.meal_plans.insert_one(new_plan)
            saved = db.meal_plans.find_one({'_id': result.inserted_id})

        return create_response(data={'mealPlan': serialize_doc(saved)})
    except Exception as e:
        logger.error(f"❌ Create/update meal plan error: {e}")
        return create_response(error='Error saving meal plan', status=500)

@app.route('/api/meal-plans/<plan_id>', methods=['DELETE'])
@jwt_required()
def delete_meal_plan(plan_id):
    """Delete a meal plan if it belongs to the user"""
    try:
        user_id = get_jwt_identity()
        deleted = db.meal_plans.delete_one({'_id': ObjectId(plan_id), 'user_id': ObjectId(user_id)})
        if deleted.deleted_count == 0:
            return create_response(error='Meal plan not found', status=404)
        return create_response(message='Meal plan deleted successfully')
    except Exception as e:
        logger.error(f"❌ Delete meal plan error: {e}")
        return create_response(error='Error deleting meal plan', status=500)

@app.route('/api/meal-plans/<plan_id>', methods=['GET'])
@jwt_required()
def get_meal_plan(plan_id):
    """Get specific meal plan"""
    try:
        user_id = get_jwt_identity()
        
        meal_plan = db.meal_plans.find_one({
            '_id': ObjectId(plan_id),
            'user_id': ObjectId(user_id)
        })
        
        if not meal_plan:
            return create_response(error='Meal plan not found', status=404)
        
        return create_response(data={'meal_plan': serialize_doc(meal_plan)})
        
    except Exception as e:
        logger.error(f"❌ Meal plan retrieval error: {e}")
        return create_response(error='Failed to retrieve meal plan', status=500)

# Recipe Routes
@app.route('/api/recipes', methods=['GET'])
@jwt_required()
def get_recipes():
    """Get recipes with filters"""
    try:
        # Get query parameters
        search = request.args.get('search', '').strip()
        meal_type = request.args.get('meal_type', '').strip()
        cooking_time = request.args.get('cooking_time', '').strip()
        limit = min(int(request.args.get('limit', 20)), 50)  # Max 50 recipes
        
        # Build query
        query = {}
        
        if search:
            query['$or'] = [
                {'name': {'$regex': search, '$options': 'i'}},
                {'description': {'$regex': search, '$options': 'i'}},
                {'ingredients': {'$regex': search, '$options': 'i'}}
            ]
        
        if meal_type:
            query['meal_type'] = meal_type
        
        if cooking_time:
            time_ranges = {
                'quick': {'$lt': 15},
                'medium': {'$gte': 15, '$lt': 30},
                'long': {'$gte': 30}
            }
            if cooking_time in time_ranges:
                query['cooking_time'] = time_ranges[cooking_time]
        
        # Get recipes from database
        recipes = list(db.recipes.find(query).limit(limit))
        
        logger.info(f"✅ Found {len(recipes)} recipes with filters")
        return create_response(data={
            'recipes': serialize_doc(recipes),
            'count': len(recipes),
            'filters_applied': {
                'search': search,
                'meal_type': meal_type,
                'cooking_time': cooking_time
            }
        })
        
    except Exception as e:
        logger.error(f"❌ Recipe search error: {e}")
        return create_response(error='Recipe search failed', status=500)

@app.route('/api/recipes/<recipe_id>', methods=['GET'])
@jwt_required()
def get_recipe_by_id(recipe_id):
    """Get a single recipe by ID"""
    try:
        recipe = db.recipes.find_one({'_id': ObjectId(recipe_id)})
        if not recipe:
            return create_response(error='Recipe not found', status=404)
        return create_response(data={'recipe': serialize_doc(recipe)})
    except Exception as e:
        logger.error(f"❌ Get recipe error: {e}")
        return create_response(error='Error fetching recipe', status=500)

@app.route('/api/recipes', methods=['POST'])
@jwt_required()
def create_recipe():
    """Create a new recipe (admin or internal use)"""
    try:
        data = request.get_json() or {}
        required = ['name', 'ingredients', 'instructions']
        if not all(k in data for k in required):
            return create_response(error='name, ingredients, and instructions are required', status=400)

        doc = {
            'name': data['name'],
            'description': data.get('description'),
            'ingredients': data['ingredients'],
            'instructions': data['instructions'],
            'dosha_benefits': data.get('dosha_benefits'),
            'meal_type': data.get('meal_type'),
            'cooking_time': data.get('cooking_time'),
            'difficulty_level': data.get('difficulty_level'),
            'nutritional_info': data.get('nutritional_info'),
            'seasonal_tags': data.get('seasonal_tags'),
            'image_url': data.get('image_url'),
            'created_at': datetime.now(timezone.utc),
        }
        result = db.recipes.insert_one(doc)
        saved = db.recipes.find_one({'_id': result.inserted_id})
        return create_response(data={'recipe': serialize_doc(saved)}, status=201)
    except Exception as e:
        logger.error(f"❌ Create recipe error: {e}")
        return create_response(error='Error creating recipe', status=500)

# Progress Routes
@app.route('/api/progress', methods=['GET'])
@jwt_required()
def get_progress():
    """Get user progress data"""
    try:
        user_id = get_jwt_identity()
        limit = min(int(request.args.get('limit', 30)), 90)  # Max 90 entries
        
        # Get progress entries
        progress = list(db.progress.find(
            {'user_id': ObjectId(user_id)}
        ).sort('date', -1).limit(limit))
        
        return create_response(data={
            'progress': serialize_doc(progress),
            'count': len(progress)
        })
        
    except Exception as e:
        logger.error(f"❌ Progress retrieval error: {e}")
        return create_response(error='Progress retrieval failed', status=500)

@app.route('/api/progress', methods=['POST'])
@jwt_required()
def add_progress():
    """Add progress entry"""
    try:
        user_id = get_jwt_identity()
        data = request.get_json()
        
        # Validate required fields
        required_fields = ['date', 'weight', 'energy_level', 'mood', 'sleep_quality']
        if not all(field in data for field in required_fields):
            return create_response(error='Missing required progress fields', status=400)
        
        # Create progress entry
        progress_data = {
            'user_id': ObjectId(user_id),
            'date': datetime.fromisoformat(data['date'].replace('Z', '+00:00')),
            'weight': data['weight'],
            'energy_level': data['energy_level'],
            'mood': data['mood'],
            'sleep_quality': data['sleep_quality'],
            'water_intake': data.get('water_intake', 0),
            'exercise_minutes': data.get('exercise_minutes', 0),
            'notes': data.get('notes', ''),
            'created_at': datetime.now(timezone.utc)
        }
        
        result = db.progress.insert_one(progress_data)
        
        logger.info(f"✅ Progress entry added for user: {user_id}")
        return create_response(data={
            'id': str(result.inserted_id)
        }, message='Progress recorded successfully', status=201)
        
    except Exception as e:
        logger.error(f"❌ Progress addition error: {e}")
        return create_response(error='Failed to record progress', status=500)

@app.route('/api/progress/analytics', methods=['GET'])
@jwt_required()
def get_analytics():
    """Get user analytics"""
    try:
        user_id = get_jwt_identity()
        days = min(int(request.args.get('days', 30)), 90)  # Max 90 days
        
        # Calculate analytics from progress data
        pipeline = [
            {
                '$match': {
                    'user_id': ObjectId(user_id),
                    'date': {'$gte': datetime.now(timezone.utc) - timedelta(days=days)}
                }
            },
            {
                '$group': {
                    '_id': None,
                    'avg_weight': {'$avg': '$weight'},
                    'avg_energy': {'$avg': '$energy_level'},
                    'avg_mood': {'$avg': '$mood'},
                    'avg_sleep': {'$avg': '$sleep_quality'},
                    'avg_water': {'$avg': '$water_intake'},
                    'avg_exercise': {'$avg': '$exercise_minutes'},
                    'total_entries': {'$sum': 1}
                }
            }
        ]
        
        result = list(db.progress.aggregate(pipeline))
        analytics = result[0] if result else {}
        
        return create_response(data={
            'analytics': serialize_doc(analytics),
            'period_days': days
        })
        
    except Exception as e:
        logger.error(f"❌ Analytics error: {e}")
        return create_response(error='Analytics retrieval failed', status=500)

# Notification Routes
@app.route('/api/notifications', methods=['GET'])
@jwt_required()
def get_notifications():
    """Get user notifications"""
    try:
        user_id = get_jwt_identity()
        
        # Get notifications from database
        notifications = list(db.notifications.find(
            {'user_id': ObjectId(user_id)}
        ).sort('created_at', -1).limit(20))
        
        return create_response(data={
            'notifications': serialize_doc(notifications),
            'count': len(notifications)
        })
        
    except Exception as e:
        logger.error(f"❌ Notifications error: {e}")
        return create_response(error='Failed to get notifications', status=500)

@app.route('/api/notifications', methods=['POST'])
@jwt_required()
def create_notification():
    """Create a reminder notification"""
    try:
        user_id = get_jwt_identity()
        data = request.get_json()
        
        notification_data = {
            'user_id': ObjectId(user_id),
            'title': data.get('title', 'Reminder'),
            'message': data.get('message', ''),
            'type': data.get('type', 'reminder'),
            'scheduled_for': datetime.fromisoformat(data['scheduled_for'].replace('Z', '+00:00')),
            'read': False,
            'created_at': datetime.now(timezone.utc)
        }
        
        result = db.notifications.insert_one(notification_data)
        
        logger.info(f"✅ Notification created for user: {user_id}")
        return create_response(data={
            'id': str(result.inserted_id)
        }, message='Notification created successfully', status=201)
        
    except Exception as e:
        logger.error(f"❌ Notification creation error: {e}")
        return create_response(error='Failed to create notification', status=500)

# Catch-all for SPA routes (non-API)
@app.route('/<path:path>')
def spa_catch_all(path):
    # Let API routes and static be handled by their routes
    return render_template('index.html')

# Error handlers
@app.errorhandler(404)
def not_found(error):
    return create_response(error='Endpoint not found', status=404)

@app.errorhandler(500)
def internal_error(error):
    return create_response(error='Internal server error', status=500)

@app.errorhandler(400)
def bad_request(error):
    return create_response(error='Bad request', status=400)

@app.errorhandler(401)
def unauthorized(error):
    return create_response(error='Unauthorized access', status=401)

if __name__ == '__main__':
    port = int(os.getenv('PORT', 5000))
    debug = os.getenv('FLASK_ENV') == 'development'
    
    logger.info(f"🚀 Starting Satvic Diet Planner on port {port}")
    logger.info(f"🔧 Debug mode: {debug}")
    
    app.run(host='0.0.0.0', port=port, debug=debug)
