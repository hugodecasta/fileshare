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
        jsonParser(req, res, () => {
            const header_token = req.headers['user']
            const user = new User(header_token)
            req.user = user.is_valid() ? user : null
            if (!req.user && !allow_non_auth) {
                return res.status(403).json({ error: 'Forbidden' })
            }
            req.file_user = new FileUser(header_token)
            return next()
        })
    }
}

const auth_mid_absolute = auth_middleware(false)


//#region .... login

api_router.get('/login', auth_middleware(true), jsonParser, async (req, res) => {
    if (req.user) {
        return res.status(200).json({ user: req.user })
    }
    else {
        return res.status(401).json({ error: 'Invalid credentials' })
    }
})

//#region ------------------------------------------------------------------- FILES MANAGEMENT




//#region .... list
api_router.get('/files/get_list', auth_mid_absolute, (req, res) => {
    const liste = req.file_user.get_file_list(true)
    return res.status(200).json({ files: liste })
})


//#region .... multer middleware
const multer_middleware = multer({
    dest: '/tmp/uploads',
    limits: { fileSize: 5 * 1024 * 1024 * 1024 } // 5GB
})

//#region .... dropper ep
api_router.post('/files/drop', auth_mid_absolute, multer_middleware.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' })
    }
    try {
        req.file_user.drop_file(req.file.originalname, req.file.path)
        return res.status(200).json({ message: 'File uploaded successfully' })
    } catch (err) {
        console.log(err)
        return res.status(500).json({ error: 'Failed to process file' })
    }
})

//#region .... delete
api_router.delete('/files/delete/:file_id', auth_mid_absolute, (req, res) => {
    try {
        req.file_user.delete_file(req.params.file_id)
        return res.status(200).json({ message: 'File deleted successfully' })
    } catch (err) {
        return res.status(500).json({ error: 'Failed to delete file' })
    }
})

//#region .... create SP
api_router.post('/share_point/create/:file_id', auth_mid_absolute, (req, res) => {
    const share_point = req.file_user.make_share_point(req.params.file_id)
    if (!share_point) {
        return res.status(404).json({ error: 'File not found or share point already exists' })
    }
    return res.status(200).json({ share_point })
})

//#region .... delete SP
api_router.delete('/share_point/delete/:file_id', auth_mid_absolute, (req, res) => {
    const success = req.file_user.delete_share_point(req.params.file_id)
    if (!success) {
        return res.status(404).json({ error: 'File not found or share point does not exist' })
    }
    return res.status(200).json({ message: 'Share point deleted successfully' })
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
        console.log(err)
        return res.status(500).json({ error: 'Failed to retrieve file' })
    }
})

//#region ------------------------------------------------------------------- SHARE ACCESS

file_router.get('/share/:share_point', (req, res) => {
    const share_point = req.params.share_point
    const share_list = FileUser.get_share_file()
    if (!share_list[share_point]) {
        return res.status(404).json({ error: 'Share point not found' })
    }
    const share_data = share_list[share_point]
    const { file_id, user_id, name } = share_data
    const file_user = new FileUser(user_id)
    const file_path = file_user.get_file_path(file_id)
    if (!file_path) {
        return res.status(404).json({ error: 'File not found' })
    }
    res.setHeader('Content-Disposition', `attachment; filename="${name}"`)
    res.sendFile(file_path)
})