import fs from 'fs'

export default class User {

    constructor(user_token) {
        this.user_token = user_token
    }

    is_valid() {
        if (!this.user_token) {
            return false
        }
        return fs.existsSync('__data/' + this.user_token + '/list.json')
    }

}