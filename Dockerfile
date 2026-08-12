FROM registry.redhat.io/ubi9/python-312-minimal:latest

# Create non-root user
RUN useradd -m -u 1001 appuser

WORKDIR /app

# Install dependencies first (layer cache)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application source
COPY --chown=appuser:appuser . .

# Ensure uploads directory exists and is writable by appuser
RUN mkdir -p uploads && chown appuser:appuser uploads

# Switch to non-root user
USER 1001

EXPOSE 8000

CMD ["python", "main.py", "api"]
