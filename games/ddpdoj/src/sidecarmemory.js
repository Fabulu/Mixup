// Strict virtual memory layered over declared shared main-RAM ranges.

import { MACHINE } from './machine.js';

export function normalizeRanges(ranges, kind) {
  if (!Array.isArray(ranges) || ranges.length === 0) {
    throw new TypeError(`${kind} ranges must be a non-empty array`);
  }
  const normalized = ranges.map((range, index) => {
    const start = range?.start;
    const length = range?.length;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(length) || length <= 0) {
      throw new RangeError(`${kind} range ${index} must have integer start and positive length`);
    }
    return {
      name: String(range.name ?? `${kind}-${index}`),
      start,
      length,
      end: start + length,
      offset: 0,
      writable: range.writable !== false,
    };
  }).sort((a, b) => a.start - b.start);
  let offset = 0;
  for (let i = 0; i < normalized.length; i++) {
    const range = normalized[i];
    if (!Number.isSafeInteger(range.end)) throw new RangeError(`${range.name} range overflows`);
    if (i > 0 && normalized[i - 1].end > range.start) {
      throw new RangeError(`${normalized[i - 1].name} overlaps ${range.name}`);
    }
    range.offset = offset;
    offset += range.length;
  }
  return { ranges: normalized, byteLength: offset };
}

/**
 * Strict mixed memory view for one host actor. Only declared shared cartridge
 * ranges and declared virtual ranges exist in this view. Every multi-byte
 * operation must fit wholly within one declaration.
 */
export class StrictSidecarMemory {
  #realRam;
  #virtualRanges;
  #sharedRanges;
  #bytes;
  #view;

  constructor(realRam, { virtualRanges, sharedRanges, bytes } = {}) {
    for (const name of [
      'u8', 'i8', 'u16', 'i16', 'u32', 'setU8', 'setU16', 'setU32',
      'bchg8', 'bclr8', 'bset8', 'btst8',
    ]) {
      if (typeof realRam?.[name] !== 'function') {
        throw new TypeError(`realRam must implement ${name}()`);
      }
    }
    const virtual = normalizeRanges(virtualRanges, 'virtual');
    const shared = normalizeRanges(sharedRanges, 'shared');
    for (const range of virtual.ranges) {
      if (range.start < 0x1000000) {
        throw new RangeError(`${range.name} is not outside the cartridge address space`);
      }
    }
    for (const range of shared.ranges) {
      if (range.start < MACHINE.ramBase || range.end > MACHINE.ramBase + MACHINE.ramSize) {
        throw new RangeError(`${range.name} is outside main RAM`);
      }
    }
    if (bytes !== undefined && !(bytes instanceof Uint8Array)) {
      throw new TypeError('sidecar bytes must be a Uint8Array');
    }
    if (bytes !== undefined && bytes.length !== virtual.byteLength) {
      throw new RangeError(`sidecar bytes must be exactly ${virtual.byteLength} bytes`);
    }
    this.#realRam = realRam;
    this.#virtualRanges = virtual.ranges;
    this.#sharedRanges = shared.ranges;
    this.#bytes = bytes ?? new Uint8Array(virtual.byteLength);
    this.#view = new DataView(
      this.#bytes.buffer, this.#bytes.byteOffset, this.#bytes.byteLength);
  }

  get byteLength() { return this.#bytes.length; }

  snapshotBytes() { return new Uint8Array(this.#bytes); }

  restoreBytes(saved) {
    if (!(saved instanceof Uint8Array)) {
      throw new TypeError('sidecar snapshot must be a Uint8Array');
    }
    if (saved.length !== this.#bytes.length) {
      throw new RangeError(`sidecar snapshot must be exactly ${this.#bytes.length} bytes`);
    }
    this.#bytes.set(saved);
  }

  #location(address, width) {
    if (!Number.isSafeInteger(address)) throw new RangeError(`${address} is not an integer address`);
    const locate = (ranges, kind) => {
      for (const range of ranges) {
        if (address < range.start || address >= range.end) continue;
        if (address + width > range.end) {
          throw new RangeError(`${kind} access at $${address.toString(16)} crosses ${range.name}`);
        }
        return { kind, range, offset: range.offset + address - range.start };
      }
      return null;
    };
    const virtual = locate(this.#virtualRanges, 'virtual');
    if (virtual) return virtual;
    const shared = locate(this.#sharedRanges, 'shared');
    if (shared) return shared;
    const label = address >= 0x1000000 ? 'undeclared virtual address' : 'undeclared shared address';
    throw new RangeError(`${label} $${address.toString(16)}`);
  }

  #writeLocation(address, width) {
    const loc = this.#location(address, width);
    if (loc.kind === 'shared' && !loc.range.writable) {
      throw new TypeError(`shared range ${loc.range.name} is read-only`);
    }
    return loc;
  }

  u8(address) {
    const loc = this.#location(address, 1);
    return loc.kind === 'shared' ? this.#realRam.u8(address) : this.#bytes[loc.offset];
  }
  i8(address) {
    const loc = this.#location(address, 1);
    return loc.kind === 'shared' ? this.#realRam.i8(address) : this.#view.getInt8(loc.offset);
  }
  u16(address) {
    const loc = this.#location(address, 2);
    return loc.kind === 'shared' ? this.#realRam.u16(address)
      : this.#view.getUint16(loc.offset, false);
  }
  i16(address) {
    const loc = this.#location(address, 2);
    return loc.kind === 'shared' ? this.#realRam.i16(address)
      : this.#view.getInt16(loc.offset, false);
  }
  u32(address) {
    const loc = this.#location(address, 4);
    return loc.kind === 'shared' ? this.#realRam.u32(address)
      : this.#view.getUint32(loc.offset, false);
  }
  setU8(address, value) {
    const loc = this.#writeLocation(address, 1);
    if (loc.kind === 'shared') this.#realRam.setU8(address, value);
    else this.#bytes[loc.offset] = value & 0xff;
  }
  setU16(address, value) {
    const loc = this.#writeLocation(address, 2);
    if (loc.kind === 'shared') this.#realRam.setU16(address, value);
    else this.#view.setUint16(loc.offset, value & 0xffff, false);
  }
  setU32(address, value) {
    const loc = this.#writeLocation(address, 4);
    if (loc.kind === 'shared') this.#realRam.setU32(address, value);
    else this.#view.setUint32(loc.offset, value >>> 0, false);
  }
  bchg8(address, bit) {
    const loc = this.#writeLocation(address, 1);
    if (loc.kind === 'shared') return this.#realRam.bchg8(address, bit);
    const old = (this.#bytes[loc.offset] >> bit) & 1;
    this.#bytes[loc.offset] ^= 1 << bit;
    return old;
  }
  bclr8(address, bit) {
    const loc = this.#writeLocation(address, 1);
    if (loc.kind === 'shared') return this.#realRam.bclr8(address, bit);
    const old = (this.#bytes[loc.offset] >> bit) & 1;
    this.#bytes[loc.offset] &= ~(1 << bit) & 0xff;
    return old;
  }
  bset8(address, bit) {
    const loc = this.#writeLocation(address, 1);
    if (loc.kind === 'shared') return this.#realRam.bset8(address, bit);
    const old = (this.#bytes[loc.offset] >> bit) & 1;
    this.#bytes[loc.offset] |= 1 << bit;
    return old;
  }
  btst8(address, bit) {
    const loc = this.#location(address, 1);
    return loc.kind === 'shared' ? this.#realRam.btst8(address, bit)
      : (this.#bytes[loc.offset] >> bit) & 1;
  }
}
