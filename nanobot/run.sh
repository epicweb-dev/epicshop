#!/bin/bash

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Get the project root directory (parent of nanobot directory)
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Load environment variables from .env file in project root if it exists
if [ -f "$PROJECT_ROOT/.env" ]; then
    export $(cat "$PROJECT_ROOT/.env" | grep -v '^#' | xargs)
fi

# Change to nanobot directory and run nanobot
cd "$SCRIPT_DIR"
nanobot run ./config.yml
