# fileshare
Self Hosted Filesharer

## Install

```shell
git clone git@github.com:hugodecasta/fileshare.git
cd fileshare
git submodule update --init --recursive
npm i
```

### Create a first user
```shell
node create_user.js
```

this will output a secret user token to add the front `user key`

## Launch

After having created a first user

```shell
PORT=<port> node index.js
```

## Usage

### front

Everything is self-explanatory 

## User management

### create users
```shell
node create_user.js
```

### create temporary users
```shell
node create_user.js <time of life in days>
```

### remove users

If you need to remove a user, simply delete its `__data/<user_id>` folder

(note by doing so that some of its share points may still exist but linked to nothing, needs future improvement)