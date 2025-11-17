const fs = require("fs");
const path = require("path");

// Path to the log file (adjust as needed)
const LOG_FILE = path.join(__dirname, "api_error_log.txt");

/**
 * Logs an API error to a file with timestamp
 * @param {string} message - Error message
 * @param {number|string|null} code - Optional error code
 */
function logError(message, code = null) {
    const timestamp = new Date().toISOString();
    const logEntry = `${timestamp} | Code: ${code} | Error: ${message}\n`;

    fs.appendFile(LOG_FILE, logEntry, (err) => {
        if (err) console.error("Failed to write to log file:", err);
    });

    console.log(`Logged error: ${message} (code: ${code}) at ${timestamp}`);
}

module.exports = { logError };
