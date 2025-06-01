import FileUser from "./filesystem.js"

const max_time = process.argv[2]
if (!max_time || isNaN(max_time)) {
    console.error('Usage: node create_temporary_user.js <max_time_in_hours>')
    console.error('Example: node create_temporary_user.js 24')
    process.exit(1)
}
const used_max_time = parseInt(max_time)
const user_id = FileUser.create_user(used_max_time)
console.log('\n\nUser key:     ', user_id, '\n\n') 