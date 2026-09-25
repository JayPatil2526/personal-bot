FROM python:3.10-slim

WORKDIR /app

# Prevent python from writing pyc files and buffer stdout
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir uv
# CPU-only PyTorch before sentence-transformers keeps the image ~2.5GB smaller
RUN uv pip install --system torch --index-url https://download.pytorch.org/whl/cpu
RUN uv pip install --system --no-cache -r requirements.txt

# Pre-download the reranker model so it is not fetched at runtime
RUN python -c "from sentence_transformers import CrossEncoder; CrossEncoder('cross-encoder/ms-marco-MiniLM-L-6-v2')"

# Copy project
COPY . .

# Fix windows line endings if edited on windows
RUN sed -i 's/\r$//g' /app/entrypoint.sh && chmod +x /app/entrypoint.sh

EXPOSE 8000

ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
