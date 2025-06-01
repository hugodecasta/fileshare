export default class User {

    constructor(user_id, username) {
        this.user_id = user_id
        this.username = username
    }

    /**
     * Changes the password of the user
     * @param {string} old_password - The current password of the user
     * @param {string} new_password - The new password to set for the user
     * @returns {boolean} Returns true if the password was changed successfully, otherwise false
     */
    change_password(old_password, new_password) {
    }

    /**
     * Disconnects the user
     * This method should handle any cleanup necessary when a user disconnects
     */
    disconnect() {
    }

    /**
     * Connects a user with the given username and password
     * @param {string} username - The username of the user
     * @param {string} password - The password of the user
     * @returns {Array} Returns an array containing the user object and a token
     */
    static connect(username, password) {
        return [user, token]
    }

    /**
     * Checks if a user is connected based on the signed cookie
     * @param {Object} signed_cookie - The signed cookie containing user information
     * @returns {User|null} Returns the user object if connected, otherwise null
     */
    static is_connected(signed_cookie) {

    }

    /**
     * returns a JSON representation of the user
     * @returns {Object} JSON object with user_id and username
     */
    to_json() {
        return {
            user_id: this.user_id,
            username: this.username
        }
    }
}