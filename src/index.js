/* @flow */

const POINTER_SIZE_IN_BYTES = 4;


const HEADER_SIZE_IN_QUADS = 4;
const HEADER_OFFSET_IN_QUADS = bytesToQuads(272);

const HEAD_OFFSET_IN_QUADS = HEADER_OFFSET_IN_QUADS;
const TAIL_OFFSET_IN_QUADS = HEADER_OFFSET_IN_QUADS + 1;

const PREV_OFFSET_IN_QUADS = 0;
const NEXT_OFFSET_IN_QUADS = 1;
const REF_COUNT_OFFSET_IN_QUADS = 2;
const TYPE_OFFSET_IN_QUADS = 3;

const POINTER_SIZE_IN_QUADS = 1;

const ENTRY_OVERHEAD_IN_BYTES = 16;

interface Allocator {
  int32Array: Int32Array;
  alloc (numberOfBytes: int32): int32;
  free (address: int32): int32;
  sizeOf (address: int32): int32;
}

type ListNode = {
  offset: int32;
  size: int32;
  height: int32;
  pointers: int32[];
};

type InspectionResult = {
  header: {
    head: int32;
    tail: int32;
  };
  items: Array<{
    offset: int32;
    prev: int32;
    next: int32;
    type: uint32;
    cycles: int32;
    size: int32;
  }>;
};

type Callback = (offset: int32) => void;

type CallbackList = {
  [type: int32]: Callback;
};

type Options = {
  lifetime: int32;
  callbacks: CallbackList;
  callbackOffset: number;
};

const DEFAULT_OPTIONS: Options = {
  lifetime: 0,
  callbackOffset: 0,
  callbacks: {}
};

export default class GarbageCollector {

  allocator: Allocator;
  lifetime: int32;
  callbacks: CallbackList;
  callbackOffset: number;

  /**
   * Initialize the garbage collector.
   */
  constructor (allocator: Allocator, {lifetime, callbacks, callbackOffset}: Options = DEFAULT_OPTIONS) {
    this.allocator = allocator;
    this.lifetime = lifetime || 0;
    this.callbackOffset = callbackOffset || 0;
    this.callbacks = callbacks;
    prepare(this.allocator);
  }


  /**
   * Allocate a given number of bytes and return the offset.
   * If allocation fails, returns 0.
   */
  alloc (numberOfBytes: int32, type: uint32 = 0, refCount: uint32 = 0): int32 {
    trace: `Allocating ${numberOfBytes} bytes with type ${type}`;
    const allocator = this.allocator;
    const address: int32 = allocator.alloc(numberOfBytes + ENTRY_OVERHEAD_IN_BYTES);
    if (address === 0) {
      return 0;
    }

    const offset: int32 = bytesToQuads(address);
    const int32Array = allocator.int32Array;

    if (refCount > 0) {
      int32Array[offset + REF_COUNT_OFFSET_IN_QUADS] = refCount;
      int32Array[offset + TYPE_OFFSET_IN_QUADS] = type >> 0;
    }
    else {
      const tail = int32Array[TAIL_OFFSET_IN_QUADS];
      if (tail === 0) {
        int32Array[offset] = 0;
        int32Array[HEAD_OFFSET_IN_QUADS] = offset;
        int32Array[TAIL_OFFSET_IN_QUADS] = offset;
      }
      else {
        int32Array[tail + NEXT_OFFSET_IN_QUADS] = offset;
        int32Array[offset] = tail;
        int32Array[TAIL_OFFSET_IN_QUADS] = offset;
      }
      int32Array[offset + NEXT_OFFSET_IN_QUADS] = 0;
      int32Array[offset + REF_COUNT_OFFSET_IN_QUADS] = 0;
      int32Array[offset + TYPE_OFFSET_IN_QUADS] = type >> 0;
    }

    return address + ENTRY_OVERHEAD_IN_BYTES;
  }

  /**
   * Allocate and clear given number of bytes and return the offset.
   * If allocation fails, returns 0.
   */
  calloc (numberOfBytes: int32, type: uint32 = 0, refCount: uint32 = 0): int32 {
    numberOfBytes = numberOfBytes < 16 ? 16 : align(numberOfBytes);
    const address = this.alloc(numberOfBytes, type, refCount);
    if (address === 0) {
      // No space.
      return 0;
    }
    trace: `Clearing ${numberOfBytes} bytes at ${address}.`;

    const int32Array = this.allocator.int32Array;
    const offset = bytesToQuads(address);
    const limit = numberOfBytes / 4;
    for (let i = 0; i < limit; i++) {
      int32Array[offset + i] = 0;
    }
    return address;
  }

  /**
   * Increment the reference count at the given offset and return the new count.
   */
  ref (address: int32): int32 {
    const int32Array = this.allocator.int32Array;
    const offset: int32 = bytesToQuads(address - ENTRY_OVERHEAD_IN_BYTES);
    let count: int32 = int32Array[offset + REF_COUNT_OFFSET_IN_QUADS];
    trace: `Adding a reference to ${address}, existing count is ${count}.`
    if (count < 1) {
      trace: `Removing the node from the linked list.`;
      const prev: int32 = int32Array[offset];
      const next: int32 = int32Array[offset + NEXT_OFFSET_IN_QUADS];
      trace: `Previous: ${quadsToBytes(prev)}, Next: ${quadsToBytes(next)}.`;

      if (prev === 0) {
        int32Array[HEAD_OFFSET_IN_QUADS] = next;
      }
      else {
        int32Array[prev + NEXT_OFFSET_IN_QUADS] = next;
      }

      if (next === 0) {
        int32Array[TAIL_OFFSET_IN_QUADS] = prev;
      }
      else {
        int32Array[next] = prev;
      }
      count = 0;
    }

    count++;

    int32Array[offset + REF_COUNT_OFFSET_IN_QUADS] = count;

    return count;
  }

  /**
   * Decrement the reference count at the given offset and return the new count.
   */
  unref (address: int32): int32 {
    const int32Array = this.allocator.int32Array;
    const offset: int32 = bytesToQuads(address - ENTRY_OVERHEAD_IN_BYTES);
    const count: int32 = int32Array[offset + REF_COUNT_OFFSET_IN_QUADS];
    trace: `Removing a reference to ${address}, existing count is ${count}.`

    if (count < 1) {
      warn: `Reference count is already zero.`;
      // @fixme maybe this should throw?
      return 0;
    }
    else if (count === 1) {
      trace: `Reference count is now zero, adding block ${address} to the linked list.`;
      const tail = int32Array[TAIL_OFFSET_IN_QUADS];
      if (tail === 0) {
        int32Array[offset] = 0;
        int32Array[HEAD_OFFSET_IN_QUADS] = offset;
        int32Array[TAIL_OFFSET_IN_QUADS] = offset;
      }
      else {
        int32Array[offset] = tail;
        int32Array[tail + NEXT_OFFSET_IN_QUADS] = offset;
        int32Array[TAIL_OFFSET_IN_QUADS] = offset;
      }
      int32Array[offset + NEXT_OFFSET_IN_QUADS] = 0;
      int32Array[offset + REF_COUNT_OFFSET_IN_QUADS] = 0;
      return 0;
    }
    else {
      int32Array[offset + REF_COUNT_OFFSET_IN_QUADS] = count - 1;
      return count - 1;
    }
  }

  /**
   * Immediately free the block at the given address if its reference count is zero.
   */
  free (address: int32): int32 {
    trace: `Freeing block at ${address}.`;
    const int32Array = this.allocator.int32Array;
    const offset: int32 = bytesToQuads(address - ENTRY_OVERHEAD_IN_BYTES);

    if (int32Array[offset + REF_COUNT_OFFSET_IN_QUADS] > 0) {
      trace: `Cannot free block ${address}, reference count is above 0 (${int32Array[offset + REF_COUNT_OFFSET_IN_QUADS]}).`;
      return 0;
    }

    const prev: int32 = int32Array[offset];
    const next: int32 = int32Array[offset + NEXT_OFFSET_IN_QUADS];
    const type: int32 = int32Array[offset + TYPE_OFFSET_IN_QUADS];
    if (prev === 0) {
      int32Array[HEAD_OFFSET_IN_QUADS] = next;
    }
    else {
      int32Array[prev + NEXT_OFFSET_IN_QUADS] = next;
    }

    if (next === 0) {
      int32Array[TAIL_OFFSET_IN_QUADS] = prev;
    }
    else {
      int32Array[next] = prev;
    }

    if (type !== 0) {
      const callback: ?Callback = this.callbacks[type >>> 0];
      /* istanbul ignore if */
      if (typeof callback === 'function') {
        callback(this.callbackOffset + address);
      }
    }

    return this.allocator.free(address - ENTRY_OVERHEAD_IN_BYTES);
  }

  /**
   * Return the reference count of the block at the given address.
   */
  refCount (address: int32): uint32 {
    const int32Array = this.allocator.int32Array;
    const offset: int32 = bytesToQuads(address - ENTRY_OVERHEAD_IN_BYTES);
    return int32Array[offset + REF_COUNT_OFFSET_IN_QUADS];
  }

  /**
   * Return the size of the block at the given address.
   */
  sizeOf (address: int32): uint32 {
    return this.allocator.sizeOf(address - ENTRY_OVERHEAD_IN_BYTES) - ENTRY_OVERHEAD_IN_BYTES;
  }

  /**
   * Return the type of the block at the given address.
   */
  typeOf (address: int32): uint32 {
    const int32Array = this.allocator.int32Array;
    const offset: int32 = bytesToQuads(address - ENTRY_OVERHEAD_IN_BYTES);
    return int32Array[offset + TYPE_OFFSET_IN_QUADS] >>> 0;
  }

  /**
   * Perform a garbage collection cycle.
   *
   * Walks through the list of blocks with zero references and increments their cycle count.
   * Blocks whose cycle count reaches the threshold will be freed.
   */
  cycle (): int32 {
    const allocator = this.allocator;
    const int32Array = allocator.int32Array;
    let total = 0;
    let prev = 0;
    let next: int32 = int32Array[HEAD_OFFSET_IN_QUADS];
    while (next !== 0) {
      const offset: int32 = next;
      next = int32Array[offset + NEXT_OFFSET_IN_QUADS];

      const cycles: int32 = (-int32Array[offset + REF_COUNT_OFFSET_IN_QUADS]) + 1;
      if (cycles >= this.lifetime) {
        if (prev === 0) {
          int32Array[HEAD_OFFSET_IN_QUADS] = next;
        }
        else {
          int32Array[prev + NEXT_OFFSET_IN_QUADS] = next;
        }

        if (next === 0) {
          int32Array[TAIL_OFFSET_IN_QUADS] = prev;
        }
        const type: int32 = int32Array[offset + TYPE_OFFSET_IN_QUADS];
        if (type !== 0) {
          const callback: ?Callback = this.callbacks[type >>> 0];
          /* istanbul ignore if */
          if (typeof callback === 'function') {
            callback(this.callbackOffset + quadsToBytes(offset) + ENTRY_OVERHEAD_IN_BYTES);
          }
        }
        total += allocator.free(quadsToBytes(offset));
      }
      else {
        int32Array[offset + REF_COUNT_OFFSET_IN_QUADS] = -cycles;
        prev = offset;
      }
    }

    return total;
  }

  /**
   * Inspect the instance.
   */
  inspect (): InspectionResult|Array<any> {
    const allocator = this.allocator;
    const int32Array = allocator.int32Array;
    const items = [];
    let next: int32 = int32Array[HEAD_OFFSET_IN_QUADS];
    while (next !== 0) {
      const offset: int32 = next;
      const prev: int32 = int32Array[offset];
      next = int32Array[offset + NEXT_OFFSET_IN_QUADS];
      const cycles: int32 = -int32Array[offset + REF_COUNT_OFFSET_IN_QUADS];
      const type: uint32 = int32Array[offset + TYPE_OFFSET_IN_QUADS] >>> 0;
      const size: int32 = allocator.sizeOf(quadsToBytes(offset)) - ENTRY_OVERHEAD_IN_BYTES;
      items.push({
        offset: quadsToBytes(offset),
        prev: quadsToBytes(prev),
        next: quadsToBytes(next),
        type,
        cycles,
        size
      });
    }
    const head: int32 = quadsToBytes(int32Array[HEAD_OFFSET_IN_QUADS]);
    const tail: int32 = quadsToBytes(int32Array[TAIL_OFFSET_IN_QUADS]);
    return {
      header: {head, tail},
      items
    };
  }
}

/**
 * Align the given value to 8 bytes.
 */
function align (value: int32): int32 {
  return (value + 7) & ~7;
}

/**
 * Ensure that the first block in the given allocator is our header, and if not, create it.
 */
export function prepare (allocator: Allocator): Allocator {
  trace: "Checking for existing GC header."
  if (!verifyHeader(allocator)) {
    trace: "Could not find a header, creating one."
    writeInitialHeader(allocator);
  }
  return allocator;
}

/**
 * Verify that the allocator contains a valid header.
 */
export function verifyHeader (allocator: Allocator): boolean {
  const int32Array = allocator.int32Array;
  return int32Array[HEADER_OFFSET_IN_QUADS - 1] === -HEADER_SIZE_IN_QUADS
      && int32Array[HEADER_OFFSET_IN_QUADS + HEADER_SIZE_IN_QUADS] === -HEADER_SIZE_IN_QUADS;
}

/**
 * Write the initial header for an empty int32Array.
 */
function writeInitialHeader (allocator: Allocator): void {
  trace: `Writing initial GC header at ${quadsToBytes(HEADER_OFFSET_IN_QUADS)}.`;
  const int32Array = allocator.int32Array;
  const header = bytesToQuads(allocator.alloc(quadsToBytes(HEADER_SIZE_IN_QUADS)));
  /* istanbul ignore if  */
  if (header !== HEADER_OFFSET_IN_QUADS) {
    throw new Error(`Allocator supplied an invalid start address, expected ${quadsToBytes(HEADER_OFFSET_IN_QUADS)} got ${quadsToBytes(header)}`);
  }
  int32Array[HEAD_OFFSET_IN_QUADS] = 0;
  int32Array[TAIL_OFFSET_IN_QUADS] = 0;
  trace: `Created GC header at ${quadsToBytes(header)}`;
}

/**
 * Convert quads to bytes.
 */
function quadsToBytes (num: int32): int32 {
  return num * POINTER_SIZE_IN_BYTES;
}

/**
 * Convert bytes to quads.
 */
function bytesToQuads (num: int32): int32 {
  return Math.ceil(num / POINTER_SIZE_IN_BYTES);
}

