#!/bin/bash
echo "🎵 Starting Vinyl Collection Manager Backend..."
echo "=========================================="
echo ""
echo "Environment:"
echo "  Python: $(python --version)"
echo "  Working directory: $(pwd)"
echo ""

# Activate the local virtual environment if present.
# Create it with: python -m venv .venv && pip install -r requirements.txt
if [ -f ".venv/bin/activate" ]; then
    source .venv/bin/activate
else
    echo "Warning: .venv not found. Running with the current Python environment."
    echo "         Create one with: python -m venv .venv && pip install -r requirements.txt"
fi

# Run the Flask server as a module
# This ensures relative imports work correctly, similar to how gunicorn runs it in production
python -m barcode_scanner.server
