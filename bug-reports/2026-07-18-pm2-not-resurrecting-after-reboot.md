# PM2 didn't resurrect jarvis-mcp after an unattended reboot

**Date:** 2026-07-18
**Project:** jarvis-mcp-server
**Status:** Fixed

## Symptom
jarvis-mcp-server was unreachable — the MCP process wasn't running on the mini PC.

## Root cause
`pm2-resurrect.bat` is only triggered via the Windows `shell:startup` folder, which fires solely on an *interactive login*. An unattended reboot (e.g. an overnight Windows Update restart with nobody logged in) never triggers `shell:startup`, so PM2 itself never restarted and the `jarvis-mcp` process was never resurrected. This gap is already called out in this repo's README under "Auto-start on Windows boot."

## Fix
Manually ran the PM2 commands directly in a PowerShell terminal on the mini PC (`pm2 resurrect`, falling back to `pm2 start dist/index.js --name jarvis-mcp && pm2 save` if resurrect had nothing saved). Confirmed recovery with `pm2 list` showing `jarvis-mcp` as `online`.

## Files changed
- None — operational fix, no code changed.

## Keywords
pm2, pm2 resurrect, shell:startup, unattended reboot, Windows Update restart, server not running, jarvis-mcp offline, pm2-resurrect.bat, pm2-start.bat, PowerShell pm2 commands, mini PC restart
