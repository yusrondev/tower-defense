#!/bin/bash

# Navigate to the project root directory where the script is located relative to project root.
# In this case, the script is in .agents/run.sh, so we go one level up.
cd "$(dirname "$0")/.."

echo "Installing dependecies..."
npm install

echo "Starting Battle game server..."
npm start
