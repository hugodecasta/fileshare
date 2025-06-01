import User from './user.js'

export default class FileUser extends User {
    constructor(user_id, username) {
        super(user_id, username)
    }

    drop_file(filename, tmp_file_path) {
    }

    get_file_list() { }

    delete_file(file_id) {
    }

    get_file_path(file_id) {
    }
}