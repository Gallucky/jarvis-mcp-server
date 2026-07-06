cd C:\jarvis-mcp-server
npm run build
pm2 restart jarvis-mcp
pm2 save

echo "Server successfuly restarted."
pause