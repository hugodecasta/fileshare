import fs from 'fs'
import { scryptSync, randomBytes, createCipheriv, createDecipheriv } from 'crypto'
import { get } from 'http'
import { create } from 'domain'

//#region ------------------------------------------------------------------------- data

const MAIN_DIR = './__datav2'
if (!fs.existsSync(MAIN_DIR)) {
    fs.mkdirSync(MAIN_DIR)
}

//#region ------------------------------------------------------------------------- crypto

function toBase64Url(buf) {
    return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function fromBase64Url(str) {
    let s = String(str).replace(/-/g, '+').replace(/_/g, '/')
    const pad = s.length % 4
    if (pad) s += '='.repeat(4 - pad)
    return Buffer.from(s, 'base64')
}

function hash(str) {
    const bytes = Buffer.from(String(str), 'utf8')
    const FNV_OFFSET = 0xcbf29ce484222325n
    const FNV_PRIME = 0x100000001b3n
    const MASK = 0xffffffffffffffffn
    let h1 = FNV_OFFSET
    for (let i = 0; i < bytes.length; i++) {
        h1 ^= BigInt(bytes[i])
        h1 = (h1 * FNV_PRIME) & MASK
    }
    let h2 = FNV_OFFSET
    for (let i = bytes.length - 1; i >= 0; i--) {
        h2 ^= BigInt(bytes[i])
        h2 = (h2 * FNV_PRIME) & MASK
    }
    const toHex64 = n => n.toString(16).padStart(16, '0')
    const hstr = toHex64(h1) + toHex64(h2)
    return hstr
}

// Deterministic; no random salt/iv.
const SCRYPT_SALT = Buffer.from('file_engine_v1_fixed_salt')

function deriveKeyIv(key) {
    const d = scryptSync(String(key), SCRYPT_SALT, 44) // 32 key + 12 iv
    return { k: d.subarray(0, 32), iv: d.subarray(32, 44) }
}

// Cache key/iv derivation to avoid expensive scryptSync per call
const __keyIvCache = new Map()
function getKeyIvCached(key) {
    const kstr = String(key)
    let kv = __keyIvCache.get(kstr)
    if (!kv) {
        kv = deriveKeyIv(kstr)
        __keyIvCache.set(kstr, kv)
    }
    return kv
}

function string_encrypt(str, key) {
    const { k, iv } = getKeyIvCached(key)
    const cipher = createCipheriv('aes-256-gcm', k, iv)
    const ciphertext = Buffer.concat([cipher.update(String(str), 'utf8'), cipher.final()])
    const tag = cipher.getAuthTag() // 16 bytes
    const out = Buffer.allocUnsafe(tag.length + ciphertext.length)
    tag.copy(out, 0)
    ciphertext.copy(out, tag.length)
    return toBase64Url(out)
}

function string_decrypt(encoded, key) {
    const data = fromBase64Url(encoded)
    const tag = data.subarray(0, 16)
    const text = data.subarray(16)
    const { k, iv } = getKeyIvCached(key)
    const decipher = createDecipheriv('aes-256-gcm', k, iv)
    decipher.setAuthTag(tag)
    const plaintext = Buffer.concat([decipher.update(text), decipher.final()])
    return plaintext.toString('utf8')
}

function encrypt_blob(buf, key) {
    const { k, iv } = deriveKeyIv(key)
    const cipher = createCipheriv('aes-256-gcm', k, iv)
    const ciphertext = Buffer.concat([cipher.update(buf), cipher.final()])
    const tag = cipher.getAuthTag()
    return Buffer.concat([tag, ciphertext])
}

function decrypt_blob(encrypted_buf, key) {
    const tag = encrypted_buf.subarray(0, 16)
    const text = encrypted_buf.subarray(16)
    const { k, iv } = deriveKeyIv(key)
    const decipher = createDecipheriv('aes-256-gcm', k, iv)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(text), decipher.final()])
}

//#region ------------------------------------------------------------------------- location

function decrypt_location(key, enc_location, force_file = true) {
    const base = hash(key) + (force_file ? '/files/' : '/')
    const sp = enc_location.split(base)[1].split('/')
    return sp.map(part => string_decrypt(part, key)).join('/')
}

function get_true_location(key, location, force_file = true) {
    const sp = location.split('/').filter(Boolean)
    const base = hash(key) + (force_file ? '/files/' : '/')
    return `${MAIN_DIR}/${base}${sp.map(part => string_encrypt(part, key)).join('/')}`
}

function get_location_hash(key, location) {
    const true_location = get_true_location(key, location)
    return hash(true_location)
}

//#region ------------------------------------------------------------------------- share

const SHARE_PATH = `${MAIN_DIR}/shares.json`

function ensure_share_file() {
    if (!fs.existsSync(SHARE_PATH)) {
        fs.writeFileSync(SHARE_PATH, JSON.stringify({}, null, 4))
    }
}

export function location_is_shared(key, location) {
    return get_share_info(key, location) !== null
}

function get_share_info(key, location) {
    ensure_share_file()
    const location_hash = get_location_hash(key, location)
    const shares = JSON.parse(fs.readFileSync(SHARE_PATH, 'utf8'))
    if (shares.hasOwnProperty(location_hash)) {
        return shares[location_hash]
    }
    return null
}

function create_share_redirect(share_hash, redirect_to_hash) {
    ensure_share_file()
    const shares = JSON.parse(fs.readFileSync(SHARE_PATH, 'utf8'))
    if (shares.hasOwnProperty(redirect_to_hash)) {
        shares[share_hash] = {
            redirect: redirect_to_hash
        }
        shares[redirect_to_hash].redirected_from ??= []
        shares[redirect_to_hash].redirected_from.push(share_hash)
        fs.writeFileSync(SHARE_PATH, JSON.stringify(shares, null, 4))
        return true
    }
    return false
}

export function create_share(key, location) {

    ensure_share_file()
    const shares = JSON.parse(fs.readFileSync(SHARE_PATH, 'utf8'))

    const true_location = get_true_location(key, location)
    const location_hash = get_location_hash(key, location)

    const file_name = location.split('/').slice(-1)[0]

    const public_key = randomBytes(16).toString('hex')
    const blob = get_blob(key, location, false)
    const enc_blob = encrypt_blob(blob, public_key)
    fs.writeFileSync(true_location, enc_blob)

    shares[location_hash] = {
        name: file_name,
        is_directory: false,
        hash: location_hash,
        is_shared: true,
        true_location: true_location,
        user_hashed_key: hash(key),
        key: public_key
    }
    fs.writeFileSync(SHARE_PATH, JSON.stringify(shares, null, 4))
    return location_hash
}

export function remove_share(key, location_hash) {
    ensure_share_file()
    const shares = JSON.parse(fs.readFileSync(SHARE_PATH, 'utf8'))
    if (shares.hasOwnProperty(location_hash)) {
        if (shares[location_hash].redirected_from) {
            for (const redir_hash of shares[location_hash].redirected_from) {
                delete shares[redir_hash]
            }
        }
        delete shares[location_hash]
        fs.writeFileSync(SHARE_PATH, JSON.stringify(shares, null, 4))
        return true
    }
    return false
}

export function get_shared_blob(share_hash) {
    ensure_share_file()
    const shares = JSON.parse(fs.readFileSync(SHARE_PATH, 'utf8'))
    if (shares.hasOwnProperty(share_hash)) {
        const share_info = shares[share_hash]
        if (share_info.redirect) {
            return get_shared_blob(share_info.redirect)
        }
        const encrypted_blob = fs.readFileSync(share_info.true_location)
        add_file_download(share_info.user_hashed_key, share_hash)
        const blob = decrypt_blob(encrypted_blob, share_info.key)
        const file_name = share_info.name
        return { blob, file_name }
    }
    return null
}

//#region ------------------------------------------------------------------------- file info

function get_infos_location(hashed_key) {
    return `${MAIN_DIR}/${hashed_key}/infos.json`
}

export function get_user_infos(key) {
    const true_location = get_infos_location(hash(key))
    if (!fs.existsSync(true_location)) {
        return {}
    }
    const infos = JSON.parse(fs.readFileSync(true_location, 'utf8'))
    return infos
}

export function set_user_infos(key, infos) {
    const true_location = get_infos_location(hash(key))
    fs.writeFileSync(true_location, JSON.stringify(infos, null, 4), 'utf8')
    return true
}

export function set_file_info(key, location, info_obj) {
    const infos = get_user_infos(key)
    const location_hash = get_location_hash(key, location)
    if (info_obj === null) delete infos[location_hash]
    else {
        infos[location_hash] = {
            downloads: [],
            ...infos[location_hash],
            ...info_obj
        }
    }
    set_user_infos(key, infos)
    return true
}

export function user_full_size(key) {
    const infos = get_user_infos(key)
    const total = Object.values(infos).reduce((acc, info) => acc + (info.size || 0), 0)
    return total
}

export function get_file_info(key, location) {
    const infos = get_user_infos(key)
    const location_hash = get_location_hash(key, location)
    return infos[location_hash] || null
}

export function add_file_download(user_hashed_key, location_hash) {
    const infos_path = get_infos_location(user_hashed_key)
    if (!fs.existsSync(infos_path)) {
        return false
    }
    const infos = JSON.parse(fs.readFileSync(infos_path, 'utf8'))
    if (!infos.hasOwnProperty(location_hash)) {
        return false
    }
    infos[location_hash].downloads.push(Date.now())
    fs.writeFileSync(infos_path, JSON.stringify(infos, null, 4), 'utf8')
    return true
}

//#region ------------------------------------------------------------------------- tree

export function get_tree(key, location) {
    const true_location = get_true_location(key, location)
    if (!fs.existsSync(true_location)) {
        return null
    }
    const items = fs.readdirSync(true_location, { withFileTypes: true })
    const item_names = items.map(item => {
        const is_dir = item.isDirectory()
        const name = string_decrypt(item.name, key)
        const location_hash = get_location_hash(key, location + '/' + name)
        const is_shared = location_is_shared(key, location + '/' + name)
        return {
            name: name,
            is_directory: is_dir,
            hash: location_hash,
            is_shared: is_shared,
            ...get_file_info(key, location + '/' + name)
        }
    })
    return item_names
}

export function user_exists(key) {
    const user_dir = `${MAIN_DIR}/${hash(key)}`
    return fs.existsSync(user_dir)
}

//#region ------------------------------------------------------------------------- file

export function set_file(key, location, blob) {
    const true_location = get_true_location(key, location)
    const dir = true_location.split('/').slice(0, -1).join('/')
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
    }
    fs.writeFileSync(true_location, encrypt_blob(blob, key))
    set_file_info(key, location, {
        size: blob.length,
        time: Date.now()
    })
    return true
}

export function get_blob(key, location, is_download = true) {
    const true_location = get_true_location(key, location)
    if (!fs.existsSync(true_location)) {
        return null
    }
    const encrypted_blob = fs.readFileSync(true_location)
    let dec_key = key
    if (location_is_shared(key, location)) {
        const share_info = get_share_info(key, location)
        dec_key = share_info.key
    }
    if (is_download) {
        add_file_download(hash(key), get_location_hash(key, location))
    }
    return decrypt_blob(encrypted_blob, dec_key)
}

export function delete_file(key, location) {
    const true_location = get_true_location(key, location)
    if (fs.existsSync(true_location)) {
        fs.unlinkSync(true_location)
        if (location_is_shared(key, location)) {
            const loc_hash = get_location_hash(key, location)
            remove_share(key, loc_hash)
        }
        set_file_info(key, location, null)
        return true
    }
    return false
}

//#region ------------------------------------------------------------------------- folder

export function create_folder(key, location) {
    const true_location = get_true_location(key, location)
    if (!fs.existsSync(true_location)) {
        fs.mkdirSync(true_location, { recursive: true })
        return true
    }
    return false
}

export function delete_folder(key, location) {
    const tree = get_tree(key, location)
    for (const item of tree) {
        if (item.is_directory) {
            delete_folder(key, location + '/' + item.name)
        } else {
            delete_file(key, location + '/' + item.name)
        }
    }
    const true_location = get_true_location(key, location)
    fs.rmSync(true_location, { recursive: true })
    return true
}

//#region ------------------------------------------------------------------------- user


export function create_user() {
    const user_id = randomBytes(16).toString('hex')
    const location = get_true_location(user_id, '')
    fs.mkdirSync(location, { recursive: true })
    return user_id
}

export function clear_user(key) {
    delete_folder(key, '')
    const location = get_true_location(key, '', false)
    fs.rmSync(location, { recursive: true })
    return false
}

//#region ------------------------------------------------------------------------- refactor

const OLD_DIR = './__data'

function refactor_old_user(uid) {

    console.log('refactoring user:', uid)

    const old_share = JSON.parse(fs.readFileSync(OLD_DIR + '/share.json', 'utf8'))

    const file_list = fs.readdirSync(OLD_DIR + '/' + uid + '/files', { withFileTypes: false })
    const list = JSON.parse(fs.readFileSync(OLD_DIR + '/' + uid + '/list.json', 'utf8'))

    for (const file_name of file_list) {

        const blob = fs.readFileSync(OLD_DIR + '/' + uid + '/files/' + file_name)

        const file_info = list[file_name] || {}
        const base_file_name = file_info.name
        const downloads = file_info.downloads || []
        const time = file_info.time || Date.now()
        const share_point = file_info.share_point || null

        const location = base_file_name
        console.log('migrating file:', base_file_name)

        set_file(uid, location, blob)
        set_file_info(uid, location, {
            size: blob.length,
            time: time,
            downloads: downloads,

        })

        if (share_point !== null && old_share.hasOwnProperty(share_point)) {
            console.log('creating share for', base_file_name)
            const share_hash = create_share(uid, location)
            console.log('share hash:', share_hash)
            console.log('redirecting old share point', share_point, 'to', share_hash)
            create_share_redirect(share_point, share_hash)
        }

    }

    console.log('migration done for user', uid)
    console.log(get_tree(uid, ''))
}

export function refactor_all() {
    const user_list = fs.readdirSync(OLD_DIR, { withFileTypes: true })
    for (const uid of user_list) {
        if (uid.isDirectory()) {
            refactor_old_user(uid.name)
        }
    }
}

//#region -------------------------------------------------------------------------


// refactor_old_user('30b8fb72-4760-4baa-8605-dd69aa5b7b1b')
// console.log('get tree...')
// console.log(get_tree('30b8fb72-4760-4baa-8605-dd69aa5b7b1b', ''))

// const uid = create_user()
// console.log(uid, user_full_size(uid))
// set_file(uid, 'ezfezf.txt', Buffer.from('efregefre'))
// set_file(uid, 'folder1/file1.txt', Buffer.from('Hello World!'))
// set_file(uid, 'folder1/file2.txt', Buffer.from('Hello World!'))
// console.log(get_tree(uid, ''))
// console.log(get_tree(uid, 'folder1'))

// console.log(get_blob(uid, 'folder1/file1.txt').toString('utf8'))

// const share_hash = create_share(uid, 'folder1/file1.txt')
// console.log(get_tree(uid, 'folder1'))
// console.log(get_shared_blob(share_hash).toString('utf8'))

// console.log(get_blob(uid, 'folder1/file1.txt').toString('utf8'))

// console.log('full_size', user_full_size(uid))

// console.log(get_user_infos(uid))

// create_share_redirect('CACA', share_hash)
// console.log('redirect created:')
// console.log(get_shared_blob('CACA').toString('utf8'))

// console.log(get_tree(uid, 'folder1'))

// clear_user(uid)