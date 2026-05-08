# tp-events

[![Build Status](https://www.travis-ci.org/typescript-practice/events.svg?branch=master)](https://www.travis-ci.org/typescript-practice/events)
[![Coverage Status](https://coveralls.io/repos/github/typescript-practice/events/badge.svg?branch=master)](https://coveralls.io/github/typescript-practice/events?branch=master)
[![npm version](https://img.shields.io/npm/v/tp-events.svg?style=flat-square)](https://www.npmjs.com/package/tp-events)
[![monthly downloads](https://img.shields.io/npm/dm/tp-events.svg?style=flat-square)](https://www.npmjs.com/package/tp-events)
[![code style: prettier](https://img.shields.io/badge/code_style-prettier-ff69b4.svg?style=flat-square)](https://github.com/prettier/prettier)
[![semantic-release](https://img.shields.io/badge/%20%20%F0%9F%93%A6%F0%9F%9A%80-semantic--release-e10079.svg)](https://github.com/semantic-release/semantic-release)
[![UNPKG](https://img.shields.io/badge/unpkg.com--green.svg)](https://unpkg.com/tp-events@latest/dist/events.umd.js)
[![liense](https://img.shields.io/github/license/typescript-practice/events.svg)](#/)

## Intro

Event based JavaScript for the browser with nodejs events api. For more: [Nodejs Events](https://nodejs.org/api/events.html).


## Example

```js
import EventEmitter from 'tp-events'

class MyEmitter extends EventEmitter {}

const myEmitter = new MyEmitter();
myEmitter.on('event', () => {
  console.log('an event occurred!');
});
myEmitter.emit('event');
```

## Install

[![NPM Badge](https://nodei.co/npm/tp-events.png?downloads=true)](https://www.npmjs.com/package/tp-events)

## API

Please refer to the document on [Node.js v9.6.1 Events](https://nodejs.org/api/events.html), API is the same.

## Development

 - `npm t`: Run test suite
 - `npm start`: Run `npm run build` in watch mode
 - `npm run test:watch`: Run test suite in [interactive watch mode](http://facebook.github.io/jest/docs/cli.html#watch)
 - `npm run test:prod`: Run linting and generate coverage
 - `npm run build`: Generate bundles and typings, create docs
 - `npm run lint`: Lints code
 - `npm run commit`: Commit using conventional commit style ([husky](https://github.com/typicode/husky) will tell you to use it if you haven't :wink:)

## Reference

- [Nodejs Events](https://nodejs.org/api/events.html)
- [Olical EventEmitter](https://github.com/Olical/EventEmitter)

## License

MIT
