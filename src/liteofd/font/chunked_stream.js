/* Copyright 2012 Mozilla Foundation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { UnknownErrorException } from "./util.js"
import { Stream } from "./stream.js";

class ChunkedStream extends Stream {
  constructor(arrayBuffer, length) {
    super(
      /* arrayBuffer = */ new Uint8Array(length),
      /* start = */ 0,
      /* length = */ length,
      /* dict = */ null
    );

    this.bytes = arrayBuffer;
    this.progressiveDataLength = length;
  }

  ensureByte(pos) {
    if (pos < this.progressiveDataLength) {
      return;
    } else {
      throw UnknownErrorException("byte error", "byte over length");
    }
  }


  ensureRange(begin, end) {
    if (begin >= end) {
      return;
    }
    if (end <= this.progressiveDataLength) {
      return;
    }
    if ( end > this.progressiveDataLength ) {
      throw UnknownErrorException("byte error", "byte over length");
    }
  }


  getByte() {
    const pos = this.pos;
    if (pos >= this.end) {
      return -1;
    }
    if (pos >= this.progressiveDataLength) {
      this.ensureByte(pos);
    }
    return this.bytes[this.pos++];
  }

  getBytes(length) {
    const bytes = this.bytes;
    const pos = this.pos;
    const strEnd = this.end;

    if (!length) {
      if (strEnd > this.progressiveDataLength) {
        this.ensureRange(pos, strEnd);
      }
      return bytes.subarray(pos, strEnd);
    }

    let end = pos + length;
    if (end > strEnd) {
      end = strEnd;
    }
    if (end > this.progressiveDataLength) {
      this.ensureRange(pos, end);
    }

    this.pos = end;
    return bytes.subarray(pos, end);
  }

  getBaseStreams() {
    return [this];
  }
}

export { ChunkedStream };
