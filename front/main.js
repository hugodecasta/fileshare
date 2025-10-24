import { alink, br, button, div, file_drop_div, h2, hr, input, span } from './vanille/components.js'
import { DATABASE } from './vanille/db_sytem/database.js'
import { click_link, delete_endpoint, get_json, post_json } from './vanille/fetch_utils.js'
import { pending_promise } from './vanille/promises.js'

const user_db = new DATABASE('user_db', { token: null })
const user = user_db.object

// --- Helpers: URL-safe Base64 encode/decode (unicode-safe)
function b64url_encode(str) {
    // Encode to UTF-8 bytes, then to base64, then URL-safe
    const utf8 = new TextEncoder().encode(str)
    let bin = ''
    for (const b of utf8) bin += String.fromCharCode(b)
    const b64 = btoa(bin)
    return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

// --- Hash helpers: keep key and folder path in the hash as k=<b64key>&p=<path>
function parse_hash_params() {
    const raw = (window.location.hash || '').replace(/^#/, '')
    const params = new URLSearchParams(raw)
    const k = params.get('k') || null
    // URLSearchParams decodes automatically
    const p = params.get('p') || ''
    return { k, p }
}

function set_hash_params({ k = null, p = null } = {}) {
    const params = new URLSearchParams()
    if (k) params.set('k', k)
    if (p) params.set('p', p)
    const next = params.toString()
    if (('#' + next) !== window.location.hash) window.location.hash = next
}

function sanitize_path(path) {
    // Normalize, remove leading/trailing slashes and .. segments
    return (path || '')
        .split('/')
        .filter(Boolean)
        .filter(seg => seg !== '.' && seg !== '..')
        .join('/')
}

function b64url_decode(b64url) {
    try {
        let b64 = b64url.replace(/-/g, '+').replace(/_/g, '/')
        // pad to multiple of 4
        while (b64.length % 4) b64 += '='
        const bin = atob(b64)
        const bytes = new Uint8Array([...bin].map(c => c.charCodeAt(0)))
        return new TextDecoder().decode(bytes)
    } catch (_) {
        return null
    }
}

// Root container
const app = div()
    .add2b()
    .set_style({
        fontFamily: 'Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, "Noto Sans", "Apple Color Emoji", "Segoe UI Emoji"',
        color: '#111827',
        background: '#f8fafc',
        minHeight: '100vh',
        boxSizing: 'border-box',
        overflowX: 'hidden'
    })

// Header with brand + connect
const header = div('')
    .add2(app)
    .set_style({
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px',
        flexWrap: 'wrap',
        padding: '16px 24px',
        borderBottom: '1px solid #e5e7eb',
        position: 'sticky',
        top: '0',
        background: '#ffffff',
        zIndex: 10,
        boxSizing: 'border-box'
    })

const brand = div()
    .add2(header)
    .add(
        span('Fileshare').set_style({ fontWeight: 700, fontSize: '21px', letterSpacing: '0.2px' })
    )

const connect_bar = div('')
    .add2(header)
    .set_style({ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', width: '100%', justifyContent: 'flex-end' })

const input_connect = input(user.token ?? '', "password", (token) => connect(token), true, false)
    .set_attributes({ name: 'password', placeholder: 'User key' })
    .set_style({
        height: '36px',
        padding: '0 12px',
        border: '1px solid #d1d5db',
        borderRadius: '8px',
        background: '#fff',
        outline: 'none',
        flex: '1 1 180px',
        minWidth: '0',
        maxWidth: '100%'
    })

const connect_btn = button('Connect', () => connect(input_connect.value))
    .set_style({
        height: '36px',
        padding: '0 14px',
        borderRadius: '8px',
        border: '1px solid #111827',
        background: '#111827',
        color: '#fff',
        cursor: 'pointer'
    })

// Secondary button to copy URL with key and current path in hash
const key_url_btn = button('key url', () => {
    const token = (user.token ?? input_connect.value ?? '').trim()
    if (!token) {
        alert('No key to copy. Enter your key first.')
        return
    }
    const key = b64url_encode(token)
    // Try to keep current path from hash; dashboard updates it as p=
    const { p } = parse_hash_params()
    const params = new URLSearchParams()
    params.set('k', key)
    if (p) params.set('p', p)
    const url = `${window.location.origin}${window.location.pathname}#${params.toString()}`
    navigator.clipboard.writeText(url)

    // Optional light feedback
    key_url_btn.set_style({ opacity: 0.7 })
    setTimeout(() => key_url_btn.set_style({ opacity: null }), 250)
})
    .set_style({
        height: '36px',
        padding: '0 10px',
        borderRadius: '8px',
        border: '1px solid #d1d5db',
        background: 'transparent',
        color: '#111827',
        cursor: 'pointer'
    })

connect_bar.add(input_connect, connect_btn, key_url_btn)

// Main content wrapper
const container = div()
    .add2(app)
    .set_style({
        maxWidth: '1100px',
        margin: '0 auto',
        padding: '20px',
        width: '100%',
        boxSizing: 'border-box'
    })

const main_view = div()
    .add2(container)
    .add('Not connected yet')
    .set_style({ paddingTop: '8px' })

// If a base64 key is present in the URL hash, decode and connect
function try_connect_from_hash() {
    const raw = (window.location.hash || '').replace(/^#/, '')
    const { k } = parse_hash_params()
    const token_b64 = k || raw || null
    if (!token_b64) return false
    const decoded = b64url_decode(token_b64)
    if (!decoded) return false
    input_connect.value = decoded
    connect(decoded)
    return true
}

if (!(try_connect_from_hash()) && user.token) {
    connect(user.token)
}

function auth_headers(token) {
    return { 'Authorization': b64url_encode(token) }
}

async function user_get(endpoint, token) {
    return await get_json(endpoint, {
        headers: auth_headers(token)
    })
}

async function connect(token) {
    main_view.clear().add('Connecting...')
    const ok = await user_get('/api/login', token)
    if (ok.error) {
        main_view.clear().add(ok.error)
        return
    }
    user.token = token
    // Ensure the hash contains the key so reloads keep you connected
    const { p } = parse_hash_params()
    set_hash_params({ k: b64url_encode(token), p: sanitize_path(p) })
    // Pass initial total user size from login response + initial path from hash
    const { p: p2 } = parse_hash_params()
    create_dashboard(token, ok.size, sanitize_path(p2))
}

//#region ------------------------------------------------------ FILE COMP

function comvert_size_to_display(size) {
    if (size == null) return '?B'
    if (size < 1024) return size + ' B'
    if (size < 1024 * 1024) return (size / 1024).toFixed(2) + ' KB'
    if (size < 1024 * 1024 * 1024) return (size / (1024 * 1024)).toFixed(2) + ' MB'
    return (size / (1024 * 1024 * 1024)).toFixed(2) + ' GB'
}

// Try to fix UTF-8 bytes interpreted as Latin-1 (e.g. "accÃ¨s" -> "accès")
function fix_mojibake_utf8(str) {
    if (typeof str !== 'string') return str
    if (!/[ÃÂ]/.test(str)) return str
    try {
        const bytes = new Uint8Array([...str].map(c => c.charCodeAt(0)))
        const decoded = new TextDecoder('utf-8').decode(bytes)
        return decoded
    } catch (_) {
        try {
            // Fallback using deprecated escape/unescape trick if needed
            return decodeURIComponent(escape(str))
        } catch {
            return str
        }
    }
}

function share_point_comp(file_path, file, user_token, cb) {

    function copy_share_link(share_point) {
        const share_link = window.location.origin + '/api/share/' + share_point
        navigator.clipboard.writeText(share_link)
        alert('Share link copied to clipboard !')

    }

    const wrap = div()
        .set_style({ display: 'flex', gap: '8px', flexWrap: 'wrap' })
        .add(
            file.is_shared ? button(
                'Delete share point',
                async () => {
                    if (!confirm('Delete share point for file "' + file.name + '" ?')) return
                    await delete_endpoint(`/api/share?hash=${encodeURIComponent(file.hash)}`, { headers: auth_headers(user_token) })
                    cb()
                }
            ).set_style({
                padding: '6px 10px',
                borderRadius: '8px',
                border: '1px solid #ef4444',
                background: '#fff',
                color: '#ef4444',
                cursor: 'pointer'
            }) : null,
            file.is_shared ? button(
                'Copy share link',
                async () => {
                    copy_share_link(file.hash)
                }
            ).set_style({
                padding: '6px 10px',
                borderRadius: '8px',
                border: '1px solid #d1d5db',
                background: '#fff',
                color: '#111827',
                cursor: 'pointer'
            }) : null,
            !file.is_shared ? button('Create share point', async () => {
                const res = await post_json(`/api/share?path=${encodeURIComponent(file_path)}`, {}, {
                    headers: auth_headers(user_token)
                })
                const share_point = res.share
                copy_share_link(share_point)
                cb()
            }).set_style({
                padding: '6px 10px',
                borderRadius: '8px',
                border: '1px solid #111827',
                background: '#111827',
                color: '#fff',
                cursor: 'pointer'
            }) : null
        )
    return wrap
}

function file_comp(file_path, file, user_token, cb, view_dir) {
    const display_name = fix_mojibake_utf8(file.name ?? '')
    const card = div()
        .add(
            //#region .... DOWNLOAD LINK
            alink('javascript:void(0)', '', display_name)
                .set_style({
                    fontSize: '17px',
                    fontWeight: 600,
                    color: '#0f172a',
                    textDecoration: 'none',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    maxWidth: '100%'
                })
                .block().margin({ bottom: 6 })
                .set_attributes({ title: display_name })
                .on('click', (e) => e.preventDefault())
                .set_click(async () => {
                    // Fetch inline view (preserves MIME type) and open in a new tab without forcing download
                    const response = await fetch(`/api/view?path=${encodeURIComponent(file_path)}`, {
                        method: 'GET',
                        headers: auth_headers(user_token)
                    })
                    if (!response.ok) {
                        try {
                            const j = await response.json()
                            alert(j?.error || 'Failed to open file')
                        } catch (_) {
                            alert('Failed to open file')
                        }
                        return
                    }
                    const blob = await response.blob()
                    const url = window.URL.createObjectURL(blob)
                    // Open in a new tab (no download attribute so browser renders inline)
                    click_link(url, '_blank')
                    // Give the server a moment to record the access and then refresh
                    setTimeout(cb, 500)
                }),
            //#region .... DISP
            span(comvert_size_to_display(file.size) + ' · ' + file.downloads.length + ' download(s)')
                .set_style({ color: '#6b7280', fontSize: '13px' }),
            br(),
            (file.time ? new Date(file.time).toLocaleString() : 'time unknown'),
            br(),
            //#region .... Share point
            share_point_comp(file_path, file, user_token, cb).margin({ top: 6, bottom: 6 }),
            //#region .... MOVE
            (() => {
                const controls = div().set_style({ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' })
                const move_menu = div()
                    .set_style({
                        display: 'none',
                        marginTop: '6px',
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px',
                        background: '#fff',
                        boxShadow: '0 2px 8px rgba(16,24,40,0.12)',
                        padding: '6px',
                    })

                async function toggle_move_menu() {
                    if (move_menu.__open) {
                        move_menu.__open = false
                        move_menu.set_style({ display: 'none' })
                        move_menu.clear()
                        return
                    }
                    // open and populate
                    move_menu.__open = true
                    move_menu.set_style({ display: 'block' })
                    move_menu.clear().add(span('Move to:').set_style({ color: '#374151', fontSize: '13px', fontWeight: 600 }))

                    const file_dir = file_path.split('/').slice(0, -1).join('/')
                    const current_dir = view_dir ?? ''
                    try {
                        const items = await user_get(`/api/tree?path=${encodeURIComponent(current_dir)}`, user_token)
                        const folders = (items || []).filter(i => i.is_directory)

                        const add_option = (label, destFolder) => {
                            const opt = button(label, async () => {
                                // Build destination full folder path; server keeps filename
                                const to = destFolder // may be '' for root
                                try {
                                    const resp = await fetch(`/api/move?from=${encodeURIComponent(file_path)}&to=${encodeURIComponent(to)}`, {
                                        method: 'POST',
                                        headers: auth_headers(user_token)
                                    })
                                    try { await resp.json() } catch (_) { }
                                } catch (e) { console.error('Move failed', e) }
                                move_menu.__open = false
                                move_menu.set_style({ display: 'none' })
                                await cb()
                            })
                                .set_style({
                                    display: 'block',
                                    width: '100%',
                                    textAlign: 'left',
                                    padding: '6px 8px',
                                    borderRadius: '6px',
                                    border: '1px solid #d1d5db',
                                    background: '#fff',
                                    color: '#111827',
                                    cursor: 'pointer'
                                })
                                .margin({ top: 6 })
                            move_menu.add(opt)
                        }

                        // Root option (skip if already in root)
                        if (current_dir !== '') add_option('Root', '')
                        // Up one step into current folder (if file is inside a subfolder of the current view)
                        if (file_dir !== current_dir) {
                            // label as "../" to indicate moving up one step to the current folder
                            add_option('../', current_dir)
                        }
                        // Immediate subfolders of current view directory
                        for (const f of folders) add_option(`/${f.name}`, (current_dir ? current_dir + '/' : '') + f.name)
                        if (folders.length === 0 && current_dir === '') {
                            move_menu.add(span('No folders here').set_style({ color: '#6b7280', fontSize: '12px' }))
                        }
                    } catch (e) {
                        console.error('Move menu load failed', e)
                        move_menu.add(span('Failed to list folders').set_style({ color: '#ef4444', fontSize: '12px' }))
                    }
                }

                const move_btn = button('Move', toggle_move_menu).set_style({
                    padding: '6px 10px',
                    borderRadius: '8px',
                    border: '1px solid #d1d5db',
                    background: '#fff',
                    color: '#111827',
                    cursor: 'pointer'
                })

                return div().add(move_btn, move_menu).margin({ top: 6, bottom: 6 })
            })(),
            //#region .... DELETE
            button('Delete', async () => {
                if (!confirm('Delete file "' + display_name + '" ?')) return
                await fetch(`/api/file?path=${encodeURIComponent(file_path)}`, {
                    method: 'DELETE',
                    headers: auth_headers(user_token)
                })
                cb()
            }).set_style({
                padding: '6px 10px',
                borderRadius: '8px',
                border: '1px solid #ef4444',
                background: '#fff',
                color: '#ef4444',
                cursor: 'pointer'
            })
        )
        .padding(12).margin(8).set_style({
            border: '1px solid #e5e7eb',
            borderRadius: '12px',
            background: '#ffffff',
            boxShadow: '0 1px 2px rgba(16,24,40,0.04)',
            minWidth: '0'
        })
    return card
}

//#region ------------------------------------------------------ DASHBOARD
function create_dashboard(user_token, initial_total_size = null, initial_path = '') {

    const account_stats = div()
        .set_style({ color: '#374151', fontSize: '14px' })

    // Total user size element shown next to "Your files"
    const total_size_elm = span(
        initial_total_size == null ? '' : ` (Total: ${comvert_size_to_display(initial_total_size)})`
    ).set_style({ color: '#6b7280', fontSize: '14px', fontWeight: 500 })

    main_view.clear().add(
        div().set_style({
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '14px',
            gap: '8px',
            flexWrap: 'wrap'
        }).add(
            div().add(
                h2('Your files').set_style({ fontSize: '19px', margin: 0, display: 'inline' }),
                total_size_elm
            ),
            account_stats
        )
    )

    //#region .... TREE + BREADCRUMBS
    const list_elm = div()
        .set_style({
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: '14px'
        })

    let current_path = sanitize_path(initial_path || '')

    // Keep hash in sync with navigation (preserve key)
    function sync_hash_path() {
        const { k } = parse_hash_params()
        set_hash_params({ k, p: current_path })
    }

    const breadcrumbs = div()
        .set_style({ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center', marginBottom: '8px' })

    const folder_actions = div()
        .set_style({ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' })
        .add(
            button('New folder', async () => {
                const name_raw = prompt('New folder name?')
                if (name_raw == null) return
                const name = String(name_raw).trim()
                if (!name) return
                if (/[\/]/.test(name)) {
                    alert('Folder name cannot contain slashes')
                    return
                }
                const resp = await fetch(`/api/folder?path=${encodeURIComponent(current_path)}&name=${encodeURIComponent(name)}`,
                    { method: 'POST', headers: auth_headers(user_token) })
                try {
                    const json = await resp.json()
                    if (!json.ok) alert('Could not create folder (maybe it already exists)')
                } catch (_) { }
                update_tree()
            }).set_style({
                padding: '6px 10px',
                borderRadius: '8px',
                border: '1px solid #111827',
                background: '#111827',
                color: '#fff',
                cursor: 'pointer'
            })
        )

    function render_breadcrumbs() {
        const parts = current_path.split('/').filter(Boolean)
        const elems = []
        let accum = ''
        elems.push(
            alink('javascript:void(0)', '', 'Root')
                .on('click', (e) => e.preventDefault())
                .set_style({ color: '#111827' })
                .set_click(() => {
                    current_path = ''
                    set_hash_params({ k: parse_hash_params().k, p: '' })
                    // Force reload to honor request: reload with that hash
                    location.reload()
                })
        )
        for (let i = 0; i < parts.length; i++) {
            const p = parts[i]
            accum += (accum ? '/' : '') + p
            const p_path = accum
            elems.push(span('/').set_style({ color: '#9ca3af' }))
            elems.push(
                alink('javascript:void(0)', '', p)
                    .on('click', (e) => e.preventDefault())
                    .set_click(() => {
                        current_path = p_path
                        set_hash_params({ k: parse_hash_params().k, p: current_path })
                        location.reload()
                    })
            )
        }
        breadcrumbs.clear().add(...elems)
    }

    // Helper to refresh total user size from server
    async function refresh_total_size() {
        try {
            const res = await user_get('/api/login', user_token)
            if (!res || res.error) return
            total_size_elm.clear().add(` (Total: ${comvert_size_to_display(res.size)})`)
        } catch (_) { /* ignore */ }
    }

    async function update_tree() {
        render_breadcrumbs()
        const items = await user_get(`/api/tree?path=${encodeURIComponent(current_path)}`, user_token)
        // Split and sort: folders by name (A→Z), files by date (older→newer)
        const files = items
            .filter(i => !i.is_directory)
            .sort((a, b) => {
                const ta = a?.time ?? 0
                const tb = b?.time ?? 0
                if (ta !== tb) return ta - tb // older first
                return (a?.name || '').localeCompare(b?.name || '', undefined, { sensitivity: 'base' })
            })
        const folders = items
            .filter(i => i.is_directory)
            .sort((a, b) => (a?.name || '').localeCompare(b?.name || '', undefined, { sensitivity: 'base' }))
        const total_size = files.reduce((acc, f) => acc + (f.size ?? 0), 0)
        account_stats.clear().add(
            span(`${folders.length} folder${folders.length !== 1 ? 's' : ''} · ${files.length} file${files.length !== 1 ? 's' : ''} · ${comvert_size_to_display(total_size)}`)
        )
        list_elm.clear()
        if (items.length === 0) list_elm.add(div().set_style({ color: '#6b7280' }).add('This folder is empty'))
        // Folders first
        for (const f of folders) {
            const p = (current_path ? current_path + '/' : '') + f.name
            const card = div()
                .add(
                    alink('javascript:void(0)', '', '📁 ' + f.name)
                        .set_style({ fontSize: '17px', fontWeight: 600, color: '#0f172a', textDecoration: 'none' })
                        .block().margin({ bottom: 6 })
                        .on('click', (e) => e.preventDefault())
                        .set_click(() => {
                            current_path = p
                            set_hash_params({ k: parse_hash_params().k, p: current_path })
                            location.reload()
                        }),
                    span('Folder').set_style({ color: '#6b7280', fontSize: '13px' }),
                    br(),
                    button('Delete folder', async () => {
                        const confirm_msg = `Delete folder "${f.name}" and ALL its contents? This cannot be undone.`
                        if (!confirm(confirm_msg)) return
                        await fetch(`/api/folder?path=${encodeURIComponent(p)}`,
                            { method: 'DELETE', headers: auth_headers(user_token) })
                        await update_tree()
                        await refresh_total_size()
                    }).set_style({
                        padding: '6px 10px',
                        borderRadius: '8px',
                        border: '1px solid #ef4444',
                        background: '#fff',
                        color: '#ef4444',
                        cursor: 'pointer'
                    }).margin({ top: 6 })
                )
                .padding(12).margin(8).set_style({
                    border: '1px solid #e5e7eb',
                    borderRadius: '12px',
                    background: '#ffffff',
                    boxShadow: '0 1px 2px rgba(16,24,40,0.04)',
                    minWidth: '0'
                })
            list_elm.add(card)
        }
        // Force a visual line break between folders and files
        if (folders.length > 0 && files.length > 0) {
            list_elm.add(
                hr().set_style({
                    gridColumn: '1 / -1',
                    width: '100%',
                    border: 'none',
                    borderTop: '1px solid #e5e7eb',
                    margin: '4px 0'
                })
            )
        }
        // Files
        for (const f of files) {
            const p = (current_path ? current_path + '/' : '') + f.name
            // Wrap callback to also refresh total size after file ops (delete/download triggers refresh call after action when needed)
            list_elm.add(file_comp(p, f, user_token, async () => {
                await update_tree()
                await refresh_total_size()
            }, current_path))
        }
    }
    update_tree()
    // Ensure hash reflects initial path after first draw
    sync_hash_path()

    // If hash changes (e.g., back/forward), reload to re-init with that hash
    const on_hash_change = () => location.reload()
    window.addEventListener('hashchange', on_hash_change)

    //#region .... DROPPER
    let is_uploading = false

    async function do_batch_upload(file_list) {
        if (!file_list || file_list.length === 0) return
        if (is_uploading) return
        is_uploading = true

        // UI: progress bar + text
        const bar = div().set_style({
            width: '100%',
            height: '10px',
            backgroundColor: '#e5e7eb',
            overflow: 'hidden',
            borderRadius: '999px'
        })
        const inner_bar = div().add2(bar).set_style({
            width: '0%', height: '100%', backgroundColor: '#16a34a', transition: 'width 0.2s', borderRadius: '999px'
        })
        const status = div().set_style({ fontSize: '12px', color: '#374151', marginBottom: '6px' })
            .add(`Uploading ${file_list.length} file${file_list.length !== 1 ? 's' : ''}...`)

        dropper_elm.clear().add(status, bar).set_style({ pointerEvents: 'none', opacity: 0.9 })

        let uploaded = 0
        for (const f of file_list) {
            try {
                await fetch(`/api/file?path=${encodeURIComponent(current_path)}&name=${encodeURIComponent(f.name)}`,
                    { method: 'POST', headers: auth_headers(user_token), body: f })
            } catch (e) {
                console.error('Upload failed for', f?.name, e)
            }
            uploaded++
            inner_bar.set_style({ width: `${Math.round((uploaded / file_list.length) * 100)}%` })
        }

        // Post-upload: let user know we're refreshing
        status.clear().add('Refreshing…')

        await update_tree()
        await refresh_total_size()

        // Back to idle
        set_dropper_idle()
        dropper_elm.set_style({ pointerEvents: 'auto', opacity: 1, backgroundColor: 'transparent' })
        is_uploading = false
    }

    const dropper_elm = file_drop_div(
        async () => ({ json: () => ({ ok: true }) }), // not used when on_drop returns true
        () => { }, // no-op per-file callback
        true,
        () => dropper_elm.set_style({ backgroundColor: '#f3f4f6' }),
        () => dropper_elm.set_style({ backgroundColor: 'transparent' }),
        (_, files) => { // on_drop override for both drag-and-drop and file picker
            const list = Array.from(files || [])
            if (list.length === 0) return true
            do_batch_upload(list)
            return true // signal handled to skip default internal uploads
        }
    )
        .relative()
        .set_style({
            width: '100%',
            minHeight: '160px',
            padding: '24px',
            border: '2px dashed #d1d5db',
            borderRadius: '12px',
            background: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            gap: '10px',
            boxSizing: 'border-box'
        })

    // Dropper content (idle) — simplified so nothing blocks clicks
    function set_dropper_idle() {
        dropper_elm.clear().add(
            span('Drop files here or click to upload')
                .set_style({ fontWeight: 600, color: '#374151', pointerEvents: 'none' })
        )
    }
    set_dropper_idle()

    //#region .... MAIN SETUP
    main_view.add(
        div().set_style({ display: 'grid', gridTemplateColumns: '1fr', gap: '16px' })
            .add(breadcrumbs, folder_actions, dropper_elm, list_elm)
    )

    // Responsive tweaks to avoid horizontal overflow on small screens
    function apply_responsive() {
        const w = window.innerWidth
        const is_mobile = w <= 650
        header.set_style({ padding: is_mobile ? '12px 16px' : '16px 24px' })
        container.set_style({ padding: is_mobile ? '12px' : '20px' })
        list_elm.set_style({
            gridTemplateColumns: is_mobile ? '1fr' : 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: is_mobile ? '12px' : '14px'
        })
        dropper_elm.set_style({ minHeight: is_mobile ? '140px' : '160px' })
    }
    apply_responsive()
    window.addEventListener('resize', apply_responsive)

}
