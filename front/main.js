import { alink, br, button, div, file_drop_div, h2, hr, input, span } from './vanille/components.js'
import { DATABASE } from './vanille/db_sytem/database.js'
import { click_link, delete_endpoint, get_json, post_json } from './vanille/fetch_utils.js'
import { pending_promise } from './vanille/promises.js'

const user_db = new DATABASE('user_db', { token: null })
const user = user_db.object

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
        span('Fileshare').set_style({ fontWeight: 700, fontSize: '20px', letterSpacing: '0.2px' })
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

connect_bar.add(input_connect, connect_btn)

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

if (user.token) {
    connect(user.token)
}

async function user_get(endpoint, token) {
    return await get_json(endpoint, {
        headers: { 'user': token }
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
    create_dashboard(token)
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

function share_point_comp(file_id, file, user_token, cb) {

    function copy_share_link(share_point) {
        const share_link = window.location.origin + '/files/share/' + share_point
        navigator.clipboard.writeText(share_link)
        alert('Share link copied to clipboard !')

    }

    const wrap = div()
        .set_style({ display: 'flex', gap: '8px', flexWrap: 'wrap' })
        .add(
            file.share_point ? button(
                'Delete share point',
                async () => {
                    if (!confirm('Delete share point for file "' + file.name + '" ?')) return
                    await delete_endpoint(`/api/share_point/delete/${file_id}`, { headers: { 'user': user_token } })
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
            file.share_point ? button(
                'Copy share link',
                async () => {
                    copy_share_link(file.share_point)
                }
            ).set_style({
                padding: '6px 10px',
                borderRadius: '8px',
                border: '1px solid #d1d5db',
                background: '#fff',
                color: '#111827',
                cursor: 'pointer'
            }) : null,
            !file.share_point ? button('Create share point', async () => {
                const { share_point } = await post_json(`/api/share_point/create/${file_id}`, {}, {
                    headers: { 'user': user_token }
                })
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

function file_comp(file_id, file, user_token, cb) {
    const display_name = fix_mojibake_utf8(file.name ?? '')
    const card = div()
        .add(
            //#region .... DOWNLOAD LINK
            alink('#', '', display_name)
                .set_style({
                    fontSize: '16px',
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
                .set_click(async () => {
                    const response = await fetch(`/files/${file_id}`, {
                        method: 'GET',
                        headers: {
                            'user': user_token
                        }
                    })
                    const blob = await response.blob()
                    const url = window.URL.createObjectURL(blob)
                    click_link(url, '_blank', (link) => link.download = display_name)
                    setTimeout(cb, 500)
                }),
            //#region .... DISP
            span(comvert_size_to_display(file.size) + ' · ' + file.downloads.length + ' download(s)')
                .set_style({ color: '#6b7280', fontSize: '12px' }),
            br(),
            (file.time ? new Date(file.time).toLocaleString() : 'time unknown'),
            br(),
            //#region .... Share point
            share_point_comp(file_id, file, user_token, cb).margin({ top: 6, bottom: 6 }),
            //#region .... DELETE
            button('Delete', async () => {
                if (!confirm('Delete file "' + display_name + '" ?')) return
                const response = await fetch(`/api/files/delete/${file_id}`, {
                    method: 'DELETE',
                    headers: { 'user': user_token }
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
        .padding(10).margin(8).set_style({
            border: '1px solid #e5e7eb',
            borderRadius: '12px',
            background: '#ffffff',
            boxShadow: '0 1px 2px rgba(16,24,40,0.04)',
            minWidth: '0'
        })
    return card
}

//#region ------------------------------------------------------ DASHBOARD
function create_dashboard(user_token) {

    const account_stats = div()
        .set_style({ color: '#374151', fontSize: '14px' })

    main_view.clear().add(
        div().set_style({
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '14px',
            gap: '8px',
            flexWrap: 'wrap'
        }).add(
            h2('Your files').set_style({ fontSize: '18px', margin: 0 }),
            account_stats
        )
    )

    //#region .... LIST
    const list_elm = div()
        .set_style({
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
            gap: '12px'
        })
    async function update_list() {
        const list = await user_get('/api/files/get_list', user_token)
        const list_length = Object.keys(list.files).length
        const total_size = Object.values(list.files).reduce((acc, file) => acc + (file.size ?? 0), 0)
        account_stats.clear().add(
            span(list_length + ' file' + (list_length !== 1 ? 's' : '') + ' · ' + comvert_size_to_display(total_size))
        )
        const getTime = (f) => f?.time ? new Date(f.time).getTime() : 0
        const sorted_entries = Object.entries(list.files)
            .sort(([, a], [, b]) => getTime(b) - getTime(a))
        list_elm.clear().add(
            list_length === 0 ? div().set_style({ color: '#6b7280' }).add('No files uploaded yet') : null,
            ...sorted_entries.map(([id, file]) => file_comp(id, file, user_token, update_list)),
        )
    }
    update_list()

    //#region .... DROPPER
    const dropper_elm = file_drop_div(
        (formData) => {
            const [resolve, error, prom] = pending_promise()
            const xhr = new XMLHttpRequest()
            xhr.open('POST', '/api/files/drop')
            xhr.setRequestHeader('Accept', 'application/json')

            const bar = div().set_style({
                width: '100%',
                height: '10px',
                backgroundColor: '#e5e7eb',
                overflow: 'hidden',
                borderRadius: '999px'
            })
            const inner_bar = div().add2(bar).set_style({
                width: '0%',
                height: '100%',
                backgroundColor: '#16a34a',
                transition: 'width 0.2s',
                borderRadius: '999px'
            })

            xhr.upload.onprogress = function (e) {
                dropper_elm
                    .clear()
                    .add(
                        div().set_style({ fontSize: '12px', color: '#374151', marginBottom: '6px' })
                            .add('Uploading ' + comvert_size_to_display(e.total) + '...'),
                        bar
                    )
                    .set_style({ pointerEvents: 'none', opacity: 0.9 })
                if (e.lengthComputable) {
                    const percent_complete = (e.loaded / e.total) * 100
                    inner_bar.set_style({ width: percent_complete + '%' })
                }
            }
            xhr.onload = function () {
                if (xhr.status === 200) {
                    try {
                        const result = JSON.parse(xhr.responseText)
                        resolve({ json: () => result })
                        update_list()
                    } catch (e) {
                        error(e)
                    }
                } else {
                    error()
                }
            }
            xhr.onerror = function () {
                error()
            }
            xhr.setRequestHeader('user', user_token)
            xhr.send(formData)
            return prom
        },
        () => {
            dropper_elm.clear().set_style({ pointerEvents: 'auto', opacity: 1, backgroundColor: 'transparent' })
            update_list()
        },
        false,
        () => dropper_elm.set_style({ backgroundColor: '#f3f4f6' }),
        () => dropper_elm.set_style({ backgroundColor: 'transparent' })
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

    // Dropper inner content (idle)
    const dropper_inner = div().set_style({ color: '#374151' }).add(
        div().set_style({
            width: '40px',
            height: '40px',
            borderRadius: '10px',
            background: '#111827',
            color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 700
        }).add('⤓'),
        div().add(
            span('Drop files here or click to upload').block().set_style({ fontWeight: 600 }),
            span('Max size depends on server config.').set_style({ fontSize: '12px', color: '#6b7280' })
        )
    )
    dropper_elm.add(dropper_inner)

    //#region .... MAIN SETUP
    main_view.add(
        div().set_style({ display: 'grid', gridTemplateColumns: '1fr', gap: '16px' })
            .add(dropper_elm, list_elm)
    )

    // Responsive tweaks to avoid horizontal overflow on small screens
    function apply_responsive() {
        const w = window.innerWidth
        const is_mobile = w <= 650
        header.set_style({ padding: is_mobile ? '12px 16px' : '16px 24px' })
        container.set_style({ padding: is_mobile ? '12px' : '20px' })
        list_elm.set_style({
            gridTemplateColumns: is_mobile ? '1fr' : 'repeat(auto-fill, minmax(180px, 1fr))',
            gap: is_mobile ? '10px' : '12px'
        })
        dropper_elm.set_style({ minHeight: is_mobile ? '140px' : '160px' })
    }
    apply_responsive()
    window.addEventListener('resize', apply_responsive)

}
