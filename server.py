#!/usr/bin/env python3
import http.server
import socketserver
import os
import sys
import signal
import webbrowser
from pathlib import Path

class GameHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # Add CORS headers for development
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', '*')
        super().end_headers()
    
    def guess_type(self, path):
        # Ensure proper MIME types for web files
        mimetype = super().guess_type(path)
        if path.endswith('.js'):
            return 'application/javascript'
        elif path.endswith('.css'):
            return 'text/css'
        elif path.endswith('.html'):
            return 'text/html'
        return mimetype

class GameServer:
    def __init__(self, port=8000, directory=None):
        self.port = port
        self.directory = directory or os.getcwd()
        self.httpd = None
        
    def start(self):
        # Change to the game directory
        os.chdir(self.directory)
        
        # Create server
        self.httpd = socketserver.TCPServer(("", self.port), GameHTTPRequestHandler)
        
        print(f"🎮 Game Server Starting...")
        print(f"📁 Serving: {self.directory}")
        print(f"🌐 URL: http://localhost:{self.port}")
        print(f"⏹️  Press Ctrl+C to stop")
        print("-" * 50)
        
        # Open browser automatically - try different browsers if Safari blocks HTTP
        try:
            # Try Chrome first (better for development)
            import subprocess
            subprocess.run(['open', '-a', 'Google Chrome', f'http://localhost:{self.port}'], 
                         check=False, capture_output=True)
        except:
            try:
                # Try Firefox
                subprocess.run(['open', '-a', 'Firefox', f'http://localhost:{self.port}'], 
                             check=False, capture_output=True)
            except:
                # Fall back to default browser
                webbrowser.open(f'http://localhost:{self.port}')
        
        try:
            self.httpd.serve_forever()
        except KeyboardInterrupt:
            self.stop()
    
    def stop(self):
        if self.httpd:
            print("\n🛑 Stopping server...")
            self.httpd.shutdown()
            self.httpd.server_close()
            print("✅ Server stopped")

def signal_handler(sig, frame):
    print("\n🛑 Received interrupt signal...")
    sys.exit(0)

if __name__ == "__main__":
    # Handle Ctrl+C gracefully
    signal.signal(signal.SIGINT, signal_handler)
    
    # Default settings
    PORT = 8000
    GAME_DIR = os.getcwd()
    
    # Parse command line arguments
    if len(sys.argv) > 1:
        try:
            PORT = int(sys.argv[1])
        except ValueError:
            GAME_DIR = sys.argv[1]
            if len(sys.argv) > 2:
                PORT = int(sys.argv[2])
    
    # Expand iCloud path if needed
    if "iCloud" in GAME_DIR and "~" in GAME_DIR:
        GAME_DIR = os.path.expanduser(GAME_DIR)
    
    # Start server
    server = GameServer(PORT, GAME_DIR)
    server.start()