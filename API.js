import express, { json } from 'express'
import multer from 'multer'
import FileUser from './filesystem.js'
import User from './auth.js'

//#region ------------------------------------------------------------------- SETUP

export const api_router = express.Router()
export const file_router = express.Router()

const jsonParser = express.json()

//#region ------------------------------------------------------------------- MAIN ENTRY

api_router.get('/', (req, res) => {
    res.status(200).json({ message: 'API is working!' })
})

//#region ------------------------------------------------------------------- AUTH




//#region .... middleware
function auth_middleware(allow_non_auth = false) {
    return function (req, res, next) {
        const user = User(req.user_token)
        req.user = user.is_valid() ? user : null
        if (!user && !allow_non_auth) {
            return res.status(403).json({ error: 'Forbidden' })
        }
        req.file_user = FileUser(req.user_token)
        return next()
    }
}

const auth_mid_absolute = auth_middleware(false)


//#region .... login

api_router.get('/login', auth_middleware(true), jsonParser, async (req, res) => {
    if (req.user) {
        return res.status(200).json({ user: req.user.to_json() })
    }
    else {
        return res.status(401).json({ error: 'Invalid credentials' })
    }
})

//#region ------------------------------------------------------------------- FILES MANAGEMENT




//#region .... list
api_router.get('/files/get_list', auth_mid_absolute, (req, res) => {
    const liste = req.file_user.get_file_list()
    return res.status(200).json({ files: liste })
})


//#region .... multer middleware
const multer_middleware = multer({
    dest: '/tmp/uploads',
    limits: { fileSize: 5 * 1024 * 1024 * 1024 } // 5GB
})

//#region .... dropper ep
api_router.post('/files/upload', auth_mid_absolute, multer_middleware.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' })
    }
    try {
        req.file_user.drop_file(req.file.filename, req.file.path)
        return res.status(200).json({ message: 'File uploaded successfully' })
    } catch (err) {
        return res.status(500).json({ error: 'Failed to process file' })
    }
})

//#region .... delete
api_router.delete('/files/delete', auth_mid_absolute, jsonParser, (req, res) => {
    if (!req.body.file_id) {
        return res.status(400).json({ error: 'Filename is required' })
    }
    try {
        req.file_user.delete_file(req.body.file_id)
        return res.status(200).json({ message: 'File deleted successfully' })
    } catch (err) {
        return res.status(500).json({ error: 'Failed to delete file' })
    }
})

//#region ------------------------------------------------------------------- FILES ACCESS

file_router.get('/:file_id', auth_mid_absolute, (req, res) => {
    const file_id = req.params.file_id
    try {
        const file_path = req.file_user.get_file_path(file_id)
        if (!file_path) {
            return res.status(404).json({ error: 'File not found' })
        }
        res.sendFile(file_path)
    } catch (err) {
        return res.status(500).json({ error: 'Failed to retrieve file' })
    }
})