import { alink, br, button, div, file_drop_div, h2, hr, input, span } from './vanille/components.js'
import { DATABASE } from './vanille/db_sytem/database.js'
import { click_link, delete_endpoint, get_json, post_json } from './vanille/fetch_utils.js'
import { pending_promise } from './vanille/promises.js'

const user_db = new DATABASE('user_db', { token: null })
const user = user_db.object

const input_connect = input(user.token ?? '', "password", (token) => connect(token), true, false)
    .set_attributes({ name: 'password', placeholder: 'User key' })

div().add2b().add(
    input_connect,
    button('Connect', () => connect(input_connect.value))
)

hr().add2b()

const main_view = div().add2b().add(
    'not connected yet'
)

if (user.token) {
    connect(user.token)
}

async function user_get(endpoint, token) {
    return await get_json(endpoint, {
        headers: { 'user': token }
    })
}

async function connect(token) {
    main_view.clear().add('connecting...')
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

function share_point_comp(file_id, file, user_token, cb) {

    function copy_share_link(share_point) {
        const share_link = window.location.origin + '/files/share/' + share_point
        navigator.clipboard.writeText(share_link)
        alert('Share link copied to clipboard !')

    }

    return div()
        .add(
            file.share_point ? button(
                'Delete share point',
                async () => {
                    if (!confirm('Delete share point for file "' + file.name + '" ?')) return
                    await delete_endpoint(`/api/share_point/delete/${file_id}`, { headers: { 'user': user_token } })
                    cb()
                }
            ) : null,
            file.share_point ? button(
                'Copy share link',
                async () => {
                    copy_share_link(file.share_point)
                }
            ) : null,
            !file.share_point ? button('Create share point', async () => {
                const { share_point } = await post_json(`/api/share_point/create/${file_id}`, {}, {
                    headers: { 'user': user_token }
                })
                copy_share_link(share_point)
                cb()
            }) : null
        )
}

function file_comp(file_id, file, user_token, cb) {
    return div()
        .add(
            //#region .... DOWNLOAD LINK
            alink('#', '', file.name)
                .set_style({ fontSize: '20px', fontWeight: 'bold' }).block().margin({ bottom: 5 })
                .set_click(async () => {
                    const response = await fetch(`/files/${file_id}`, {
                        method: 'GET',
                        headers: {
                            'user': user_token
                        }
                    })
                    const blob = await response.blob()
                    const url = window.URL.createObjectURL(blob)
                    click_link(url, '_blank', (link) => link.download = file.name)
                    setTimeout(cb, 500)
                }),
            //#region .... DISP
            comvert_size_to_display(file.size) + ' downloaded ' + file.downloads.length + ' time(s)',
            br(),
            (file.time ? new Date(file.time).toLocaleString() : 'time unknown'),
            br(),
            //#region .... Share point
            share_point_comp(file_id, file, user_token, cb),
            //#region .... DELETE
            button('Delete', async () => {
                if (!confirm('Delete file "' + file.name + '" ?')) return
                const response = await fetch(`/api/files/delete/${file_id}`, {
                    method: 'DELETE',
                    headers: { 'user': user_token }
                })
                cb()
            })
        )
        .padding(5).margin(10).set_style({
            border: '1px solid #ccc',
        })
}

//#region ------------------------------------------------------ DASHBOARD
function create_dashboard(user_token) {

    const account_stats = div()

    main_view.clear().add(
        'Connected !', account_stats
    )

    //#region .... LIST
    const list_elm = div()
    async function update_list() {
        const list = await user_get('/api/files/get_list', user_token)
        const list_length = Object.keys(list.files).length
        const total_size = Object.values(list.files).reduce((acc, file) => acc + (file.size ?? 0), 0)
        account_stats.clear().add(
            list_length + ' files for ' + comvert_size_to_display(total_size),
        )
        list_elm.clear().add(
            h2('File List'),
            list_length === 0 ? 'No files uploaded yet' : null,
            ...Object.entries(list.files).map(([id, file]) => file_comp(id, file, user_token, update_list)),
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
                height: '20px',
                backgroundColor: '#c7c7c7',
                overflow: 'hidden',
            })
            const inner_bar = div().add2(bar).set_style({
                width: '0%',
                height: '100%',
                backgroundColor: '#4caf50',
                transition: 'width 0.2s',
            })

            xhr.upload.onprogress = function (e) {
                dropper_elm
                    .clear()
                    .add(bar, br(), 'uploading ' + comvert_size_to_display(e.total) + '...')
                    .set_style({ pointerEvents: 'none', opacity: 0.8 })
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
        () => dropper_elm.set_style({ backgroundColor: '#cecece' }),
        () => dropper_elm.set_style({ backgroundColor: 'transparent' })
    )
        .relative()
        .set_style({
            width: '150px', height: '150px',
            padding: '25px',
            border: '2px dashed #ccc',
        })

    //#region .... MAIN SETUP
    main_view.add(dropper_elm, list_elm)

}
