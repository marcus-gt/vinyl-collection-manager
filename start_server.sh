#!/bin/bash
echo "🎵 Starting Vinyl Collection Manager Backend..."
echo "=========================================="
echo ""
echo "Environment:"
echo "  Python: $(python --version)"
echo "  Working directory: $(pwd)"
echo ""

# Activate the Poetry virtual environment if not already active
if [ -f ".venv/bin/activate" ]; then
    source .venv/bin/activate
elif command -v poetry &> /dev/null; then
    # Try to find the virtual environment managed by poetry
    VENV_PATH=$(poetry env info -p 2>/dev/null)
    if [ -n "$VENV_PATH" ] && [ -f "$VENV_PATH/bin/activate" ]; then
        source "$VENV_PATH/bin/activate"
    else
        echo "Warning: Poetry virtual environment not found or not active. Attempting to run without explicit activation."
    fi
else
    echo "Warning: Poetry not found. Attempting to run without explicit virtual environment activation."
fi

# Run the Flask server as a module
# This ensures relative imports work correctly, similar to how gunicorn runs it in production
python -m barcode_scanner.server
