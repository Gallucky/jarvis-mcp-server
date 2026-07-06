:: installation run once / run after uninstalling.

npm install -g pm2
cd C:\jarvis-mcp-server
pm2 start dist/index.js --name jarvis-mcp
pm2 save