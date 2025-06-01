import { randomUUID } from 'crypto'
import fs, { fdatasync } from 'fs'

export default class FileUser {
    constructor(user_id) {
        this.user_id = user_id
        this.path = '__data/' + this.user_id
    }

    drop_file(filename, tmp_file_path) {
        const list = this.get_file_list()
        const file_id = randomUUID()
        const time = Date.now()
        const file_size = fs.statSync(tmp_file_path).size
        const file_data = {
            id: file_id,
            name: filename,
            time: time,
            size: file_size,
            downloads: []
        }
        list[file_id] = file_data
        fs.writeFileSync(this.path + '/list.json', JSON.stringify(list, null, 2))
        fs.renameSync(tmp_file_path, this.path + '/files/' + file_id)
    }

    get_file_list(basic = false) {
        const list = JSON.parse(fs.readFileSync(this.path + '/list.json', 'utf-8'))
        if (!basic)
            list.save = () => {
                delete list.save
                fs.writeFileSync(this.path + '/list.json', JSON.stringify(list, null, 2))
            }
        return list
    }

    delete_file(file_id) {
        const list = this.get_file_list()
        if (list[file_id]) {
            const share_point = list[file_id].share_point
            if (share_point) {
                const share_list = FileUser.get_share_file()
                delete share_list[share_point]
                share_list.save()
            }
            delete list[file_id]
            list.save()
            fs.unlinkSync(this.path + '/files/' + file_id)
            return true
        }
        return false
    }

    get_file_path(file_id) {
        const list = this.get_file_list()
        if (list[file_id]) {
            const path = this.path + '/files/' + file_id
            const absolute_path = fs.realpathSync(path)
            list[file_id].downloads.push(Date.now())
            list.save()
            return absolute_path
        }
        return null
    }

    make_share_point(file_id) {
        const list = this.get_file_list()
        if (list[file_id]) {
            if (list[file_id].share_point) {
                return list[file_id].share_point
            }
            const share_point = randomUUID()
            const share_list = FileUser.get_share_file()
            share_list[share_point] = {
                file_id: file_id,
                user_id: this.user_id,
                time: Date.now(),
                size: list[file_id].size,
                name: list[file_id].name
            }
            list[file_id].share_point = share_point
            share_list.save()
            list.save()
            return share_point
        }
        return null
    }

    delete_share_point(file_id) {
        const list = this.get_file_list()
        if (list[file_id] && list[file_id].share_point) {
            const share_list = FileUser.get_share_file()
            delete share_list[list[file_id].share_point]
            share_list.save()
            delete list[file_id].share_point
            list.save()
            return true
        }
        return false
    }

    check_need_for_deletion() {
        const info = JSON.parse(fs.readFileSync(this.path + '/info.json', 'utf-8'))
        return info.lifetime && Date.now() > info.lifetime
    }

    delete_me() {
        const list = this.get_file_list(true)
        for (const file_id in list) {
            if (list[file_id].share_point) {
                this.delete_share_point(file_id)
            }
            fs.unlinkSync(this.path + '/files/' + file_id)
        }
        fs.unlinkSync(this.path + '/list.json')
        fs.unlinkSync(this.path + '/info.json')
        fs.rmSync(this.path, { recursive: true })
    }


    static create_user(days_lifetime = null) {
        const user_id = randomUUID()
        const user_path = '__data/' + user_id
        fs.mkdirSync(user_path + '/files', { recursive: true })
        fs.writeFileSync(user_path + '/list.json', JSON.stringify({}, null, 2))
        fs.writeFileSync(user_path + '/info.json', JSON.stringify({
            user_id: user_id,
            created: Date.now(),
            lifetime: days_lifetime != null ? Date.now() + days_lifetime * 24 * 60 * 60 * 1000 : null
        }, null, 2))
        return user_id
    }

    static get_share_file() {
        const share_path = '__data/share.json'
        if (!fs.existsSync(share_path)) {
            fs.writeFileSync(share_path, JSON.stringify({}, null, 2))
        }
        const list = JSON.parse(fs.readFileSync(share_path, 'utf-8'))
        list.save = () => {
            delete list.save
            fs.writeFileSync(share_path, JSON.stringify(list, null, 2))
        }
        return list
    }

    static get_share_point_path(share_point) {
        const share_list = FileUser.get_share_file()
        return null
    }

    static users_deletion_check() {
        const user_list = fs.readdirSync('__data').filter(file => fs.statSync('__data/' + file).isDirectory())
        for (const user_id of user_list) {
            const user = new FileUser(user_id)
            if (user.check_need_for_deletion()) {
                console.log('Found user for deletion:', user_id, ' deleting...')
                user.delete_me()
            }
        }
    }

}