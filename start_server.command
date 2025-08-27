#!/bin/bash
# Double-click to start your game server

# Get the directory where this script is located
cd "$(dirname "$0")"

echo "🎮 Starting Game Development Server..."
echo "📁 Game Directory: $(pwd)"
echo "🌐 URL: http://localhost:8000"
echo ""
echo "Your browser should open automatically."
echo "Press Ctrl+C in this window to stop the server."
echo ""

# Check if Python 3 is available
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 is not installed."
    echo "Please install Python 3 from python.org"
    read -p "Press Enter to exit..."
    exit 1
fi

# Check if server.py exists
if [ ! -f "server.py" ]; then
    echo "❌ server.py not found in this folder."
    echo "Make sure server.py is in the same folder as this script."
    read -p "Press Enter to exit..."
    exit 1
fi

# Start the server
python3 server.py 8000

read -p "Press Enter to close this window..."