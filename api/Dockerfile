# syntax=docker/dockerfile:1
FROM python:3.12-slim

# Pin to the same uv release used in CI (astral-sh/setup-uv@v3) for
# reproducible installs between local builds, CI, and Fly.
RUN pip install --no-cache-dir uv==0.11.26
WORKDIR /app

# Install dependencies first so this layer is cached across builds that only
# change application code, not pyproject.toml/uv.lock.
COPY pyproject.toml uv.lock ./
RUN uv sync --no-dev --frozen --no-install-project

# Now copy the application source and install the project itself. Hatchling
# packages `src/sketch_party` per [tool.hatch.build.targets.wheel] in
# pyproject.toml, so this is what makes `sketch_party` importable - no
# PYTHONPATH hacks needed.
COPY . .
RUN uv sync --no-dev --frozen

EXPOSE 8000

# Rooms live in this single process's memory (see fly.toml for why this
# image must only ever run as one instance, never scaled out).
#
# Shell form (not exec/JSON-array form) so ${PORT} is substituted by the
# shell at container start: Fly injects PORT at runtime, and this falls
# back to 8000 for plain `docker run` / docker compose.
CMD uv run uvicorn sketch_party.app:create_app --factory --host 0.0.0.0 --port ${PORT:-8000}
