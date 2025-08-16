#!/bin/bash
# Double-click to stop your game server

echo "🛑 Stopping Game Development Server..."

# Kill Python server processes
KILLED=0

# Method 1: Kill by process name
if pkill -f "python.*server.py"; then
    echo "✅ Stopped Python game server"
    KILLED=1
fi

# Method 2: Kill by port
for PORT in 8000 8080 3000; do
    PID=$(lsof -ti tcp:$PORT 2>/dev/null)
    if [ -n "$PID" ]; then
        kill "$PID" 2>/dev/null
        echo "✅ Freed up port $PORT"
        KILLED=1
    fi
done

if [ $KILLED -eq 0 ]; then
    echo "ℹ️  No running game server found"
else
    echo "🏁 Server stopped successfully"
fi

echo ""
read -p "Press Enter to close this window..."