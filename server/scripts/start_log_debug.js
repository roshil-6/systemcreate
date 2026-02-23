const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const logFile = path.join(__dirname, 'server_debug.log');
const out = fs.openSync(logFile, 'a');
const err = fs.openSync(logFile, 'a');

console.log(`🚀 Starting server and logging to ${logFile}`);

const server = spawn('node', ['index.js'], {
    detached: true,
    stdio: ['ignore', out, err]
});

server.unref();
process.exit(0);
