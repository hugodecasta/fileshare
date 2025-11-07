import express from 'express'
import {
    get_tree,
    set_file,
    get_blob,
    delete_file,
    create_folder,
    delete_folder,
    user_full_size,
    create_share,
    get_shared_blob,
    location_is_shared,
    get_file_info,
    set_file_info,
    remove_share,
    move_to
} from './file_engine.js'

// Decode base64 or base64url strings safely to UTF-8
function decodeB64ToUtf8(b64ish) {
    if (!b64ish || typeof b64ish !== 'string') return null
    // try base64url -> base64
    let s = b64ish.replace(/-/g, '+').replace(/_/g, '/')
    // pad
    const pad = s.length % 4
    if (pad) s += '='.repeat(4 - pad)
    try {
        return Buffer.from(s, 'base64').toString('utf8')
    } catch {
        try {
            // last resort try as-is
            return Buffer.from(b64ish, 'base64').toString('utf8')
        } catch {
            return null
        }
    }
}

function getKeyFromAuth(req) {
    const auth = req.get('authorization') || req.get('Authorization')
    const key = decodeB64ToUtf8(auth || '')
    return key
}

function ensureRoot(key) {
    // Ensure user's root directory exists (idempotent)
    try { create_folder(key, '') } catch { }
}

export function build_api() {
    const router = express.Router()

    // For binary uploads (per-route raw parser)
    const rawParser = express.raw({ type: '*/*', limit: '5gb' })

    // Minimal mime type guesser based on file extension
    function guessMime(filename = '') {
        const ext = (filename.split('.').pop() || '').toLowerCase()
        switch (ext) {
            case 'html':
            case 'htm': return 'text/html; charset=utf-8'
            case 'css': return 'text/css; charset=utf-8'
            case 'js':
            case 'mjs': return 'application/javascript; charset=utf-8'
            case 'json': return 'application/json; charset=utf-8'
            case 'txt':
            case 'log':
            case 'md': return 'text/plain; charset=utf-8'
            case 'svg': return 'image/svg+xml; charset=utf-8'
            case 'png': return 'image/png'
            case 'jpg':
            case 'jpeg': return 'image/jpeg'
            case 'gif': return 'image/gif'
            case 'webp': return 'image/webp'
            case 'avif': return 'image/avif'
            case 'ico': return 'image/x-icon'
            case 'pdf': return 'application/pdf'
            case 'mp4': return 'video/mp4'
            case 'webm': return 'video/webm'
            case 'ogg': return 'audio/ogg'
            case 'mp3': return 'audio/mpeg'
            case 'wav': return 'audio/wav'
            default: return 'application/octet-stream'
        }
    }

    // Health/login: ensures root exists and returns a simple ok
    router.get('/login', (req, res) => {
        const key = getKeyFromAuth(req)
        if (!key) return res.status(401).json({ error: 'Missing or invalid Authorization header' })
        ensureRoot(key)
        const size = user_full_size(key)
        return res.json({ ok: true, size })
    })

    // Browse tree for a given path ("" for root)
    router.get('/tree', (req, res) => {
        const key = getKeyFromAuth(req)
        if (!key) return res.status(401).json({ error: 'Missing or invalid Authorization header' })
        ensureRoot(key)
        const path = String(req.query.path || '').replace(/^\/+|\/+$/g, '')
        const tree = get_tree(key, path)
        // If not existing yet, return empty list instead of null
        if (tree === null) return res.json([])
        return res.json(tree)
    })

    // Download a file by path
    router.get('/blob', (req, res) => {
        console.log('blobing')
        const key = getKeyFromAuth(req)
        if (!key) return res.status(401).json({ error: 'Missing or invalid Authorization header' })
        const path = String(req.query.path || '').replace(/^\/+/, '')
        if (!path) return res.status(400).json({ error: 'Missing path' })
        const blob = get_blob(key, path)
        if (blob == null) return res.status(404).json({ error: 'Not found' })
        const name = path.split('/').filter(Boolean).slice(-1)[0] || 'download'
        res.setHeader('Content-Type', 'application/octet-stream')
        res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(name)}`)
        return res.send(blob)
    })

    // View a file inline by path (like static serve)
    router.get('/view', (req, res) => {
        const key = getKeyFromAuth(req)
        console.log('OOO', key)
        if (!key) return res.status(401).json({ error: 'Missing or invalid Authorization header' })
        const path = String(req.query.path || '').replace(/^\/+/, '')
        if (!path) return res.status(400).json({ error: 'Missing path' })
        const blob = get_blob(key, path)
        if (blob == null) return res.status(404).json({ error: 'Not found' })
        const name = path.split('/').filter(Boolean).slice(-1)[0] || 'file'
        const mime = guessMime(name)
        res.setHeader('Content-Type', mime)
        // Explicitly inline; browsers will render when possible
        res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(name)}`)
        return res.send(blob)
    })

    // Upload a file (raw body). Use query: ?path=<folder>&name=<filename>
    router.post('/file', rawParser, (req, res) => {
        const key = getKeyFromAuth(req)
        if (!key) return res.status(401).json({ error: 'Missing or invalid Authorization header' })
        const dir = String(req.query.path || '').replace(/^\/+|\/+$/g, '')
        const name = String(req.query.name || '')
        if (!name) return res.status(400).json({ error: 'Missing name' })
        const full = (dir ? dir + '/' : '') + name
        const buf = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || [])
        try {
            set_file(key, full, buf)
            return res.json({ ok: true })
        } catch (e) {
            return res.status(500).json({ error: 'Failed to save file' })
        }
    })

    // Delete a file by path
    router.delete('/file', (req, res) => {
        const key = getKeyFromAuth(req)
        if (!key) return res.status(401).json({ error: 'Missing or invalid Authorization header' })
        const path = String(req.query.path || '').replace(/^\/+|\/+$/g, '')
        if (!path) return res.status(400).json({ error: 'Missing path' })
        const ok = delete_file(key, path)
        return res.json({ ok })
    })

    // Create a folder. Use ?path=<currentPath>&name=<folderName> or just ?path=<fullPath>
    router.post('/folder', (req, res) => {
        const key = getKeyFromAuth(req)
        if (!key) return res.status(401).json({ error: 'Missing or invalid Authorization header' })
        const base = String(req.query.path || '').replace(/^\/+|\/+$/g, '')
        const name = String(req.query.name || '')
        const full = name ? ((base ? base + '/' : '') + name) : base
        if (!full) return res.status(400).json({ error: 'Missing path or name' })
        const ok = create_folder(key, full)
        return res.json({ ok })
    })

    // Delete a folder recursively by full path
    router.delete('/folder', (req, res) => {
        const key = getKeyFromAuth(req)
        if (!key) return res.status(401).json({ error: 'Missing or invalid Authorization header' })
        const path = String(req.query.path || '').replace(/^\/+|\/+$/g, '')
        if (!path) return res.status(400).json({ error: 'Missing path' })
        const ok = delete_folder(key, path)
        return res.json({ ok })
    })

    // Share management
    router.post('/share', (req, res) => {
        const key = getKeyFromAuth(req)
        if (!key) return res.status(401).json({ error: 'Missing or invalid Authorization header' })
        const path = String(req.query.path || '').replace(/^\/+|\/+$/g, '')
        if (!path) return res.status(400).json({ error: 'Missing path' })
        try {
            const share = create_share(key, path)
            return res.json({ share })
        } catch (e) {
            return res.status(500).json({ error: 'Failed to create share' })
        }
    })

    router.delete('/share', (req, res) => {
        const key = getKeyFromAuth(req)
        if (!key) return res.status(401).json({ error: 'Missing or invalid Authorization header' })
        const hash = String(req.query.hash || '')
        if (!hash) return res.status(400).json({ error: 'Missing hash' })
        try {
            const ok = remove_share(key, hash)
            return res.json({ ok })
        } catch (e) {
            return res.status(500).json({ error: 'Failed to delete share' })
        }
    })

    // Move a file to another folder and/or rename it
    // Query params:
    // - from: full current file path (e.g., "a/b/file.txt")
    // - to: destination folder path (e.g., "a/c" or "" for root)
    // - name (optional): new filename (if omitted, keeps original filename)
    router.post('/move', (req, res) => {
        const key = getKeyFromAuth(req)
        if (!key) return res.status(401).json({ error: 'Missing or invalid Authorization header' })
        const from = String(req.query.from || '').replace(/^\/+|\/+$/g, '')
        // destination folder (can be empty string for root)
        const toFolder = String(req.query.to ?? '').replace(/^\/+|\/+$/g, '')
        if (!from) return res.status(400).json({ error: 'Missing from' })

        const originalBaseName = from.split('/').filter(Boolean).slice(-1)[0]
        let newName = originalBaseName
        if (typeof req.query.name === 'string') {
            const candidate = String(req.query.name).trim()
            if (!candidate) return res.status(400).json({ error: 'Invalid name' })
            if (candidate.includes('/')) return res.status(400).json({ error: 'Name cannot contain slashes' })
            newName = candidate
        }
        const dest = (toFolder ? toFolder + '/' : '') + newName

        if (dest === from) return res.json({ ok: true }) // no-op

        try {
            move_to(key, from, dest)
            return res.json({ ok: true })
        } catch (e) {
            return res.status(500).json({ error: 'Failed to move file' })
        }
    })

    // Public share download (no Authorization)
    router.get('/share/:hash', (req, res) => {
        const hash = String(req.params.hash || '')
        if (!hash) return res.status(400).json({ error: 'Missing hash' })
        const result = get_shared_blob(hash)
        if (!result) return res.status(404).json({ error: 'Not found' })
        const { blob, file_name } = result
        const name = file_name || 'download'
        res.setHeader('Content-Type', 'application/octet-stream')
        res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(name)}`)
        return res.send(blob)
    })

    return router
}
