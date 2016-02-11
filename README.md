# garbage-collector
A garbage collector built on top of typed arrays.

[![Build Status](https://travis-ci.org/codemix/garbage-collector.svg?branch=master)](https://travis-ci.org/codemix/garbage-collector)

## What?
A simple reference counting Garbage Collector built for use with [malloc](https://github.com/codemix/malloc).

## Installation

Install via [npm](https://npmjs.org/package/garbage-collector).
```sh
npm install garbage-collector
```

## Usage

```js
import Allocator from "malloc";
import GarbageCollector from "garbage-collector";

const heap = new Buffer(1024 * 1024);
const allocator = new Allocator(heap); // heap could also be an ArrayBuffer

const gc = new GarbageCollector(allocator, {
  // The number of cycles before an item with no references will be freed.
  lifetime: 2,
  // The callbacks which will be invoked when a tagged block is freed.
  // Keys must be integers within uint32 range, greater than zero.
  callbacks: {
    1: (offset) => {
      console.log('Freeing string at', offset);
    }
  }

});

console.log(gc.inspect());

const input = "Hello World";
const offset = gc.alloc(Buffer.byteLength(input), 1); // 1 is the type tag, it's optional.
heap.write(input, offset);

gc.ref(offset); // increment the reference count

gc.cycle(); // our data is preserved because it has a reference count > 0

console.log(gc.inspect());

console.log(gc.sizeOf(offset));

gc.unref(offset); // decrement the reference count by 1

const freed = gc.cycle(); // frees our string and invokes the callback

console.log('freed', freed, 'bytes');
```


## License

Published by [codemix](http://codemix.com/) under a permissive MIT License, see [LICENSE.md](./LICENSE.md).
