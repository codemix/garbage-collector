"use strict";
var Allocator = require("malloc");
var GarbageCollector = require("./lib").default;

function go () {
  var allocator = new Allocator(new Buffer(20 * 1024 * 1024));
  var instance = new GarbageCollector(allocator);
  const addresses = [];
  for (var i = 0; i < 10000; i++) {
    var address = instance.alloc(512);
    instance.ref(address);
    addresses.push(address);
    if (i > 6 && i % 3 === 0) {
      instance.unref(addresses[i - 3]);
      addresses[i - 3] = 0;
    }
  }
  instance.cycle();

  for (var i = 0; i < addresses.length; i++) {
    if (addresses[i] !== 0) {
      instance.unref(addresses[i]);
    }
  }

  instance.cycle();
  instance.cycle();

  console.log(instance.inspect());
}

go();