# Restart MCP Server Protocol

## Steps:
> In order to restart the mcp server for an update or any other reason do the following steps:

### 1. Check if the server is running:
> `netstat -ano | Select-String "3700|3701"`

### 2. If the server is running you should see 2 ports in a LISTENING state/status:
> To stop the server do the following commands:
    1) stop - `pm2 stop jarvis-mcp`
    2) verify - `netstat -ano | Select-String "3700|3701"`

### 3. Build the project again:
> `npm run build`

### 4. Restart the server:
> 1) `pm2 resurrect`
> 2) `pm2 restart <id>` the id of the first / resurrected process.

### 5. Reconnect the mcp server with Claude:
> 1) Remove the old connector entirely.
> 2) Add the connector - add the name, url, OAuth Id and OAuth Secret and click connect authroize with the password.