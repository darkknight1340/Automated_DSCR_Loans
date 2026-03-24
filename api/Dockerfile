# DSCR API - FastAPI
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and README
COPY pyproject.toml README.md ./

# Install Python dependencies
RUN pip install --no-cache-dir .

# Copy application code
COPY app/ ./app/

# Set environment
ENV PYTHONUNBUFFERED=1
ENV PORT=8080

# Expose port (Cloud Run uses 8080 by default)
EXPOSE 8080

# Run the application
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]
