FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy Python dependencies
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Create uploads directory
RUN mkdir -p uploads

# Create non-root user
RUN groupadd -g 1001 appgroup \
    && useradd -u 1001 -g appgroup -m appuser \
    && chown -R appuser:appgroup /app
USER appuser

EXPOSE 3000

# Health check hitting Flask health endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD python -c "import urllib.request,os,sys; url=f'http://localhost:{os.environ.get('PORT','3000')}/api/health';\
    req=urllib.request.Request(url);\
    urllib.request.urlopen(req, timeout=3) and sys.exit(0)"

# Start Flask app with Gunicorn bound to port 3000
ENV PORT=3000
CMD ["gunicorn", "-w", "3", "-k", "gthread", "-b", "0.0.0.0:3000", "app:app"]
