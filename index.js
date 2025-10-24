import express from 'express'
import path from 'path'
import { fileURLToPath } from 'url'
import { build_api } from './file_engine_api.js'
import fs from 'fs'

// Get dirname equivalent in ESM
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const data_path = path.join(__dirname, '__data')
// Ensure data directory exists
if (!fs.existsSync(data_path)) {
    fs.mkdirSync(data_path, { recursive: true })
}

// Create Express app
const app = express()

// Middleware for parsing JSON and URL-encoded data
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// Mount API router
app.use('/api', build_api())

// Serve static files from 'front' directory
app.use(express.static(path.join(__dirname, 'front')))

// Set port
const PORT = process.env.PORT || 3000

// No periodic user deletion in new system

// Start server
app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`)
})