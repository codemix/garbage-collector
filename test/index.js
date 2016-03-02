import Allocator from "malloc";
import {default as GarbageCollector, verifyHeader} from "../src";
import randomNumbers from "./random.json";

const benchmark = createBenchmark();

// ensureDeterministicRandom();


describe('GarbageCollector', function () {
  const callbacks = Object.create(null);
  let callbackInvoked = false;
  callbacks[3] = (offset) => {
    callbackInvoked = true;
  };
  let buffer = new Buffer(1024 * 1024 * 20);
  let allocator;
  let instance;
  before(() => {
    buffer.fill(123);
    allocator = new Allocator(buffer);
    instance = new GarbageCollector(allocator, {callbacks, lifetime: 2});
  });

  describe('.constructor()', function () {
    it('should initialize the instance', function () {
      verifyHeader(allocator).should.equal(true);
    });

    it('should create another instance with default options', function () {
      const collector = new GarbageCollector(allocator);
      collector.lifetime.should.equal(0);
      (collector.callbacks && typeof collector.callbacks === 'object').should.equal(true);
    });
  });

  describe('.calloc()', function () {
    let allocator = new Allocator(new Buffer(4096).fill(127));
    let instance = new GarbageCollector(allocator);
    it('should allocate some bytes and clear them', function () {
      const address = instance.calloc(128);
      const uint8Array = new Uint8Array(allocator.buffer);
      for (let i = 0; i < 128; i++) {
        uint8Array[address + i].should.equal(0);
      }
    });

    it('should allocate and clear less than the minimum allocation size', function () {
      const address = instance.calloc(8);
      const uint8Array = new Uint8Array(allocator.buffer);
      for (let i = 0; i < 16; i++) {
        uint8Array[address + i].should.equal(0);
      }
    });

    it('should fail to allocate too many bytes', function () {
      console.log(allocator);
      instance.calloc(3820).should.equal(0);
      console.log(allocator);
    });

    it('should allocate and clear less than the minimum allocation size, with a type tag', function () {
      const address = instance.calloc(8, 123);
      address.should.be.above(0);
      const uint8Array = new Uint8Array(allocator.buffer);
      for (let i = 0; i < 16; i++) {
        uint8Array[address + i].should.equal(0);
      }
      instance.typeOf(address).should.equal(123);
    });

    it('should calloc() with an initial reference count', function () {
      const address = instance.calloc(8, 0, 123);
      address.should.be.above(0);
      instance.refCount(address).should.equal(123);
    });
  });

  describe('.alloc(), .ref(), .unref(), .cycle()', function () {
    let address1, address2;

    it('should allocate some bytes.', function () {
      address1 = instance.alloc(64);
    });

    it('should allocate some more bytes, with a tag', function () {
      address2 = instance.alloc(128, 3);
    });

    it('should report the correct size of address 1', function () {
      instance.sizeOf(address1).should.equal(64);
    });

    it('should report the correct size of address 2', function () {
      instance.sizeOf(address2).should.equal(128);
    });

    it('should report a reference count of 0 for the first address', function () {
      instance.refCount(address1).should.equal(0);
    });

    it('should report a reference count of 0 for the second address', function () {
      instance.refCount(address2).should.equal(0);
    });

    it('should increase the reference count for the first address', function () {
      instance.ref(address1).should.equal(1);
    });

    it('should increase the reference count for the second address', function () {
      instance.ref(address2).should.equal(1);
    });

    it('should report a reference count of 1 for the first address', function () {
      instance.refCount(address1).should.equal(1);
    });

    it('should report a reference count of 1 for the second address', function () {
      instance.refCount(address2).should.equal(1);
    });

    it('should cycle, without collecting anything', function () {
      instance.cycle().should.equal(0);
    });

    it('should decrease the reference count for the first address', function () {
      instance.unref(address1);
    });

    it('should report a reference count of 0 for the first address', function () {
      instance.refCount(address1).should.equal(0);
    });

    it('should report a reference count of 1 for the second address', function () {
      instance.refCount(address2).should.equal(1);
    });

    it('should cycle, without collecting anything', function () {
      instance.cycle().should.equal(0);
    });

    it('should cycle again, removing the first block', function () {
      instance.cycle().should.equal(64 + 16);
      instance.inspect().items.length.should.equal(0);
    });

    it('should cycle, without collecting anything', function () {
      instance.cycle().should.equal(0);
    });

    it('should decrease the reference count for the second address', function () {
      instance.unref(address2);
    });

    it('should report a reference count of 0 for the second address', function () {
      instance.refCount(address2).should.equal(0);
    });

    it('should cycle, without collecting anything', function () {
      instance.cycle().should.equal(0);
    });


    it('should invoke the appropriate callback method when freeing a tagged block', function () {
      callbackInvoked.should.equal(false);
      instance.cycle().should.equal(128 + 16);
      callbackInvoked.should.equal(true);
      instance.inspect().items.length.should.equal(0);

      callbackInvoked = false; // reset
    });
  });

  describe('.free()', function () {
    let address1, address2, address3;
    let callbackInvoked = false;
    callbacks[4] = () => callbackInvoked = true;

    it('should allocate some bytes', function () {
      address1 = instance.alloc(64);
      address2 = instance.alloc(128, 4);
      address3 = instance.alloc(256);
    });

    it('should add 2 references to the first address', function () {
      instance.ref(address1);
      instance.ref(address1);
    });

    it('should add 1 reference to the second address', function () {
      instance.ref(address2);
    });

    it('should add 1 reference to the third address', function () {
      instance.ref(address3);
    });

    it('should not free the first address', function () {
      instance.free(address1).should.equal(0);
    });

    it('should not free the second address', function () {
      instance.free(address2).should.equal(0);
    });

    it('should not free the third address', function () {
      instance.free(address3).should.equal(0);
    });

    it('should remove a reference from the first address', function () {
      instance.unref(address1);
    });

    it('should still not free the first address', function () {
      instance.free(address1).should.equal(0);
    });


    it('should remove a reference from the first address', function () {
      instance.unref(address1);
    });

    it('should free the first address', function () {
      instance.free(address1).should.equal(64 + 16);
    });

    it('should remove a reference from the second address', function () {
      instance.unref(address2);
    });

    it('should free the second address', function () {
      callbackInvoked.should.equal(false);
      instance.free(address2).should.equal(128 + 16);
    });

    it('should have invoked the callback', function () {
      callbackInvoked.should.equal(true);
      callbackInvoked = false; // reset.
    });

    it('should remove a reference from the third address', function () {
      instance.unref(address3);
    });

    it('should perform a cycle, but collect nothing', function () {
      instance.cycle().should.equal(0);
    });

    it('should free the third address', function () {
      instance.free(address3).should.equal(256 + 16);
    });
  });

  describe('alloc() exhaustively', function () {
    let allocator = new Allocator(new Buffer(4096).fill(127));
    let instance = new GarbageCollector(allocator);
    const addresses = [];
    it('should repeatedly allocate 16 byte chunks until it exhausts the available space', function () {
      let prev = 0;
      let next = 0;
      let counter = 0;
      while ((next = instance.alloc(16)) !== 0) {
        prev = next;
        addresses.push(next);
        counter++;
      }
    });

    it('should check the size of all the addresses', function () {
      addresses.forEach(address => {
        instance.sizeOf(address).should.be.within(16, 32);
      });
    });

    it('should free all the available addresses in order', function () {
      addresses.forEach(address => {
        instance.free(address).should.be.within(32, 48);
      });
    });

    it('should perform some garbage collection cycles', function () {
      instance.cycle();
      instance.cycle();
    });

    it('should repeatedly allocate 16 byte chunks until it exhausts the available space again', function () {
      let prev = 0;
      let next = 0;
      let counter = 0;
      while ((next = instance.alloc(16)) !== 0) {
        prev = next;
        addresses.push(next);
        counter++;
      }
    });

    it('should check the size of all the addresses again', function () {
      addresses.forEach(address => {
        instance.sizeOf(address).should.be.within(16, 32);
      });

    });

    it('should free all the available addresses in reverse order', function () {
      addresses.reverse().forEach((address, index) => {
        if (index === addresses.length - 1) {
          instance.free(address).should.be.within(32, 48);
        }
      });
    });
  });


  if (!process.env.GC_FAST_TESTS) {
    // Warning: Increasing the number of mutations has an exponential effect on test time.
    mutate([
      128,
      64,
      96,
      256,
      128,
      72,
      252
    ]);
  }

  (process.env.NODE_ENV !== "production" ? describe.skip : describe)('Benchmarks', function () {
    let buffer = new Buffer(1024 * 1024 * 20);
    let allocator;
    let instance;
    beforeEach(() => {
      buffer.fill(123);
      allocator = new Allocator(buffer);
      instance = new GarbageCollector(allocator);
    });

    after(() => {
      buffer = null;
      allocator.buffer = null;
      allocator = null;
      if (typeof gc === 'function') {
        gc();
      }
    });

    benchmark('allocate', 10000, {
      alloc () {
        instance.alloc(20);
      }
    });

    benchmark('allocate and free', 100000, {
      alloc () {
        instance.free(instance.alloc(128));
      }
    });
  });
});


function d (input) {
  console.log(JSON.stringify(input, null, 2));
}

function permutations (input: Array) {
  if (input.length == 0) {
    return [[]];
  }
  const result = [];
  for (let i = 0; i < input.length; i++) {
    const clone = input.slice();
    const start = clone.splice(i, 1);
    const tail = permutations(clone);
    for (let j = 0; j < tail.length; j++) {
      result.push(start.concat(tail[j]));
    }
  }

  return result;
}

function debugOnce (input) {
  return [input];
}

function mutate (input: number[]) {
  //debugOnce([ 64, 72, 128, 96, 256, 128, 256]).forEach(sizes => {

  permutations(input).forEach(sizes => {
    describe(`Sizes: ${sizes.join(', ')}`, function () {

      describe('Sequential', function () {
        const callbacks = {};
        const lifetime = 2;
        let allocator;
        let instance;
        let freeable = 0;

        before(() => {
          allocator = new Allocator(new Buffer(16000).fill(123));
          instance = new GarbageCollector(allocator, {callbacks, lifetime})
        });
        after(() => {
          instance.allocator = null;
          instance = null;
          allocator.buffer = null;
          allocator = null;
        });

        let addresses;
        it('should allocate', function () {
          addresses = sizes.map(item => instance.alloc(item));
        });

        it('should inspect the results', function () {
          const {items} = instance.inspect();
          sizes.forEach((size, index) => {
            items[index].offset.should.equal(addresses[index] - 16);
            items[index].size.should.be.within(size, size + 16);
          });
        });

        it('should increment the reference count of every other item', function () {
          addresses.forEach((address, index) => {
            if (index % 2 === 0) {
              instance.ref(address);
            }
            else {
              freeable += instance.sizeOf(address) + 16;
            }
          });
        });

        it('should perform a garbage collection cycle, but not collect anything', function () {
          instance.cycle().should.equal(0);
        });

        it('should cycle again, this time collecting half of the addresses', function () {
          instance.cycle().should.equal(freeable);
          freeable = 0;
        });

        it('should decrement the reference count of every other item', function () {
          addresses.forEach((address, index) => {
            if (index % 2 === 0) {
              instance.unref(address);
              freeable += instance.sizeOf(address) + 16;
            }
          });
        });

        it('should perform a garbage collection cycle, but not collect anything', function () {
          instance.cycle().should.equal(0);
        });

        it('should cycle again, this time collecting the remaining half of the addresses', function () {
          instance.cycle().should.equal(freeable);
          freeable = 0;
        });

      });

      describe('Alloc & Free', function () {
        let allocator, instance;
        let freeable = 0;
        before(() => {
          allocator = new Allocator(new Buffer(16000).fill(123));
          instance = new GarbageCollector(allocator, {lifetime: 2});
        });
        after(() => {
          instance.allocator = null;
          instance = null;
          allocator.buffer = null;
          allocator = null;
        });

        let addresses;
        it('should allocate', function () {
          addresses = sizes.map(address => instance.alloc(address));
        });
        it('should free & alloc again', function () {
          addresses = addresses.map((address, index) => {
            const size = sizes[(index + 1) % sizes.length];
            instance.free(address);
            return instance.alloc(size);
          });
        });

        it('should inspect the blocks', function () {
          const {items} = instance.inspect();
        });

        it('should unref the blocks', function () {
          addresses.forEach(address => instance.unref(address));
        });

        it('should inspect the collectible blocks', function () {
          const {items} = instance.inspect();
          items.length.should.equal(addresses.length);
          items.forEach(item => {
            item.cycles.should.equal(0);
          });
        });

        it('should perform a garbage collection cycle, but not collect anything', function () {
          instance.cycle().should.equal(0);
        });

        it('should inspect the collectible blocks', function () {
          const {items} = instance.inspect();
          items.length.should.equal(addresses.length);
          items.forEach(item => {
            item.cycles.should.equal(1);
            freeable += item.size + 16;
          });
        });

        it('should perform a garbage collection cycle and collect all the freeable blocks', function () {
          instance.cycle().should.equal(freeable);
        });

        it('should inspect the collectible blocks', function () {
          const {items} = instance.inspect();
          items.length.should.equal(0);
        });
      });

      describe('Alloc & Free with an initial ref count', function () {
        let allocator, instance;
        let freeable = 0;
        before(() => {
          allocator = new Allocator(new Buffer(16000).fill(123));
          instance = new GarbageCollector(allocator, {lifetime: 2});
        });
        after(() => {
          instance.allocator = null;
          instance = null;
          allocator.buffer = null;
          allocator = null;
        });

        let addresses;
        it('should allocate', function () {
          addresses = sizes.map(address => instance.alloc(address));
        });
        it('should free & alloc again', function () {
          addresses = addresses.map((address, index) => {
            const size = sizes[(index + 1) % sizes.length];
            instance.free(address);
            return instance.alloc(size, 0, 1);
          });
        });

        it('should inspect the blocks', function () {
          const {items} = instance.inspect();
        });

        it('should unref the blocks', function () {
          addresses.forEach(address => instance.unref(address));
        });

        it('should inspect the collectible blocks', function () {
          const {items} = instance.inspect();
          items.length.should.equal(addresses.length);
          items.forEach(item => {
            item.cycles.should.equal(0);
          });
        });

        it('should perform a garbage collection cycle, but not collect anything', function () {
          instance.cycle().should.equal(0);
        });

        it('should inspect the collectible blocks', function () {
          const {items} = instance.inspect();
          items.length.should.equal(addresses.length);
          items.forEach(item => {
            item.cycles.should.equal(1);
            freeable += item.size + 16;
          });
        });

        it('should perform a garbage collection cycle and collect all the freeable blocks', function () {
          instance.cycle().should.equal(freeable);
        });

        it('should inspect the collectible blocks', function () {
          const {items} = instance.inspect();
          items.length.should.equal(0);
        });
      });

      describe('Alloc, Alloc, Free, Reverse, Alloc', function () {
        let allocator, instance;
        let freeable = 0;
        before(() => {
          allocator = new Allocator(new Buffer(16000).fill(123));
          instance = new GarbageCollector(allocator, {lifetime: 2});
        });
        after(() => {
          instance.allocator = null;
          instance = null;
          allocator.buffer = null;
          allocator = null;
        });

        let addresses, extra;
        it('should allocate', function () {
          addresses = sizes.reduce((addresses, size) => {
            return addresses.concat(instance.alloc(size), instance.alloc(size));
          }, []);
          addresses.every(value => value.should.be.above(0));
        });

        it('should unref half of the allocated addresses', function () {
          addresses = addresses.map((address, index) => {
            if (index % 2 === 0) {
              instance.ref(address);
              return address;
            }
            else {
              instance.unref(address);
            }
          }).filter(id => id);
        });

        it('should inspect the blocks', function () {
          const {items} = instance.inspect();
          items.forEach((block, index) => {
            block.size.should.be.within(sizes[index], sizes[index] + 16);
            freeable += block.size + 16;
          });
        });

        it('should perform a garbage collection cycle, but not collect anything', function () {
          instance.cycle().should.equal(0);
        });

        it('should allocate', function () {
          extra = sizes.reduce((addresses, size) => {
            return addresses.concat(instance.alloc(size));
          }, []);
        });

        it('should perform a garbage collection cycle and remove all freeable items', function () {
          instance.cycle().should.equal(freeable);
          freeable = 0;
        });

        it('should inspect the blocks', function () {
          const {items} = instance.inspect();
          items.length.should.equal(extra.length);
          items.forEach(item => {
            freeable += item.size + 16;
          });
        });

        it('should perform a garbage collection cycle and collect all the extra blocks', function () {
          instance.cycle().should.equal(freeable);
        });

      });
    });
  });
}

function createBenchmark () {

  function benchmark (name, limit, ...fns) {
    let factor = 1;
    if (typeof limit === 'function') {
      fns.unshift(limit);
      limit = 1000;
    }
    if (typeof fns[0] === 'number') {
      factor = fns.shift();
    }
    it(`benchmark: ${name}`, benchmarkRunner(name, limit, factor, flattenBenchmarkFunctions(fns)));
  };

  benchmark.skip = function skipBenchmark (name) {
    it.skip(`benchmark: ${name}`);
  }

  benchmark.only = function benchmark (name, limit, ...fns) {
    let factor = 1;
    if (typeof limit !== 'number') {
      fns.unshift(limit);
      limit = 1000;
    }
    if (typeof fns[0] === 'number') {
      factor = fns.shift();
    }
    it.only(`benchmark: ${name}`, benchmarkRunner(name, limit, factor, flattenBenchmarkFunctions(fns)));
  };


  function benchmarkRunner (name, limit, factor, fns) {
    return async function () {
      this.timeout(10000);
      console.log(`\tStarting benchmark: ${name}\n`);
      let fastest = {
        name: null,
        score: null
      };
      let slowest = {
        name: null,
        score: null
      };
      fns.forEach(([name,fn]) => {
        const start = process.hrtime();
        for (let j = 0; j < limit; j++) {
          fn(j, limit);
        }
        let [seconds, ns] = process.hrtime(start);
        seconds += ns / 1000000000;
        const perSecond = Math.round(limit / seconds) * factor;
        if (fastest.score === null || fastest.score < perSecond) {
          fastest.name = name;
          fastest.score = perSecond;
        }
        if (slowest.score === null || slowest.score > perSecond) {
          slowest.name = name;
          slowest.score = perSecond;
        }
        console.log(`\t${name} benchmark done in ${seconds.toFixed(4)} seconds, ${perSecond} operations per second.`);
      });
      if (fns.length > 1) {
        const diff = (fastest.score - slowest.score) / slowest.score * 100;
        console.log(`\n\t${fastest.name} was ${diff.toFixed(2)}% faster than ${slowest.name}`);
      }
    };
  }

  function flattenBenchmarkFunctions (fns: Array<Object|Function>): Array {
    return fns.reduce((flat, item, index) => {
      if (typeof item === "object") {
        flat.push(...Object.keys(item).map(name => [name, item[name]]));
      }
      else {
        flat.push([item.name || "fn" + index, item]);
      }
      return flat;
    }, []);
  }

  return benchmark;
}

function ensureDeterministicRandom () {
  let index = 0;
  Math.random = function () {
    return randomNumbers[index++ % randomNumbers.length];
  };
}
