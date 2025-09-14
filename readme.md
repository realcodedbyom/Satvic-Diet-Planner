# 🌿 Satvic Diet Planner

A comprehensive AI-powered diet planning application that helps users create personalized meal plans, track nutrition progress, and maintain a healthy Satvic lifestyle. Built with Flask backend and modern web technologies.

## ✨ Features

- **🤖 AI-Powered Meal Planning**: Generate personalized meal plans using Google's Gemini AI
- **📊 Progress Tracking**: Monitor weight, energy levels, mood, and sleep quality
- **🍽️ Recipe Management**: Browse and create custom recipes with nutritional information
- **🛒 Smart Shopping Lists**: Generate budget-conscious shopping lists based on meal plans
- **📱 Responsive Design**: Modern, mobile-friendly interface
- **🔐 Secure Authentication**: JWT-based user authentication and authorization
- **📈 Analytics Dashboard**: Track your health journey with detailed analytics
- **🔔 Smart Notifications**: Get reminders for meals and health goals

## 🏗️ Architecture

- **Backend**: Flask (Python) with RESTful API
- **Database**: MongoDB for data persistence
- **AI Integration**: Google Gemini AI for meal planning and recipe generation
- **Authentication**: JWT tokens with bcrypt password hashing
- **Frontend**: Vanilla JavaScript with modern ES6+ features
- **Deployment**: Docker containerization with Nginx reverse proxy

## 🚀 Quick Start

### Prerequisites

- Python 3.11+
- Node.js 18+ (for database scripts)
- MongoDB (local or cloud)
- Google Gemini API key
- Docker & Docker Compose (for containerized deployment)

### Local Development Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd Satvic-Diet-Planner
   ```

2. **Install Python dependencies**
   ```bash
   pip install -r requirements.txt
   ```

3. **Install Node.js dependencies**
   ```bash
   npm install
   ```

4. **Set up environment variables**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` with your configuration:
   ```env
   # Database
   MONGODB_URI=mongodb://localhost:27017/satvic_diet_planner
   
   # JWT Secret
   JWT_SECRET=your_super_secret_jwt_key_here
   
   # AI Configuration
   GEMINI_API_KEY=your_actual_gemini_api_key_here
   
   # Server Configuration
   PORT=5000
   FLASK_ENV=development
   CORS_ORIGIN=http://localhost:5000
   ```

5. **Initialize the database**
   ```bash
   npm run migrate
   npm run seed
   ```

6. **Start the development server**
   ```bash
   python app.py
   ```

   The application will be available at `http://localhost:5000`

## 🐳 Docker Deployment

### Using Docker Compose (Recommended)

1. **Clone and navigate to the project**
   ```bash
   git clone <repository-url>
   cd Satvic-Diet-Planner
   ```

2. **Configure environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your production values
   ```

3. **Build and start services**
   ```bash
   docker-compose up -d
   ```

4. **Initialize database (first time only)**
   ```bash
   docker-compose exec app npm run migrate
   docker-compose exec app npm run seed
   ```

5. **Access the application**
   - Application: `http://your-server-ip`
   - API Health: `http://your-server-ip/api/health`

### Manual Docker Build

```bash
# Build the image
docker build -t satvic-diet-planner .

# Run the container
docker run -d \
  --name satvic-app \
  -p 3000:3000 \
  -e MONGODB_URI=your_mongodb_uri \
  -e GEMINI_API_KEY=your_gemini_api_key \
  -e JWT_SECRET=your_jwt_secret \
  satvic-diet-planner
```

## 🖥️ Ubuntu VPS Deployment

### 1. Server Setup

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Install Git
sudo apt install git -y
```

### 2. Application Deployment

```bash
# Clone repository
git clone <repository-url>
cd Satvic-Diet-Planner

# Create environment file
nano .env
```

**Environment Configuration (.env):**
```env
# Production Environment
FLASK_ENV=production
PORT=3000

# Database (Use MongoDB Atlas for production)
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/satvic_diet_planner

# Security
JWT_SECRET=your_very_secure_jwt_secret_key_here

# AI Configuration
GEMINI_API_KEY=your_actual_gemini_api_key_here

# CORS (Replace with your domain)
CORS_ORIGIN=https://yourdomain.com

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

### 3. SSL Configuration (Optional but Recommended)

```bash
# Install Certbot for SSL
sudo apt install certbot python3-certbot-nginx -y

# Get SSL certificate (replace with your domain)
sudo certbot --nginx -d yourdomain.com

# Update nginx.conf to use SSL
```

### 4. Start the Application

```bash
# Build and start services
docker-compose up -d

# Check logs
docker-compose logs -f app

# Initialize database
docker-compose exec app npm run migrate
docker-compose exec app npm run seed
```

### 5. Firewall Configuration

```bash
# Configure UFW firewall
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw enable
```

### 6. Process Management

```bash
# View running containers
docker-compose ps

# Restart services
docker-compose restart

# Update application
git pull
docker-compose down
docker-compose up -d --build

# View logs
docker-compose logs -f app
```

## 🔧 Configuration

### Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `MONGODB_URI` | MongoDB connection string | - | ✅ |
| `GEMINI_API_KEY` | Google Gemini AI API key | - | ✅ |
| `JWT_SECRET` | Secret key for JWT tokens | - | ✅ |
| `PORT` | Application port | 5000 | ❌ |
| `FLASK_ENV` | Flask environment | development | ❌ |
| `CORS_ORIGIN` | Allowed CORS origins | * | ❌ |

### Database Schema

The application uses MongoDB with the following collections:
- `users` - User profiles and authentication data
- `meal_plans` - Generated and custom meal plans
- `recipes` - Recipe database with nutritional information
- `progress` - User health and progress tracking
- `notifications` - User notifications and reminders

## 📚 API Documentation

### Authentication Endpoints
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `GET /api/auth/verify` - Token verification

### Meal Planning
- `POST /api/ai/generate-meal-plan` - Generate AI meal plan
- `GET /api/meal-plans` - Get user meal plans
- `POST /api/meal-plans` - Create/update meal plan

### Recipes
- `GET /api/recipes` - Search recipes
- `POST /api/ai/generate-recipe` - Generate custom recipe
- `GET /api/recipes/ai` - Get AI recipe suggestions

### Progress Tracking
- `GET /api/progress` - Get progress data
- `POST /api/progress` - Add progress entry
- `GET /api/progress/analytics` - Get analytics

### Shopping Lists
- `POST /api/shopping/generate` - Generate shopping list

## 🧪 Testing

```bash
# Run database migrations
npm run migrate

# Seed database with sample data
npm run seed

# Test API endpoints
curl http://localhost:5000/api/health
```

## 🔒 Security Features

- JWT-based authentication with secure token expiration
- Password hashing using bcrypt with salt rounds
- Rate limiting to prevent abuse
- CORS configuration for cross-origin requests
- Input validation and sanitization
- Helmet.js for security headers

## 📊 Monitoring

The application includes health check endpoints and logging:

```bash
# Health check
curl http://your-domain/api/health

# View application logs
docker-compose logs -f app
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 👥 Credits

**Developed by OM and Team**

- **Lead Developer**: OM
- **Development Team**: Satvic Diet Planner Team
- **AI Integration**: Google Gemini AI
- **Database**: MongoDB
- **Framework**: Flask (Python)

## 🆘 Support

For support and questions:
- Create an issue in the repository
- Contact the development team
- Check the API documentation for endpoint details

## 🔄 Updates

To update the application:

```bash
# Pull latest changes
git pull origin main

# Rebuild and restart
docker-compose down
docker-compose up -d --build

# Run any new migrations
docker-compose exec app npm run migrate
```

---

**🌿 Embrace the Satvic way of life with personalized nutrition planning!**
