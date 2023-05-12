// src/amqp-error.ts
var AMQPError = class extends Error {
  connection;
  /**
   * @param message - Error description
   * @param connection - The connection the error was raised on
   */
  constructor(message, connection) {
    super(message);
    this.name = "AMQPError";
    this.connection = connection;
  }
};

// src/amqp-view.ts
var AMQPView = class extends DataView {
  getUint64(byteOffset, littleEndian) {
    const left = this.getUint32(byteOffset, littleEndian);
    const right = this.getUint32(byteOffset + 4, littleEndian);
    const combined = littleEndian ? left + 2 ** 32 * right : 2 ** 32 * left + right;
    if (!Number.isSafeInteger(combined))
      console.warn(combined, "exceeds MAX_SAFE_INTEGER. Precision may be lost");
    return combined;
  }
  setUint64(byteOffset, value, littleEndian) {
    this.setBigUint64(byteOffset, BigInt(value), littleEndian);
  }
  getInt64(byteOffset, littleEndian) {
    return Number(this.getBigInt64(byteOffset, littleEndian));
  }
  setInt64(byteOffset, value, littleEndian) {
    this.setBigInt64(byteOffset, BigInt(value), littleEndian);
  }
  getShortString(byteOffset) {
    const len = this.getUint8(byteOffset);
    byteOffset += 1;
    if (typeof Buffer !== "undefined") {
      const text = Buffer.from(this.buffer, this.byteOffset + byteOffset, len).toString();
      return [text, len + 1];
    } else {
      const view = new Uint8Array(this.buffer, this.byteOffset + byteOffset, len);
      const text = new TextDecoder().decode(view);
      return [text, len + 1];
    }
  }
  setShortString(byteOffset, string) {
    if (typeof Buffer !== "undefined") {
      const len = Buffer.byteLength(string);
      if (len > 255)
        throw new Error(`Short string too long, ${len} bytes: ${string.substring(0, 255)}...`);
      this.setUint8(byteOffset, len);
      byteOffset += 1;
      Buffer.from(this.buffer, this.byteOffset + byteOffset, len).write(string);
      return len + 1;
    } else {
      const utf8 = new TextEncoder().encode(string);
      const len = utf8.byteLength;
      if (len > 255)
        throw new Error(`Short string too long, ${len} bytes: ${string.substring(0, 255)}...`);
      this.setUint8(byteOffset, len);
      byteOffset += 1;
      const view = new Uint8Array(this.buffer, this.byteOffset + byteOffset);
      view.set(utf8);
      return len + 1;
    }
  }
  getLongString(byteOffset, littleEndian) {
    const len = this.getUint32(byteOffset, littleEndian);
    byteOffset += 4;
    if (typeof Buffer !== "undefined") {
      const text = Buffer.from(this.buffer, this.byteOffset + byteOffset, len).toString();
      return [text, len + 4];
    } else {
      const view = new Uint8Array(this.buffer, this.byteOffset + byteOffset, len);
      const text = new TextDecoder().decode(view);
      return [text, len + 4];
    }
  }
  setLongString(byteOffset, string, littleEndian) {
    if (typeof Buffer !== "undefined") {
      const len = Buffer.byteLength(string);
      this.setUint32(byteOffset, len, littleEndian);
      byteOffset += 4;
      Buffer.from(this.buffer, this.byteOffset + byteOffset, len).write(string);
      return len + 4;
    } else {
      const utf8 = new TextEncoder().encode(string);
      const len = utf8.byteLength;
      this.setUint32(byteOffset, len, littleEndian);
      byteOffset += 4;
      const view = new Uint8Array(this.buffer, this.byteOffset + byteOffset);
      view.set(utf8);
      return len + 4;
    }
  }
  getProperties(byteOffset, littleEndian) {
    let j = byteOffset;
    const flags = this.getUint16(j, littleEndian);
    j += 2;
    const props = {};
    if ((flags & 32768) > 0) {
      const [contentType, len2] = this.getShortString(j);
      j += len2;
      props.contentType = contentType;
    }
    if ((flags & 16384) > 0) {
      const [contentEncoding, len2] = this.getShortString(j);
      j += len2;
      props.contentEncoding = contentEncoding;
    }
    if ((flags & 8192) > 0) {
      const [headers, len2] = this.getTable(j, littleEndian);
      j += len2;
      props.headers = headers;
    }
    if ((flags & 4096) > 0) {
      props.deliveryMode = this.getUint8(j);
      j += 1;
    }
    if ((flags & 2048) > 0) {
      props.priority = this.getUint8(j);
      j += 1;
    }
    if ((flags & 1024) > 0) {
      const [correlationId, len2] = this.getShortString(j);
      j += len2;
      props.correlationId = correlationId;
    }
    if ((flags & 512) > 0) {
      const [replyTo, len2] = this.getShortString(j);
      j += len2;
      props.replyTo = replyTo;
    }
    if ((flags & 256) > 0) {
      const [expiration, len2] = this.getShortString(j);
      j += len2;
      props.expiration = expiration;
    }
    if ((flags & 128) > 0) {
      const [messageId, len2] = this.getShortString(j);
      j += len2;
      props.messageId = messageId;
    }
    if ((flags & 64) > 0) {
      props.timestamp = new Date(this.getInt64(j, littleEndian) * 1e3);
      j += 8;
    }
    if ((flags & 32) > 0) {
      const [type, len2] = this.getShortString(j);
      j += len2;
      props.type = type;
    }
    if ((flags & 16) > 0) {
      const [userId, len2] = this.getShortString(j);
      j += len2;
      props.userId = userId;
    }
    if ((flags & 8) > 0) {
      const [appId, len2] = this.getShortString(j);
      j += len2;
      props.appId = appId;
    }
    const len = j - byteOffset;
    return [props, len];
  }
  setProperties(byteOffset, properties, littleEndian) {
    let j = byteOffset;
    let flags = 0;
    if (properties.contentType)
      flags = flags | 32768;
    if (properties.contentEncoding)
      flags = flags | 16384;
    if (properties.headers)
      flags = flags | 8192;
    if (properties.deliveryMode)
      flags = flags | 4096;
    if (properties.priority)
      flags = flags | 2048;
    if (properties.correlationId)
      flags = flags | 1024;
    if (properties.replyTo)
      flags = flags | 512;
    if (properties.expiration)
      flags = flags | 256;
    if (properties.messageId)
      flags = flags | 128;
    if (properties.timestamp)
      flags = flags | 64;
    if (properties.type)
      flags = flags | 32;
    if (properties.userId)
      flags = flags | 16;
    if (properties.appId)
      flags = flags | 8;
    this.setUint16(j, flags, littleEndian);
    j += 2;
    if (properties.contentType) {
      j += this.setShortString(j, properties.contentType);
    }
    if (properties.contentEncoding) {
      j += this.setShortString(j, properties.contentEncoding);
    }
    if (properties.headers) {
      j += this.setTable(j, properties.headers);
    }
    if (properties.deliveryMode) {
      this.setUint8(j, properties.deliveryMode);
      j += 1;
    }
    if (properties.priority) {
      this.setUint8(j, properties.priority);
      j += 1;
    }
    if (properties.correlationId) {
      j += this.setShortString(j, properties.correlationId);
    }
    if (properties.replyTo) {
      j += this.setShortString(j, properties.replyTo);
    }
    if (properties.expiration) {
      j += this.setShortString(j, properties.expiration);
    }
    if (properties.messageId) {
      j += this.setShortString(j, properties.messageId);
    }
    if (properties.timestamp) {
      const unixEpoch = Math.floor(Number(properties.timestamp) / 1e3);
      this.setInt64(j, unixEpoch, littleEndian);
      j += 8;
    }
    if (properties.type) {
      j += this.setShortString(j, properties.type);
    }
    if (properties.userId) {
      j += this.setShortString(j, properties.userId);
    }
    if (properties.appId) {
      j += this.setShortString(j, properties.appId);
    }
    const len = j - byteOffset;
    return len;
  }
  getTable(byteOffset, littleEndian) {
    const table = {};
    let i = byteOffset;
    const len = this.getUint32(byteOffset, littleEndian);
    i += 4;
    for (; i < byteOffset + 4 + len; ) {
      const [k, strLen] = this.getShortString(i);
      i += strLen;
      const [v, vLen] = this.getField(i, littleEndian);
      i += vLen;
      table[k] = v;
    }
    return [table, len + 4];
  }
  setTable(byteOffset, table, littleEndian) {
    let i = byteOffset + 4;
    for (const [key, value] of Object.entries(table)) {
      if (value === void 0)
        continue;
      i += this.setShortString(i, key);
      i += this.setField(i, value, littleEndian);
    }
    this.setUint32(byteOffset, i - byteOffset - 4, littleEndian);
    return i - byteOffset;
  }
  getField(byteOffset, littleEndian) {
    let i = byteOffset;
    const k = this.getUint8(i);
    i += 1;
    const type = String.fromCharCode(k);
    let v;
    let len;
    switch (type) {
      case "t":
        v = this.getUint8(i) === 1;
        i += 1;
        break;
      case "b":
        v = this.getInt8(i);
        i += 1;
        break;
      case "B":
        v = this.getUint8(i);
        i += 1;
        break;
      case "s":
        v = this.getInt16(i, littleEndian);
        i += 2;
        break;
      case "u":
        v = this.getUint16(i, littleEndian);
        i += 2;
        break;
      case "I":
        v = this.getInt32(i, littleEndian);
        i += 4;
        break;
      case "i":
        v = this.getUint32(i, littleEndian);
        i += 4;
        break;
      case "l":
        v = this.getInt64(i, littleEndian);
        i += 8;
        break;
      case "f":
        v = this.getFloat32(i, littleEndian);
        i += 4;
        break;
      case "d":
        v = this.getFloat64(i, littleEndian);
        i += 8;
        break;
      case "S":
        [v, len] = this.getLongString(i, littleEndian);
        i += len;
        break;
      case "F":
        [v, len] = this.getTable(i, littleEndian);
        i += len;
        break;
      case "A":
        [v, len] = this.getArray(i, littleEndian);
        i += len;
        break;
      case "x":
        [v, len] = this.getByteArray(i, littleEndian);
        i += len;
        break;
      case "T":
        v = new Date(this.getInt64(i, littleEndian) * 1e3);
        i += 8;
        break;
      case "V":
        v = null;
        break;
      case "D": {
        const scale = this.getUint8(i);
        i += 1;
        const value = this.getUint32(i, littleEndian);
        i += 4;
        v = value / 10 ** scale;
        break;
      }
      default:
        throw `Field type '${k}' not supported`;
    }
    return [v, i - byteOffset];
  }
  setField(byteOffset, field, littleEndian) {
    let i = byteOffset;
    switch (typeof field) {
      case "string":
        this.setUint8(i, "S".charCodeAt(0));
        i += 1;
        i += this.setLongString(i, field, littleEndian);
        break;
      case "boolean":
        this.setUint8(i, "t".charCodeAt(0));
        i += 1;
        this.setUint8(i, field ? 1 : 0);
        i += 1;
        break;
      case "bigint":
        this.setUint8(i, "l".charCodeAt(0));
        i += 1;
        this.setBigInt64(i, field, littleEndian);
        i += 8;
        break;
      case "number":
        if (Number.isInteger(field)) {
          if (-(2 ** 32) < field && field < 2 ** 32) {
            this.setUint8(i, "I".charCodeAt(0));
            i += 1;
            this.setInt32(i, field, littleEndian);
            i += 4;
          } else {
            this.setUint8(i, "l".charCodeAt(0));
            i += 1;
            this.setInt64(i, field, littleEndian);
            i += 8;
          }
        } else {
          if (-(2 ** 32) < field && field < 2 ** 32) {
            this.setUint8(i, "f".charCodeAt(0));
            i += 1;
            this.setFloat32(i, field, littleEndian);
            i += 4;
          } else {
            this.setUint8(i, "d".charCodeAt(0));
            i += 1;
            this.setFloat64(i, field, littleEndian);
            i += 8;
          }
        }
        break;
      case "object":
        if (Array.isArray(field)) {
          this.setUint8(i, "A".charCodeAt(0));
          i += 1;
          i += this.setArray(i, field, littleEndian);
        } else if (field instanceof Uint8Array) {
          this.setUint8(i, "x".charCodeAt(0));
          i += 1;
          i += this.setByteArray(i, field);
        } else if (field instanceof ArrayBuffer) {
          this.setUint8(i, "x".charCodeAt(0));
          i += 1;
          i += this.setByteArray(i, new Uint8Array(field));
        } else if (field instanceof Date) {
          this.setUint8(i, "T".charCodeAt(0));
          i += 1;
          const unixEpoch = Math.floor(Number(field) / 1e3);
          this.setInt64(i, unixEpoch, littleEndian);
          i += 8;
        } else if (field === null || field === void 0) {
          this.setUint8(i, "V".charCodeAt(0));
          i += 1;
        } else {
          this.setUint8(i, "F".charCodeAt(0));
          i += 1;
          i += this.setTable(i, field, littleEndian);
        }
        break;
      default:
        throw `Unsupported field type '${field}'`;
    }
    return i - byteOffset;
  }
  getArray(byteOffset, littleEndian) {
    const len = this.getUint32(byteOffset, littleEndian);
    byteOffset += 4;
    const endOffset = byteOffset + len;
    const v = [];
    for (; byteOffset < endOffset; ) {
      const [field, fieldLen] = this.getField(byteOffset, littleEndian);
      byteOffset += fieldLen;
      v.push(field);
    }
    return [v, len + 4];
  }
  setArray(byteOffset, array, littleEndian) {
    const start = byteOffset;
    byteOffset += 4;
    array.forEach((e) => {
      byteOffset += this.setField(byteOffset, e, littleEndian);
    });
    this.setUint32(start, byteOffset - start - 4, littleEndian);
    return byteOffset - start;
  }
  getByteArray(byteOffset, littleEndian) {
    const len = this.getUint32(byteOffset, littleEndian);
    byteOffset += 4;
    const v = new Uint8Array(this.buffer, this.byteOffset + byteOffset, len);
    return [v, len + 4];
  }
  setByteArray(byteOffset, data, littleEndian) {
    this.setUint32(byteOffset, data.byteLength, littleEndian);
    byteOffset += 4;
    const view = new Uint8Array(this.buffer, this.byteOffset + byteOffset, data.byteLength);
    view.set(data);
    return data.byteLength + 4;
  }
};

// src/amqp-queue.ts
var AMQPQueue = class {
  channel;
  name;
  /**
   * @param channel - channel this queue was declared on
   * @param name - name of the queue
   */
  constructor(channel, name) {
    this.channel = channel;
    this.name = name;
  }
  /**
   * Bind the queue to an exchange
   */
  bind(exchange, routingKey = "", args = {}) {
    return new Promise((resolve, reject) => {
      this.channel.queueBind(this.name, exchange, routingKey, args).then(() => resolve(this)).catch(reject);
    });
  }
  /**
   * Delete a binding between this queue and an exchange
   */
  unbind(exchange, routingKey = "", args = {}) {
    return new Promise((resolve, reject) => {
      this.channel.queueUnbind(this.name, exchange, routingKey, args).then(() => resolve(this)).catch(reject);
    });
  }
  /**
   * Publish a message directly to the queue
   * @param body - the data to be published, can be a string or an uint8array
   * @param properties - publish properties
   * @return fulfilled when the message is enqueue on the socket, or if publish confirm is enabled when the message is confirmed by the server
   */
  publish(body, properties = {}) {
    return new Promise((resolve, reject) => {
      this.channel.basicPublish("", this.name, body, properties).then(() => resolve(this)).catch(reject);
    });
  }
  /**
   * Subscribe to the queue
   * @param params
   * @param [params.noAck=true] - if messages are removed from the server upon delivery, or have to be acknowledged
   * @param [params.exclusive=false] - if this can be the only consumer of the queue, will return an Error if there are other consumers to the queue already
   * @param [params.tag=""] - tag of the consumer, will be server generated if left empty
   * @param [params.args={}] - custom arguments
   * @param {function(AMQPMessage) : void} callback - Function to be called for each received message
   */
  subscribe({ noAck = true, exclusive = false, tag = "", args = {} } = {}, callback) {
    return this.channel.basicConsume(this.name, { noAck, exclusive, tag, args }, callback);
  }
  /**
   * Unsubscribe from the queue
   */
  unsubscribe(consumerTag) {
    return new Promise((resolve, reject) => {
      this.channel.basicCancel(consumerTag).then(() => resolve(this)).catch(reject);
    });
  }
  /**
   * Delete the queue
   */
  delete() {
    return new Promise((resolve, reject) => {
      this.channel.queueDelete(this.name).then(() => resolve(this)).catch(reject);
    });
  }
  /**
   * Poll the queue for messages
   * @param params
   * @param params.noAck - automatically acknowledge messages when received
   */
  get({ noAck = true } = {}) {
    return this.channel.basicGet(this.name, { noAck });
  }
  purge() {
    return this.channel.queuePurge(this.name);
  }
};

// src/amqp-consumer.ts
var AMQPConsumer2 = class {
  channel;
  tag;
  onMessage;
  closed = false;
  closedError;
  resolveWait;
  rejectWait;
  timeoutId;
  /**
   * @param channel - the consumer is created on
   * @param tag - consumer tag
   * @param onMessage - callback executed when a message arrive
   */
  constructor(channel, tag, onMessage) {
    this.channel = channel;
    this.tag = tag;
    this.onMessage = onMessage;
  }
  /**
   * Wait for the consumer to finish.
   * @param [timeout] wait for this many milliseconds and then return regardless
   * @return Fulfilled when the consumer/channel/connection is closed by the client. Rejected if the timeout is hit.
   */
  wait(timeout) {
    if (this.closedError)
      return Promise.reject(this.closedError);
    if (this.closed)
      return Promise.resolve();
    return new Promise((resolve, reject) => {
      this.resolveWait = resolve;
      this.rejectWait = reject;
      if (timeout) {
        const onTimeout = () => reject(new AMQPError("Timeout", this.channel.connection));
        this.timeoutId = setTimeout(onTimeout, timeout);
      }
    });
  }
  /**
   * Cancel/abort/stop the consumer. No more messages will be deliviered to the consumer.
   * Note that any unacked messages are still unacked as they belong to the channel and not the consumer.
   */
  cancel() {
    return this.channel.basicCancel(this.tag);
  }
  /**
   * @ignore
   * @param [err] - why the consumer was closed
   */
  setClosed(err) {
    this.closed = true;
    if (err)
      this.closedError = err;
    if (this.timeoutId)
      clearTimeout(this.timeoutId);
    if (err) {
      if (this.rejectWait)
        this.rejectWait(err);
    } else {
      if (this.resolveWait)
        this.resolveWait();
    }
  }
};

// src/amqp-channel.ts
import * as process2 from "process";
var AMQPChannel3 = class {
  connection;
  id;
  consumers = /* @__PURE__ */ new Map();
  promises = [];
  unconfirmedPublishes = [];
  closed = false;
  confirmId = 0;
  delivery;
  getMessage;
  returned;
  onerror;
  /**
   * @param connection - The connection this channel belongs to
   * @param id - ID of the channel
   */
  constructor(connection, id) {
    this.connection = connection;
    this.id = id;
    this.onerror = (reason) => console.error(`channel ${this.id} closed: ${reason}`);
  }
  /**
   * Declare a queue and return an AMQPQueue instance.
   */
  queue(name = "", { passive = false, durable = name !== "", autoDelete = name === "", exclusive = name === "" } = {}, args = {}) {
    return new Promise((resolve, reject) => {
      this.queueDeclare(name, { passive, durable, autoDelete, exclusive }, args).then(({ name: name2 }) => resolve(new AMQPQueue(this, name2))).catch(reject);
    });
  }
  /**
   * Alias for basicQos
   * @param prefetchCount - max inflight messages
   */
  prefetch(prefetchCount) {
    return this.basicQos(prefetchCount);
  }
  /**
   * Default handler for Returned messages
   * @param message returned from server
   */
  onReturn(message) {
    console.error("Message returned from server", message);
  }
  /**
   * Close the channel gracefully
   * @param [reason] might be logged by the server
   */
  close(reason = "", code = 200) {
    if (this.closed)
      return this.rejectClosed();
    this.closed = true;
    let j = 0;
    const frame = new AMQPView(new ArrayBuffer(512));
    frame.setUint8(j, 1);
    j += 1;
    frame.setUint16(j, this.id);
    j += 2;
    frame.setUint32(j, 0);
    j += 4;
    frame.setUint16(j, 20);
    j += 2;
    frame.setUint16(j, 40);
    j += 2;
    frame.setUint16(j, code);
    j += 2;
    j += frame.setShortString(j, reason);
    frame.setUint16(j, 0);
    j += 2;
    frame.setUint16(j, 0);
    j += 2;
    frame.setUint8(j, 206);
    j += 1;
    frame.setUint32(3, j - 8);
    return this.sendRpc(frame, j);
  }
  /**
   * Synchronously receive a message from a queue
   * @param queue - name of the queue to poll
   * @param param
   * @param [param.noAck=true] - if message is removed from the server upon delivery, or have to be acknowledged
   * @return - returns null if the queue is empty otherwise a single message
   */
  basicGet(queue, { noAck = true } = {}) {
    if (this.closed)
      return this.rejectClosed();
    let j = 0;
    const frame = new AMQPView(new ArrayBuffer(512));
    frame.setUint8(j, 1);
    j += 1;
    frame.setUint16(j, this.id);
    j += 2;
    frame.setUint32(j, 11);
    j += 4;
    frame.setUint16(j, 60);
    j += 2;
    frame.setUint16(j, 70);
    j += 2;
    frame.setUint16(j, 0);
    j += 2;
    j += frame.setShortString(j, queue);
    frame.setUint8(j, noAck ? 1 : 0);
    j += 1;
    frame.setUint8(j, 206);
    j += 1;
    frame.setUint32(3, j - 8);
    return this.sendRpc(frame, j);
  }
  /**
   * Consume from a queue. Messages will be delivered asynchronously.
   * @param queue - name of the queue to poll
   * @param param
   * @param [param.tag=""] - tag of the consumer, will be server generated if left empty
   * @param [param.noAck=true] - if messages are removed from the server upon delivery, or have to be acknowledged
   * @param [param.exclusive=false] - if this can be the only consumer of the queue, will return an Error if there are other consumers to the queue already
   * @param [param.args={}] - custom arguments
   * @param {function(AMQPMessage) : void} callback - will be called for each message delivered to this consumer
   */
  basicConsume(queue, { tag = "", noAck = true, exclusive = false, args = {} } = {}, callback) {
    if (this.closed)
      return this.rejectClosed();
    let j = 0;
    const noWait = false;
    const noLocal = false;
    const frame = new AMQPView(new ArrayBuffer(4096));
    frame.setUint8(j, 1);
    j += 1;
    frame.setUint16(j, this.id);
    j += 2;
    frame.setUint32(j, 0);
    j += 4;
    frame.setUint16(j, 60);
    j += 2;
    frame.setUint16(j, 20);
    j += 2;
    frame.setUint16(j, 0);
    j += 2;
    j += frame.setShortString(j, queue);
    j += frame.setShortString(j, tag);
    let bits = 0;
    if (noLocal)
      bits = bits | 1 << 0;
    if (noAck)
      bits = bits | 1 << 1;
    if (exclusive)
      bits = bits | 1 << 2;
    if (noWait)
      bits = bits | 1 << 3;
    frame.setUint8(j, bits);
    j += 1;
    j += frame.setTable(j, args);
    frame.setUint8(j, 206);
    j += 1;
    frame.setUint32(3, j - 8);
    return new Promise((resolve, reject) => {
      this.sendRpc(frame, j).then((consumerTag) => {
        const consumer = new AMQPConsumer2(this, consumerTag, callback);
        this.consumers.set(consumerTag, consumer);
        resolve(consumer);
      }).catch(reject);
    });
  }
  /**
   * Cancel/stop a consumer
   * @param tag - consumer tag
   */
  basicCancel(tag) {
    if (this.closed)
      return this.rejectClosed();
    const noWait = false;
    let j = 0;
    const frame = new AMQPView(new ArrayBuffer(512));
    frame.setUint8(j, 1);
    j += 1;
    frame.setUint16(j, this.id);
    j += 2;
    frame.setUint32(j, 0);
    j += 4;
    frame.setUint16(j, 60);
    j += 2;
    frame.setUint16(j, 30);
    j += 2;
    j += frame.setShortString(j, tag);
    frame.setUint8(j, noWait ? 1 : 0);
    j += 1;
    frame.setUint8(j, 206);
    j += 1;
    frame.setUint32(3, j - 8);
    return new Promise((resolve, reject) => {
      this.sendRpc(frame, j).then((consumerTag) => {
        const consumer = this.consumers.get(consumerTag);
        if (consumer) {
          consumer.setClosed();
          this.consumers.delete(consumerTag);
        }
        resolve(this);
      }).catch(reject);
    });
  }
  /**
   * Acknowledge a delivered message
   * @param deliveryTag - tag of the message
   * @param [multiple=false] - batch confirm all messages up to this delivery tag
   */
  basicAck(deliveryTag, multiple = false) {
    if (this.closed)
      return this.rejectClosed();
    let j = 0;
    const frame = new AMQPView(new ArrayBuffer(21));
    frame.setUint8(j, 1);
    j += 1;
    frame.setUint16(j, this.id);
    j += 2;
    frame.setUint32(j, 13);
    j += 4;
    frame.setUint16(j, 60);
    j += 2;
    frame.setUint16(j, 80);
    j += 2;
    frame.setUint64(j, deliveryTag);
    j += 8;
    frame.setUint8(j, multiple ? 1 : 0);
    j += 1;
    frame.setUint8(j, 206);
    j += 1;
    return this.connection.send(new Uint8Array(frame.buffer, 0, 21));
  }
  /**
   * Acknowledge a delivered message
   * @param deliveryTag - tag of the message
   * @param [requeue=false] - if the message should be requeued or removed
   * @param [multiple=false] - batch confirm all messages up to this delivery tag
   */
  basicNack(deliveryTag, requeue = false, multiple = false) {
    if (this.closed)
      return this.rejectClosed();
    let j = 0;
    const frame = new AMQPView(new ArrayBuffer(21));
    frame.setUint8(j, 1);
    j += 1;
    frame.setUint16(j, this.id);
    j += 2;
    frame.setUint32(j, 13);
    j += 4;
    frame.setUint16(j, 60);
    j += 2;
    frame.setUint16(j, 120);
    j += 2;
    frame.setUint64(j, deliveryTag);
    j += 8;
    let bits = 0;
    if (multiple)
      bits = bits | 1 << 0;
    if (requeue)
      bits = bits | 1 << 1;
    frame.setUint8(j, bits);
    j += 1;
    frame.setUint8(j, 206);
    j += 1;
    return this.connection.send(new Uint8Array(frame.buffer, 0, 21));
  }
  /**
   * Acknowledge a delivered message
   * @param deliveryTag - tag of the message
   * @param [requeue=false] - if the message should be requeued or removed
   */
  basicReject(deliveryTag, requeue = false) {
    if (this.closed)
      return this.rejectClosed();
    let j = 0;
    const frame = new AMQPView(new ArrayBuffer(21));
    frame.setUint8(j, 1);
    j += 1;
    frame.setUint16(j, this.id);
    j += 2;
    frame.setUint32(j, 13);
    j += 4;
    frame.setUint16(j, 60);
    j += 2;
    frame.setUint16(j, 90);
    j += 2;
    frame.setUint64(j, deliveryTag);
    j += 8;
    frame.setUint8(j, requeue ? 1 : 0);
    j += 1;
    frame.setUint8(j, 206);
    j += 1;
    return this.connection.send(new Uint8Array(frame.buffer, 0, 21));
  }
  /**
   * Tell the server to redeliver all unacknowledged messages again, or reject and requeue them.
   * @param [requeue=false] - if the message should be requeued or redeliviered to this channel
   */
  basicRecover(requeue = false) {
    if (this.closed)
      return this.rejectClosed();
    let j = 0;
    const frame = new AMQPView(new ArrayBuffer(13));
    frame.setUint8(j, 1);
    j += 1;
    frame.setUint16(j, this.id);
    j += 2;
    frame.setUint32(j, 5);
    j += 4;
    frame.setUint16(j, 60);
    j += 2;
    frame.setUint16(j, 110);
    j += 2;
    frame.setUint8(j, requeue ? 1 : 0);
    j += 1;
    frame.setUint8(j, 206);
    j += 1;
    return this.sendRpc(frame, j);
  }
  /**
   * Publish a message
   * @param exchange - the exchange to publish to, the exchange must exists
   * @param routingKey - routing key
   * @param data - the data to be published, can be a string or an uint8array
   * @param properties - properties to be published
   * @param [mandatory] - if the message should be returned if there's no queue to be delivered to
   * @param [immediate] - if the message should be returned if it can't be delivered to a consumer immediately (not supported in RabbitMQ)
   * @return - fulfilled when the message is enqueue on the socket, or if publish confirm is enabled when the message is confirmed by the server
   */
  async basicPublish(exchange, routingKey, data, properties = {}, mandatory = false, immediate = false) {
    if (this.closed)
      return this.rejectClosed();
    if (this.connection.blocked)
      return Promise.reject(new AMQPError(`Connection blocked by server: ${this.connection.blocked}`, this.connection));
    let body;
    if (typeof Buffer !== "undefined" && data instanceof Buffer) {
      body = data;
    } else if (data instanceof Uint8Array) {
      body = data;
    } else if (data instanceof ArrayBuffer) {
      body = new Uint8Array(data);
    } else if (data === null) {
      body = new Uint8Array(0);
    } else if (typeof data === "string") {
      body = this.connection.textEncoder.encode(data);
    } else {
      throw new TypeError(`Invalid type ${typeof data} for parameter data`);
    }
    let j = 0;
    const buffer = this.connection.bufferPool.pop() || new AMQPView(new ArrayBuffer(this.connection.frameMax));
    buffer.setUint8(j, 1);
    j += 1;
    buffer.setUint16(j, this.id);
    j += 2;
    j += 4;
    buffer.setUint16(j, 60);
    j += 2;
    buffer.setUint16(j, 40);
    j += 2;
    buffer.setUint16(j, 0);
    j += 2;
    j += buffer.setShortString(j, exchange);
    j += buffer.setShortString(j, routingKey);
    let bits = 0;
    if (mandatory)
      bits = bits | 1 << 0;
    if (immediate)
      bits = bits | 1 << 1;
    buffer.setUint8(j, bits);
    j += 1;
    buffer.setUint8(j, 206);
    j += 1;
    buffer.setUint32(3, j - 8);
    const headerStart = j;
    buffer.setUint8(j, 2);
    j += 1;
    buffer.setUint16(j, this.id);
    j += 2;
    j += 4;
    buffer.setUint16(j, 60);
    j += 2;
    buffer.setUint16(j, 0);
    j += 2;
    buffer.setUint32(j, 0);
    j += 4;
    buffer.setUint32(j, body.byteLength);
    j += 4;
    j += buffer.setProperties(j, properties);
    buffer.setUint8(j, 206);
    j += 1;
    buffer.setUint32(headerStart + 3, j - headerStart - 8);
    if (body.byteLength === 0) {
      await this.connection.send(new Uint8Array(buffer.buffer, 0, j));
    } else if (j >= buffer.byteLength - 8) {
      await this.connection.send(new Uint8Array(buffer.buffer, 0, j));
      j = 0;
    }
    for (let bodyPos = 0; bodyPos < body.byteLength; ) {
      const frameSize = Math.min(body.byteLength - bodyPos, buffer.byteLength - 8 - j);
      const dataSlice = body.subarray(bodyPos, bodyPos + frameSize);
      buffer.setUint8(j, 3);
      j += 1;
      buffer.setUint16(j, this.id);
      j += 2;
      buffer.setUint32(j, frameSize);
      j += 4;
      const bodyView = new Uint8Array(buffer.buffer, j, frameSize);
      bodyView.set(dataSlice);
      j += frameSize;
      buffer.setUint8(j, 206);
      j += 1;
      await this.connection.send(new Uint8Array(buffer.buffer, 0, j));
      bodyPos += frameSize;
      j = 0;
    }
    this.connection.bufferPool.push(buffer);
    if (this.confirmId) {
      return new Promise((resolve, reject) => this.unconfirmedPublishes.push([this.confirmId++, resolve, reject]));
    } else {
      return Promise.resolve(0);
    }
  }
  /**
   * Set prefetch limit.
   * Recommended to set as each unacknowledge message will be store in memory of the client.
   * The server won't deliver more messages than the limit until messages are acknowledged.
   * @param prefetchCount - number of messages to limit to
   * @param prefetchSize - number of bytes to limit to (not supported by RabbitMQ)
   * @param global - if the prefetch is limited to the channel, or if false to each consumer
   */
  basicQos(prefetchCount, prefetchSize = 0, global = false) {
    if (this.closed)
      return this.rejectClosed();
    let j = 0;
    const frame = new AMQPView(new ArrayBuffer(19));
    frame.setUint8(j, 1);
    j += 1;
    frame.setUint16(j, this.id);
    j += 2;
    frame.setUint32(j, 11);
    j += 4;
    frame.setUint16(j, 60);
    j += 2;
    frame.setUint16(j, 10);
    j += 2;
    frame.setUint32(j, prefetchSize);
    j += 4;
    frame.setUint16(j, prefetchCount);
    j += 2;
    frame.setUint8(j, global ? 1 : 0);
    j += 1;
    frame.setUint8(j, 206);
    j += 1;
    return this.sendRpc(frame, j);
  }
  /**
   * Enable or disable flow. Disabling flow will stop the server from delivering messages to consumers.
   * Not supported in RabbitMQ
   * @param active - false to stop the flow, true to accept messages
   */
  basicFlow(active = true) {
    if (this.closed)
      return this.rejectClosed();
    let j = 0;
    const frame = new AMQPView(new ArrayBuffer(13));
    frame.setUint8(j, 1);
    j += 1;
    frame.setUint16(j, this.id);
    j += 2;
    frame.setUint32(j, 5);
    j += 4;
    frame.setUint16(j, 20);
    j += 2;
    frame.setUint16(j, 20);
    j += 2;
    frame.setUint8(j, active ? 1 : 0);
    j += 1;
    frame.setUint8(j, 206);
    j += 1;
    return this.sendRpc(frame, j);
  }
  /**
   * Enable publish confirm. The server will then confirm each publish with an Ack or Nack when the message is enqueued.
   */
  confirmSelect() {
    if (this.closed)
      return this.rejectClosed();
    let j = 0;
    const frame = new AMQPView(new ArrayBuffer(13));
    frame.setUint8(j, 1);
    j += 1;
    frame.setUint16(j, this.id);
    j += 2;
    frame.setUint32(j, 5);
    j += 4;
    frame.setUint16(j, 85);
    j += 2;
    frame.setUint16(j, 10);
    j += 2;
    frame.setUint8(j, 0);
    j += 1;
    frame.setUint8(j, 206);
    j += 1;
    return this.sendRpc(frame, j);
  }
  /**
   * Declare a queue
   * @param name - name of the queue, if empty the server will generate a name
   * @param params
   * @param [params.passive=false] - if the queue name doesn't exists the channel will be closed with an error, fulfilled if the queue name does exists
   * @param [params.durable=true] - if the queue should survive server restarts
   * @param [params.autoDelete=false] - if the queue should be deleted when the last consumer of the queue disconnects
   * @param [params.exclusive=false] - if the queue should be deleted when the channel is closed
   * @param args - optional custom queue arguments
   * @return fulfilled when confirmed by the server
   */
  queueDeclare(name = "", { passive = false, durable = name !== "", autoDelete = name === "", exclusive = name === "" } = {}, args = {}) {
    if (this.closed)
      return this.rejectClosed();
    const noWait = false;
    let j = 0;
    const declare = new AMQPView(new ArrayBuffer(4096));
    declare.setUint8(j, 1);
    j += 1;
    declare.setUint16(j, this.id);
    j += 2;
    declare.setUint32(j, 0);
    j += 4;
    declare.setUint16(j, 50);
    j += 2;
    declare.setUint16(j, 10);
    j += 2;
    declare.setUint16(j, 0);
    j += 2;
    j += declare.setShortString(j, name);
    let bits = 0;
    if (passive)
      bits = bits | 1 << 0;
    if (durable)
      bits = bits | 1 << 1;
    if (exclusive)
      bits = bits | 1 << 2;
    if (autoDelete)
      bits = bits | 1 << 3;
    if (noWait)
      bits = bits | 1 << 4;
    declare.setUint8(j, bits);
    j += 1;
    j += declare.setTable(j, args);
    declare.setUint8(j, 206);
    j += 1;
    declare.setUint32(3, j - 8);
    return this.sendRpc(declare, j);
  }
  /**
   * Delete a queue
   * @param name - name of the queue, if empty it will delete the last declared queue
   * @param params
   * @param [params.ifUnused=false] - only delete if the queue doesn't have any consumers
   * @param [params.ifEmpty=false] - only delete if the queue is empty
   */
  queueDelete(name = "", { ifUnused = false, ifEmpty = false } = {}) {
    if (this.closed)
      return this.rejectClosed();
    const noWait = false;
    let j = 0;
    const frame = new AMQPView(new ArrayBuffer(512));
    frame.setUint8(j, 1);
    j += 1;
    frame.setUint16(j, this.id);
    j += 2;
    frame.setUint32(j, 0);
    j += 4;
    frame.setUint16(j, 50);
    j += 2;
    frame.setUint16(j, 40);
    j += 2;
    frame.setUint16(j, 0);
    j += 2;
    j += frame.setShortString(j, name);
    let bits = 0;
    if (ifUnused)
      bits = bits | 1 << 0;
    if (ifEmpty)
      bits = bits | 1 << 1;
    if (noWait)
      bits = bits | 1 << 2;
    frame.setUint8(j, bits);
    j += 1;
    frame.setUint8(j, 206);
    j += 1;
    frame.setUint32(3, j - 8);
    return this.sendRpc(frame, j);
  }
  /**
   * Bind a queue to an exchange
   * @param queue - name of the queue
   * @param exchange - name of the exchange
   * @param routingKey - key to bind with
   * @param args - optional arguments, e.g. for header exchanges
   * @return fulfilled when confirmed by the server
   */
  queueBind(queue, exchange, routingKey, args = {}) {
    if (this.closed)
      return this.rejectClosed();
    const noWait = false;
    let j = 0;
    const bind = new AMQPView(new ArrayBuffer(4096));
    bind.setUint8(j, 1);
    j += 1;
    bind.setUint16(j, this.id);
    j += 2;
    bind.setUint32(j, 0);
    j += 4;
    bind.setUint16(j, 50);
    j += 2;
    bind.setUint16(j, 20);
    j += 2;
    bind.setUint16(j, 0);
    j += 2;
    j += bind.setShortString(j, queue);
    j += bind.setShortString(j, exchange);
    j += bind.setShortString(j, routingKey);
    bind.setUint8(j, noWait ? 1 : 0);
    j += 1;
    j += bind.setTable(j, args);
    bind.setUint8(j, 206);
    j += 1;
    bind.setUint32(3, j - 8);
    return this.sendRpc(bind, j);
  }
  /**
   * Unbind a queue from an exchange
   * @param queue - name of the queue
   * @param exchange - name of the exchange
   * @param routingKey - key that was bound
   * @param args - arguments, e.g. for header exchanges
   * @return fulfilled when confirmed by the server
   */
  queueUnbind(queue, exchange, routingKey, args = {}) {
    if (this.closed)
      return this.rejectClosed();
    let j = 0;
    const unbind = new AMQPView(new ArrayBuffer(4096));
    unbind.setUint8(j, 1);
    j += 1;
    unbind.setUint16(j, this.id);
    j += 2;
    unbind.setUint32(j, 0);
    j += 4;
    unbind.setUint16(j, 50);
    j += 2;
    unbind.setUint16(j, 50);
    j += 2;
    unbind.setUint16(j, 0);
    j += 2;
    j += unbind.setShortString(j, queue);
    j += unbind.setShortString(j, exchange);
    j += unbind.setShortString(j, routingKey);
    j += unbind.setTable(j, args);
    unbind.setUint8(j, 206);
    j += 1;
    unbind.setUint32(3, j - 8);
    return this.sendRpc(unbind, j);
  }
  /**
   * Purge a queue
   * @param queue - name of the queue
   * @return fulfilled when confirmed by the server
   */
  queuePurge(queue) {
    if (this.closed)
      return this.rejectClosed();
    const noWait = false;
    let j = 0;
    const purge = new AMQPView(new ArrayBuffer(512));
    purge.setUint8(j, 1);
    j += 1;
    purge.setUint16(j, this.id);
    j += 2;
    purge.setUint32(j, 0);
    j += 4;
    purge.setUint16(j, 50);
    j += 2;
    purge.setUint16(j, 30);
    j += 2;
    purge.setUint16(j, 0);
    j += 2;
    j += purge.setShortString(j, queue);
    purge.setUint8(j, noWait ? 1 : 0);
    j += 1;
    purge.setUint8(j, 206);
    j += 1;
    purge.setUint32(3, j - 8);
    return this.sendRpc(purge, j);
  }
  /**
   * Declare an exchange
   * @param name - name of the exchange
   * @param type - type of exchange (direct, fanout, topic, header, or a custom type)
   * @param param
   * @param [param.passive=false] - if the exchange name doesn't exists the channel will be closed with an error, fulfilled if the exchange name does exists
   * @param [param.durable=true] - if the exchange should survive server restarts
   * @param [param.autoDelete=false] - if the exchange should be deleted when the last binding from it is deleted
   * @param [param.internal=false] - if exchange is internal to the server. Client's can't publish to internal exchanges.
   * @param args - optional arguments
   * @return Fulfilled when the exchange is created or if it already exists
   */
  exchangeDeclare(name, type, { passive = false, durable = true, autoDelete = false, internal = false } = {}, args = {}) {
    const noWait = false;
    let j = 0;
    const frame = new AMQPView(new ArrayBuffer(4096));
    frame.setUint8(j, 1);
    j += 1;
    frame.setUint16(j, this.id);
    j += 2;
    frame.setUint32(j, 0);
    j += 4;
    frame.setUint16(j, 40);
    j += 2;
    frame.setUint16(j, 10);
    j += 2;
    frame.setUint16(j, 0);
    j += 2;
    j += frame.setShortString(j, name);
    j += frame.setShortString(j, type);
    let bits = 0;
    if (passive)
      bits = bits | 1 << 0;
    if (durable)
      bits = bits | 1 << 1;
    if (autoDelete)
      bits = bits | 1 << 2;
    if (internal)
      bits = bits | 1 << 3;
    if (noWait)
      bits = bits | 1 << 4;
    frame.setUint8(j, bits);
    j += 1;
    j += frame.setTable(j, args);
    frame.setUint8(j, 206);
    j += 1;
    frame.setUint32(3, j - 8);
    return this.sendRpc(frame, j);
  }
  /**
   * Delete an exchange
   * @param name - name of the exchange
   * @param param
   * @param [param.ifUnused=false] - only delete if the exchange doesn't have any bindings
   * @return Fulfilled when the exchange is deleted or if it's already deleted
   */
  exchangeDelete(name, { ifUnused = false } = {}) {
    const noWait = false;
    let j = 0;
    const frame = new AMQPView(new ArrayBuffer(512));
    frame.setUint8(j, 1);
    j += 1;
    frame.setUint16(j, this.id);
    j += 2;
    frame.setUint32(j, 0);
    j += 4;
    frame.setUint16(j, 40);
    j += 2;
    frame.setUint16(j, 20);
    j += 2;
    frame.setUint16(j, 0);
    j += 2;
    j += frame.setShortString(j, name);
    let bits = 0;
    if (ifUnused)
      bits = bits | 1 << 0;
    if (noWait)
      bits = bits | 1 << 1;
    frame.setUint8(j, bits);
    j += 1;
    frame.setUint8(j, 206);
    j += 1;
    frame.setUint32(3, j - 8);
    return this.sendRpc(frame, j);
  }
  /**
   * Exchange to exchange binding.
   * @param destination - name of the destination exchange
   * @param source - name of the source exchange
   * @param routingKey - key to bind with
   * @param args - optional arguments, e.g. for header exchanges
   * @return fulfilled when confirmed by the server
   */
  exchangeBind(destination, source, routingKey = "", args = {}) {
    if (this.closed)
      return this.rejectClosed();
    let j = 0;
    const bind = new AMQPView(new ArrayBuffer(4096));
    bind.setUint8(j, 1);
    j += 1;
    bind.setUint16(j, this.id);
    j += 2;
    bind.setUint32(j, 0);
    j += 4;
    bind.setUint16(j, 40);
    j += 2;
    bind.setUint16(j, 30);
    j += 2;
    bind.setUint16(j, 0);
    j += 2;
    j += bind.setShortString(j, destination);
    j += bind.setShortString(j, source);
    j += bind.setShortString(j, routingKey);
    bind.setUint8(j, 0);
    j += 1;
    j += bind.setTable(j, args);
    bind.setUint8(j, 206);
    j += 1;
    bind.setUint32(3, j - 8);
    return this.sendRpc(bind, j);
  }
  /**
   * Delete an exchange-to-exchange binding
   * @param destination - name of destination exchange
   * @param source - name of the source exchange
   * @param routingKey - key that was bound
   * @param args - arguments, e.g. for header exchanges
   * @return fulfilled when confirmed by the server
   */
  exchangeUnbind(destination, source, routingKey = "", args = {}) {
    if (this.closed)
      return this.rejectClosed();
    let j = 0;
    const unbind = new AMQPView(new ArrayBuffer(4096));
    unbind.setUint8(j, 1);
    j += 1;
    unbind.setUint16(j, this.id);
    j += 2;
    unbind.setUint32(j, 0);
    j += 4;
    unbind.setUint16(j, 40);
    j += 2;
    unbind.setUint16(j, 40);
    j += 2;
    unbind.setUint16(j, 0);
    j += 2;
    j += unbind.setShortString(j, destination);
    j += unbind.setShortString(j, source);
    j += unbind.setShortString(j, routingKey);
    unbind.setUint8(j, 0);
    j += 1;
    j += unbind.setTable(j, args);
    unbind.setUint8(j, 206);
    j += 1;
    unbind.setUint32(3, j - 8);
    return this.sendRpc(unbind, j);
  }
  /**
   * Set this channel in Transaction mode.
   * Rember to commit the transaction, overwise the server will eventually run out of memory.
   */
  txSelect() {
    return this.txMethod(10);
  }
  /**
   * Commit a transaction
   */
  txCommit() {
    return this.txMethod(20);
  }
  /**
   * Rollback a transaction
   */
  txRollback() {
    return this.txMethod(30);
  }
  txMethod(methodId) {
    if (this.closed)
      return this.rejectClosed();
    let j = 0;
    const frame = new AMQPView(new ArrayBuffer(12));
    frame.setUint8(j, 1);
    j += 1;
    frame.setUint16(j, this.id);
    j += 2;
    frame.setUint32(j, 4);
    j += 4;
    frame.setUint16(j, 90);
    j += 2;
    frame.setUint16(j, methodId);
    j += 2;
    frame.setUint8(j, 206);
    j += 1;
    return this.sendRpc(frame, j);
  }
  /**
   * Resolves the next RPC promise
   * @ignore
   */
  resolvePromise(value) {
    const promise = this.promises.shift();
    if (promise) {
      const [resolve] = promise;
      resolve(value);
      return true;
    }
    return false;
  }
  /**
   * Rejects the next RPC promise
   * @return true if a promise was rejected, otherwise false
   */
  rejectPromise(err) {
    const promise = this.promises.shift();
    if (promise) {
      const [, reject] = promise;
      reject(err);
      return true;
    }
    return false;
  }
  /**
   * Send a RPC request, will resolve a RPC promise when RPC response arrives
   * @param frame with data
   * @param frameSize - bytes the frame actually is
   */
  sendRpc(frame, frameSize) {
    return new Promise((resolve, reject) => {
      this.connection.send(new Uint8Array(frame.buffer, 0, frameSize)).then(() => this.promises.push([resolve, reject])).catch(reject);
    });
  }
  /**
   * Marks the channel as closed
   * All outstanding RPC requests will be rejected
   * All outstanding publish confirms will be rejected
   * All consumers will be marked as closed
   * @ignore
   * @param [err] - why the channel was closed
   */
  setClosed(err) {
    const closedByServer = err !== void 0;
    err ||= new Error("Connection closed by client");
    if (!this.closed) {
      this.closed = true;
      this.consumers.forEach((consumer) => consumer.setClosed(err));
      this.consumers.clear();
      while (this.rejectPromise(err)) {
        1;
      }
      this.unconfirmedPublishes.forEach(([, , reject]) => reject(err));
      this.unconfirmedPublishes.length = 0;
      if (closedByServer)
        this.onerror(err.message);
    }
    setTimeout(() => {
      console.error("\u0421\u043E\u0435\u0434\u0438\u043D\u0435\u043D\u0438\u0435 \u0437\u0430\u043A\u0440\u044B\u0442\u043E, \u0430\u0432\u0430\u0440\u0438\u0439\u043D\u043E\u0435 \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u0438\u0435 \u0441 \u043A\u043E\u0434\u043E\u043C 16");
      process2.exit(16);
    }, 3e3);
  }
  /**
   * @return Rejected promise with an error
   */
  rejectClosed() {
    return Promise.reject(new AMQPError("Channel is closed", this.connection));
  }
  /**
   * Called from AMQPBaseClient when a publish is confirmed by the server.
   * Will fulfill one or more (if multiple) Unconfirmed Publishes.
   * @ignore
   * @param deliveryTag
   * @param multiple - true if all unconfirmed publishes up to this deliveryTag should be resolved or just this one
   * @param nack - true if negative confirm, hence reject the unconfirmed publish(es)
   */
  publishConfirmed(deliveryTag, multiple, nack) {
    const idx = this.unconfirmedPublishes.findIndex(([tag]) => tag === deliveryTag);
    if (idx !== -1) {
      const confirmed = multiple ? this.unconfirmedPublishes.splice(0, idx + 1) : this.unconfirmedPublishes.splice(idx, 1);
      confirmed.forEach(([tag, resolve, reject]) => {
        if (nack)
          reject(new Error("Message rejected"));
        else
          resolve(tag);
      });
    } else {
      console.warn("Cant find unconfirmed deliveryTag", deliveryTag, "multiple:", multiple, "nack:", nack);
    }
  }
  /**
   * Called from AMQPBaseClient when a message is ready
   * @ignore
   * @param message
   */
  onMessageReady(message) {
    if (this.delivery) {
      delete this.delivery;
      this.deliver(message);
    } else if (this.getMessage) {
      delete this.getMessage;
      this.resolvePromise(message);
    } else {
      delete this.returned;
      this.onReturn(message);
    }
  }
  /**
   * Deliver a message to a consumer
   * @ignore
   */
  deliver(message) {
    queueMicrotask(() => {
      const consumer = this.consumers.get(message.consumerTag);
      if (consumer) {
        consumer.onMessage(message);
      } else {
        console.warn("Consumer", message.consumerTag, "not available on channel", this.id);
      }
    });
  }
};

// src/amqp-message.ts
var AMQPMessage4 = class {
  channel;
  exchange = "";
  routingKey = "";
  properties = {};
  bodySize = 0;
  body = null;
  bodyPos = 0;
  deliveryTag = 0;
  consumerTag = "";
  redelivered = false;
  messageCount;
  replyCode;
  replyText;
  /**
   * @param channel - Channel this message was delivered on
   */
  constructor(channel) {
    this.channel = channel;
  }
  /**
   * Converts the message (which is deliviered as an uint8array) to a string
   */
  bodyToString() {
    if (this.body) {
      if (typeof Buffer !== "undefined")
        return Buffer.from(this.body).toString();
      else
        return new TextDecoder().decode(this.body);
    } else {
      return null;
    }
  }
  bodyString() {
    return this.bodyToString();
  }
  /** Acknowledge the message */
  ack(multiple = false) {
    return this.channel.basicAck(this.deliveryTag, multiple);
  }
  /** Negative acknowledgment (same as reject) */
  nack(requeue = false, multiple = false) {
    return this.channel.basicNack(this.deliveryTag, requeue, multiple);
  }
  /** Rejected the message */
  reject(requeue = false) {
    return this.channel.basicReject(this.deliveryTag, requeue);
  }
  /** Cancel the consumer the message arrived to **/
  cancelConsumer() {
    return this.channel.basicCancel(this.consumerTag);
  }
};

// src/amqp-base-client.ts
var VERSION = "2.1.1";
var AMQPBaseClient3 = class {
  vhost;
  username;
  password;
  name;
  platform;
  channels;
  connectPromise;
  closePromise;
  closed = true;
  blocked;
  channelMax = 0;
  frameMax;
  heartbeat;
  onerror;
  /** Used for string -> arraybuffer when publishing */
  textEncoder = new TextEncoder();
  // Buffer pool for publishes, let multiple microtasks publish at the same time but save on allocations
  bufferPool = [];
  /**
   * @param name - name of the connection, set in client properties
   * @param platform - used in client properties
   */
  constructor(vhost, username, password, name, platform, frameMax = 4096, heartbeat = 0) {
    this.vhost = vhost;
    this.username = username;
    this.password = "";
    Object.defineProperty(this, "password", {
      value: password,
      enumerable: false
      // hide it from console.log etc.
    });
    if (name)
      this.name = name;
    if (platform)
      this.platform = platform;
    this.channels = [new AMQPChannel3(this, 0)];
    this.onerror = (error) => console.error("amqp-client connection closed", error.message);
    if (frameMax < 4096)
      throw new Error("frameMax must be 4096 or larger");
    this.frameMax = frameMax;
    if (heartbeat < 0)
      throw new Error("heartbeat must be positive");
    this.heartbeat = heartbeat;
  }
  /**
   * Open a channel
   * @param [id] - An existing or non existing specific channel
   */
  channel(id) {
    if (this.closed)
      return this.rejectClosed();
    if (id && id > 0) {
      const channel2 = this.channels[id];
      if (channel2)
        return Promise.resolve(channel2);
    }
    if (!id)
      id = this.channels.findIndex((ch) => ch === void 0);
    if (id === -1)
      id = this.channels.length;
    if (id > this.channelMax)
      return Promise.reject(new AMQPError("Max number of channels reached", this));
    const channel = new AMQPChannel3(this, id);
    this.channels[id] = channel;
    let j = 0;
    const channelOpen = new AMQPView(new ArrayBuffer(13));
    channelOpen.setUint8(j, 1);
    j += 1;
    channelOpen.setUint16(j, id);
    j += 2;
    channelOpen.setUint32(j, 5);
    j += 4;
    channelOpen.setUint16(j, 20);
    j += 2;
    channelOpen.setUint16(j, 10);
    j += 2;
    channelOpen.setUint8(j, 0);
    j += 1;
    channelOpen.setUint8(j, 206);
    j += 1;
    return new Promise((resolve, reject) => {
      this.send(new Uint8Array(channelOpen.buffer, 0, 13)).then(() => channel.promises.push([resolve, reject])).catch(reject);
    });
  }
  /**
   * Gracefully close the AMQP connection
   * @param [reason] might be logged by the server
   */
  close(reason = "", code = 200) {
    if (this.closed)
      return this.rejectClosed();
    this.closed = true;
    let j = 0;
    const frame = new AMQPView(new ArrayBuffer(512));
    frame.setUint8(j, 1);
    j += 1;
    frame.setUint16(j, 0);
    j += 2;
    frame.setUint32(j, 0);
    j += 4;
    frame.setUint16(j, 10);
    j += 2;
    frame.setUint16(j, 50);
    j += 2;
    frame.setUint16(j, code);
    j += 2;
    j += frame.setShortString(j, reason);
    frame.setUint16(j, 0);
    j += 2;
    frame.setUint16(j, 0);
    j += 2;
    frame.setUint8(j, 206);
    j += 1;
    frame.setUint32(3, j - 8);
    return new Promise((resolve, reject) => {
      this.send(new Uint8Array(frame.buffer, 0, j)).then(() => this.closePromise = [resolve, reject]).catch(reject);
    });
  }
  rejectClosed() {
    return Promise.reject(new AMQPError("Connection closed", this));
  }
  rejectConnect(err) {
    if (this.connectPromise) {
      const [, reject] = this.connectPromise;
      delete this.connectPromise;
      reject(err);
    }
    this.closed = true;
    this.closeSocket();
  }
  /**
   * Parse and act on frames in an AMQPView
   * @ignore
   */
  parseFrames(view) {
    for (let i = 0; i < view.byteLength; ) {
      let j = 0;
      const type = view.getUint8(i);
      i += 1;
      const channelId = view.getUint16(i);
      i += 2;
      const frameSize = view.getUint32(i);
      i += 4;
      try {
        const frameEnd = view.getUint8(i + frameSize);
        if (frameEnd !== 206)
          throw new AMQPError(`Invalid frame end ${frameEnd}, expected 206`, this);
      } catch (e) {
        throw new AMQPError(`Frame end out of range, frameSize=${frameSize}, pos=${i}, byteLength=${view.byteLength}`, this);
      }
      const channel = this.channels[channelId];
      if (!channel) {
        console.warn("AMQP channel", channelId, "not open");
        i += frameSize + 1;
        continue;
      }
      switch (type) {
        case 1: {
          const classId = view.getUint16(i);
          i += 2;
          const methodId = view.getUint16(i);
          i += 2;
          switch (classId) {
            case 10: {
              switch (methodId) {
                case 10: {
                  i += frameSize - 4;
                  const startOk = new AMQPView(new ArrayBuffer(4096));
                  startOk.setUint8(j, 1);
                  j += 1;
                  startOk.setUint16(j, 0);
                  j += 2;
                  startOk.setUint32(j, 0);
                  j += 4;
                  startOk.setUint16(j, 10);
                  j += 2;
                  startOk.setUint16(j, 11);
                  j += 2;
                  const clientProps = {
                    connection_name: this.name || void 0,
                    product: "amqp-client.js",
                    information: "https://github.com/cloudamqp/amqp-client.js",
                    version: VERSION,
                    platform: this.platform,
                    capabilities: {
                      "authentication_failure_close": true,
                      "basic.nack": true,
                      "connection.blocked": true,
                      "consumer_cancel_notify": true,
                      "exchange_exchange_bindings": true,
                      "per_consumer_qos": true,
                      "publisher_confirms": true
                    }
                  };
                  j += startOk.setTable(j, clientProps);
                  j += startOk.setShortString(j, "PLAIN");
                  const response = `\0${this.username}\0${this.password}`;
                  j += startOk.setLongString(j, response);
                  j += startOk.setShortString(j, "");
                  startOk.setUint8(j, 206);
                  j += 1;
                  startOk.setUint32(3, j - 8);
                  this.send(new Uint8Array(startOk.buffer, 0, j)).catch(this.rejectConnect);
                  break;
                }
                case 30: {
                  const channelMax = view.getUint16(i);
                  i += 2;
                  const frameMax = view.getUint32(i);
                  i += 4;
                  const heartbeat = view.getUint16(i);
                  i += 2;
                  this.channelMax = channelMax;
                  this.frameMax = this.frameMax === 0 ? frameMax : Math.min(this.frameMax, frameMax);
                  this.heartbeat = this.heartbeat === 0 ? 0 : Math.min(this.heartbeat, heartbeat);
                  const tuneOk = new AMQPView(new ArrayBuffer(20));
                  tuneOk.setUint8(j, 1);
                  j += 1;
                  tuneOk.setUint16(j, 0);
                  j += 2;
                  tuneOk.setUint32(j, 12);
                  j += 4;
                  tuneOk.setUint16(j, 10);
                  j += 2;
                  tuneOk.setUint16(j, 31);
                  j += 2;
                  tuneOk.setUint16(j, this.channelMax);
                  j += 2;
                  tuneOk.setUint32(j, this.frameMax);
                  j += 4;
                  tuneOk.setUint16(j, this.heartbeat);
                  j += 2;
                  tuneOk.setUint8(j, 206);
                  j += 1;
                  this.send(new Uint8Array(tuneOk.buffer, 0, j)).catch(this.rejectConnect);
                  j = 0;
                  const open = new AMQPView(new ArrayBuffer(512));
                  open.setUint8(j, 1);
                  j += 1;
                  open.setUint16(j, 0);
                  j += 2;
                  open.setUint32(j, 0);
                  j += 4;
                  open.setUint16(j, 10);
                  j += 2;
                  open.setUint16(j, 40);
                  j += 2;
                  j += open.setShortString(j, this.vhost);
                  open.setUint8(j, 0);
                  j += 1;
                  open.setUint8(j, 0);
                  j += 1;
                  open.setUint8(j, 206);
                  j += 1;
                  open.setUint32(3, j - 8);
                  this.send(new Uint8Array(open.buffer, 0, j)).catch(this.rejectConnect);
                  break;
                }
                case 41: {
                  i += 1;
                  this.closed = false;
                  const promise = this.connectPromise;
                  if (promise) {
                    const [resolve] = promise;
                    delete this.connectPromise;
                    resolve(this);
                  }
                  break;
                }
                case 50: {
                  const code = view.getUint16(i);
                  i += 2;
                  const [text, strLen] = view.getShortString(i);
                  i += strLen;
                  const classId2 = view.getUint16(i);
                  i += 2;
                  const methodId2 = view.getUint16(i);
                  i += 2;
                  console.debug("connection closed by server", code, text, classId2, methodId2);
                  const msg = `connection closed: ${text} (${code})`;
                  const err = new AMQPError(msg, this);
                  this.channels.forEach((ch) => ch.setClosed(err));
                  this.channels = [new AMQPChannel3(this, 0)];
                  const closeOk = new AMQPView(new ArrayBuffer(12));
                  closeOk.setUint8(j, 1);
                  j += 1;
                  closeOk.setUint16(j, 0);
                  j += 2;
                  closeOk.setUint32(j, 4);
                  j += 4;
                  closeOk.setUint16(j, 10);
                  j += 2;
                  closeOk.setUint16(j, 51);
                  j += 2;
                  closeOk.setUint8(j, 206);
                  j += 1;
                  this.send(new Uint8Array(closeOk.buffer, 0, j)).catch((err2) => console.warn("Error while sending Connection#CloseOk", err2));
                  this.onerror(err);
                  this.rejectConnect(err);
                  break;
                }
                case 51: {
                  this.channels.forEach((ch) => ch.setClosed());
                  this.channels = [new AMQPChannel3(this, 0)];
                  const promise = this.closePromise;
                  if (promise) {
                    const [resolve] = promise;
                    delete this.closePromise;
                    resolve();
                    this.closeSocket();
                  }
                  break;
                }
                case 60: {
                  const [reason, len] = view.getShortString(i);
                  i += len;
                  console.warn("AMQP connection blocked:", reason);
                  this.blocked = reason;
                  break;
                }
                case 61: {
                  console.info("AMQP connection unblocked");
                  delete this.blocked;
                  break;
                }
                default:
                  i += frameSize - 4;
                  console.error("unsupported class/method id", classId, methodId);
              }
              break;
            }
            case 20: {
              switch (methodId) {
                case 11: {
                  i += 4;
                  channel.resolvePromise(channel);
                  break;
                }
                case 21: {
                  const active = view.getUint8(i) !== 0;
                  i += 1;
                  channel.resolvePromise(active);
                  break;
                }
                case 40: {
                  const code = view.getUint16(i);
                  i += 2;
                  const [text, strLen] = view.getShortString(i);
                  i += strLen;
                  const classId2 = view.getUint16(i);
                  i += 2;
                  const methodId2 = view.getUint16(i);
                  i += 2;
                  console.debug("channel", channelId, "closed", code, text, classId2, methodId2);
                  const msg = `channel ${channelId} closed: ${text} (${code})`;
                  const err = new AMQPError(msg, this);
                  channel.setClosed(err);
                  delete this.channels[channelId];
                  const closeOk = new AMQPView(new ArrayBuffer(12));
                  closeOk.setUint8(j, 1);
                  j += 1;
                  closeOk.setUint16(j, channelId);
                  j += 2;
                  closeOk.setUint32(j, 4);
                  j += 4;
                  closeOk.setUint16(j, 20);
                  j += 2;
                  closeOk.setUint16(j, 41);
                  j += 2;
                  closeOk.setUint8(j, 206);
                  j += 1;
                  this.send(new Uint8Array(closeOk.buffer, 0, j)).catch((err2) => console.error("Error while sending Channel#closeOk", err2));
                  break;
                }
                case 41: {
                  channel.setClosed();
                  delete this.channels[channelId];
                  channel.resolvePromise();
                  break;
                }
                default:
                  i += frameSize - 4;
                  console.error("unsupported class/method id", classId, methodId);
              }
              break;
            }
            case 40: {
              switch (methodId) {
                case 11:
                case 21:
                case 31:
                case 51: {
                  channel.resolvePromise();
                  break;
                }
                default:
                  i += frameSize - 4;
                  console.error("unsupported class/method id", classId, methodId);
              }
              break;
            }
            case 50: {
              switch (methodId) {
                case 11: {
                  const [name, strLen] = view.getShortString(i);
                  i += strLen;
                  const messageCount = view.getUint32(i);
                  i += 4;
                  const consumerCount = view.getUint32(i);
                  i += 4;
                  channel.resolvePromise({ name, messageCount, consumerCount });
                  break;
                }
                case 21: {
                  channel.resolvePromise();
                  break;
                }
                case 31: {
                  const messageCount = view.getUint32(i);
                  i += 4;
                  channel.resolvePromise({ messageCount });
                  break;
                }
                case 41: {
                  const messageCount = view.getUint32(i);
                  i += 4;
                  channel.resolvePromise({ messageCount });
                  break;
                }
                case 51: {
                  channel.resolvePromise();
                  break;
                }
                default:
                  i += frameSize - 4;
                  console.error("unsupported class/method id", classId, methodId);
              }
              break;
            }
            case 60: {
              switch (methodId) {
                case 11: {
                  channel.resolvePromise();
                  break;
                }
                case 21: {
                  const [consumerTag, len] = view.getShortString(i);
                  i += len;
                  channel.resolvePromise(consumerTag);
                  break;
                }
                case 30: {
                  const [consumerTag, len] = view.getShortString(i);
                  i += len;
                  const noWait = view.getUint8(i) === 1;
                  i += 1;
                  const consumer = channel.consumers.get(consumerTag);
                  if (consumer) {
                    consumer.setClosed(new AMQPError("Consumer cancelled by the server", this));
                    channel.consumers.delete(consumerTag);
                  }
                  if (!noWait) {
                    const frame = new AMQPView(new ArrayBuffer(512));
                    frame.setUint8(j, 1);
                    j += 1;
                    frame.setUint16(j, channel.id);
                    j += 2;
                    frame.setUint32(j, 0);
                    j += 4;
                    frame.setUint16(j, 60);
                    j += 2;
                    frame.setUint16(j, 31);
                    j += 2;
                    j += frame.setShortString(j, consumerTag);
                    frame.setUint8(j, 206);
                    j += 1;
                    frame.setUint32(3, j - 8);
                    this.send(new Uint8Array(frame.buffer, 0, j));
                  }
                  break;
                }
                case 31: {
                  const [consumerTag, len] = view.getShortString(i);
                  i += len;
                  channel.resolvePromise(consumerTag);
                  break;
                }
                case 50: {
                  const code = view.getUint16(i);
                  i += 2;
                  const [text, len] = view.getShortString(i);
                  i += len;
                  const [exchange, exchangeLen] = view.getShortString(i);
                  i += exchangeLen;
                  const [routingKey, routingKeyLen] = view.getShortString(i);
                  i += routingKeyLen;
                  const message = new AMQPMessage4(channel);
                  message.exchange = exchange;
                  message.routingKey = routingKey;
                  message.replyCode = code;
                  message.replyText = text;
                  channel.returned = message;
                  break;
                }
                case 60: {
                  const [consumerTag, consumerTagLen] = view.getShortString(i);
                  i += consumerTagLen;
                  const deliveryTag = view.getUint64(i);
                  i += 8;
                  const redelivered = view.getUint8(i) === 1;
                  i += 1;
                  const [exchange, exchangeLen] = view.getShortString(i);
                  i += exchangeLen;
                  const [routingKey, routingKeyLen] = view.getShortString(i);
                  i += routingKeyLen;
                  const message = new AMQPMessage4(channel);
                  message.consumerTag = consumerTag;
                  message.deliveryTag = deliveryTag;
                  message.exchange = exchange;
                  message.routingKey = routingKey;
                  message.redelivered = redelivered;
                  channel.delivery = message;
                  break;
                }
                case 71: {
                  const deliveryTag = view.getUint64(i);
                  i += 8;
                  const redelivered = view.getUint8(i) === 1;
                  i += 1;
                  const [exchange, exchangeLen] = view.getShortString(i);
                  i += exchangeLen;
                  const [routingKey, routingKeyLen] = view.getShortString(i);
                  i += routingKeyLen;
                  const messageCount = view.getUint32(i);
                  i += 4;
                  const message = new AMQPMessage4(channel);
                  message.deliveryTag = deliveryTag;
                  message.redelivered = redelivered;
                  message.exchange = exchange;
                  message.routingKey = routingKey;
                  message.messageCount = messageCount;
                  channel.getMessage = message;
                  break;
                }
                case 72: {
                  const [, len] = view.getShortString(i);
                  i += len;
                  channel.resolvePromise(null);
                  break;
                }
                case 80: {
                  const deliveryTag = view.getUint64(i);
                  i += 8;
                  const multiple = view.getUint8(i) === 1;
                  i += 1;
                  channel.publishConfirmed(deliveryTag, multiple, false);
                  break;
                }
                case 111: {
                  channel.resolvePromise();
                  break;
                }
                case 120: {
                  const deliveryTag = view.getUint64(i);
                  i += 8;
                  const multiple = view.getUint8(i) === 1;
                  i += 1;
                  channel.publishConfirmed(deliveryTag, multiple, true);
                  break;
                }
                default:
                  i += frameSize - 4;
                  console.error("unsupported class/method id", classId, methodId);
              }
              break;
            }
            case 85: {
              switch (methodId) {
                case 11: {
                  channel.confirmId = 1;
                  channel.resolvePromise();
                  break;
                }
                default:
                  i += frameSize - 4;
                  console.error("unsupported class/method id", classId, methodId);
              }
              break;
            }
            case 90: {
              switch (methodId) {
                case 11:
                case 21:
                case 31: {
                  channel.resolvePromise();
                  break;
                }
                default:
                  i += frameSize - 4;
                  console.error("unsupported class/method id", classId, methodId);
              }
              break;
            }
            default:
              i += frameSize - 2;
              console.error("unsupported class id", classId);
          }
          break;
        }
        case 2: {
          i += 4;
          const bodySize = view.getUint64(i);
          i += 8;
          const [properties, propLen] = view.getProperties(i);
          i += propLen;
          const message = channel.delivery || channel.getMessage || channel.returned;
          if (message) {
            message.bodySize = bodySize;
            message.properties = properties;
            message.body = new Uint8Array(bodySize);
            if (bodySize === 0)
              channel.onMessageReady(message);
          } else {
            console.warn("Header frame but no message");
          }
          break;
        }
        case 3: {
          const message = channel.delivery || channel.getMessage || channel.returned;
          if (message && message.body) {
            const bodyPart = new Uint8Array(view.buffer, view.byteOffset + i, frameSize);
            message.body.set(bodyPart, message.bodyPos);
            message.bodyPos += frameSize;
            i += frameSize;
            if (message.bodyPos === message.bodySize)
              channel.onMessageReady(message);
          } else {
            console.warn("Body frame but no message");
          }
          break;
        }
        case 8: {
          const heartbeat = new Uint8Array([8, 0, 0, 0, 0, 0, 0, 206]);
          this.send(heartbeat).catch((err) => console.warn("Error while sending heartbeat", err));
          break;
        }
        default:
          console.error("invalid frame type:", type);
          i += frameSize;
      }
      i += 1;
    }
  }
};

// src/amqp-socket-client.ts
import { Buffer as Buffer2 } from "buffer";
import * as net from "net";
import * as tls from "tls";
var AMQPClient = class extends AMQPBaseClient3 {
  socket;
  tls;
  host;
  port;
  tlsOptions;
  insecure;
  framePos;
  frameSize;
  frameBuffer;
  /**
   * @param url - uri to the server, example: amqp://user:passwd@localhost:5672/vhost
   */
  constructor(url, tlsOptions) {
    const u = new URL(url);
    const vhost = decodeURIComponent(u.pathname.slice(1)) || "/";
    const username = decodeURIComponent(u.username) || "guest";
    const password = decodeURIComponent(u.password) || "guest";
    const name = u.searchParams.get("name") || "";
    const frameMax = parseInt(u.searchParams.get("frameMax") || "4096");
    const heartbeat = parseInt(u.searchParams.get("heartbeat") || "0");
    const platform = `${process.release.name} ${process.version} ${process.platform} ${process.arch}`;
    super(vhost, username, password, name, platform, frameMax, heartbeat);
    this.tls = u.protocol === "amqps:";
    this.tlsOptions = tlsOptions;
    this.host = u.hostname || "localhost";
    this.port = parseInt(u.port) || (this.tls ? 5671 : 5672);
    this.insecure = u.searchParams.get("insecure") !== null;
    this.framePos = 0;
    this.frameSize = 0;
    this.frameBuffer = Buffer2.allocUnsafe(frameMax);
    Object.defineProperty(this, "frameBuffer", {
      enumerable: false
      // hide it from console.log etc.
    });
  }
  connect() {
    const socket = this.connectSocket();
    Object.defineProperty(this, "socket", {
      value: socket,
      writable: true,
      enumerable: false
      // hide it from console.log etc.
    });
    return new Promise((resolve, reject) => {
      socket.on("error", (err) => reject(new AMQPError(err.message, this)));
      this.connectPromise = [resolve, reject];
    });
  }
  connectSocket() {
    const options = {
      host: this.host,
      port: this.port,
      servername: net.isIP(this.host) ? "" : this.host,
      rejectUnauthorized: !this.insecure,
      ...this.tlsOptions
    };
    const sendStart = () => this.send(new Uint8Array([65, 77, 81, 80, 0, 0, 9, 1]));
    const conn = this.tls ? tls.connect(options, sendStart) : net.connect(options, sendStart);
    conn.on("data", this.onRead.bind(this));
    conn.on("connect", () => {
      conn.on("error", (err) => this.onerror(new AMQPError(err.message, this)));
      conn.on("close", (hadError) => {
        if (!hadError && !this.closed)
          this.onerror(new AMQPError("Socket closed", this));
      });
    });
    return conn;
  }
  onRead(buf) {
    const bufLen = buf.length;
    let bufPos = 0;
    while (bufPos < bufLen) {
      if (this.frameSize === 0) {
        if (this.framePos !== 0) {
          const copied2 = buf.copy(this.frameBuffer, this.framePos, bufPos, bufPos + 7 - this.framePos);
          if (copied2 === 0)
            throw `Copied 0 bytes framePos=${this.framePos} bufPos=${bufPos} bytesWritten=${bufLen}`;
          this.frameSize = this.frameBuffer.readInt32BE(bufPos + 3) + 8;
          this.framePos += copied2;
          bufPos += copied2;
          continue;
        }
        if (bufPos + 3 + 4 > bufLen) {
          const copied2 = buf.copy(this.frameBuffer, this.framePos, bufPos, bufLen);
          if (copied2 === 0)
            throw `Copied 0 bytes framePos=${this.framePos} bufPos=${bufPos} bytesWritten=${bufLen}`;
          this.framePos += copied2;
          break;
        }
        this.frameSize = buf.readInt32BE(bufPos + 3) + 8;
        if (bufLen - bufPos >= this.frameSize) {
          const view = new AMQPView(buf.buffer, buf.byteOffset + bufPos, this.frameSize);
          this.parseFrames(view);
          bufPos += this.frameSize;
          this.frameSize = 0;
          continue;
        }
      }
      const leftOfFrame = this.frameSize - this.framePos;
      const copyBytes = Math.min(leftOfFrame, bufLen - bufPos);
      const copied = buf.copy(this.frameBuffer, this.framePos, bufPos, bufPos + copyBytes);
      if (copied === 0)
        throw `Copied 0 bytes, please report this bug, frameSize=${this.frameSize} framePos=${this.framePos} bufPos=${bufPos} copyBytes=${copyBytes} bytesWritten=${bufLen}`;
      this.framePos += copied;
      bufPos += copied;
      if (this.framePos === this.frameSize) {
        const view = new AMQPView(this.frameBuffer.buffer, 0, this.frameSize);
        this.parseFrames(view);
        this.frameSize = this.framePos = 0;
      }
    }
    return true;
  }
  /**
   * @ignore
   * @param bytes to send
   * @return fulfilled when the data is enqueued
   */
  send(bytes) {
    return new Promise((resolve, reject) => {
      if (!this.socket)
        return reject(new AMQPError("Socket not connected", this));
      try {
        this.socket.write(bytes, void 0, (err) => err ? reject(err) : resolve());
      } catch (err) {
        this.closeSocket();
        reject(err);
      }
    });
  }
  closeSocket() {
    this.closed = true;
    if (this.socket)
      this.socket.end();
    this.socket = void 0;
  }
};

// src/amqp-websocket-client.ts
var AMQPWebSocketClient = class extends AMQPBaseClient3 {
  url;
  socket;
  framePos = 0;
  frameSize = 0;
  frameBuffer;
  /**
   * @param url to the websocket endpoint, example: wss://server/ws/amqp
   */
  constructor(url, vhost = "/", username = "guest", password = "guest", name, frameMax = 4096, heartbeat = 0) {
    super(vhost, username, password, name, AMQPWebSocketClient.platform(), frameMax, heartbeat);
    this.url = url;
    this.frameBuffer = new Uint8Array(frameMax);
  }
  /**
   * Establish a AMQP connection over WebSocket
   */
  connect() {
    const socket = new WebSocket(this.url);
    this.socket = socket;
    socket.binaryType = "arraybuffer";
    socket.onmessage = this.handleMessage.bind(this);
    return new Promise((resolve, reject) => {
      this.connectPromise = [resolve, reject];
      socket.onclose = reject;
      socket.onerror = reject;
      socket.onopen = () => {
        socket.onerror = (ev) => this.onerror(new AMQPError(ev.toString(), this));
        socket.send(new Uint8Array([65, 77, 81, 80, 0, 0, 9, 1]));
      };
    });
  }
  /**
   * @param bytes to send
   * @return fulfilled when the data is enqueued
   */
  send(bytes) {
    return new Promise((resolve, reject) => {
      if (this.socket) {
        try {
          this.socket.send(bytes);
          resolve();
        } catch (err) {
          this.closeSocket();
          reject(err);
        }
      } else {
        reject("Socket not connected");
      }
    });
  }
  closeSocket() {
    this.closed = true;
    if (this.socket)
      this.socket.close();
    this.socket = void 0;
  }
  handleMessage(event) {
    const buf = event.data;
    const bufView = new DataView(buf);
    let bufPos = 0;
    while (bufPos < buf.byteLength) {
      if (this.frameSize === 0) {
        if (this.framePos !== 0) {
          const len = buf.byteLength - bufPos;
          this.frameBuffer.set(new Uint8Array(buf, bufPos), this.framePos);
          this.frameSize = new DataView(this.frameBuffer.buffer).getInt32(bufPos + 3) + 8;
          this.framePos += len;
          bufPos += len;
          continue;
        }
        if (bufPos + 3 + 4 > buf.byteLength) {
          const len = buf.byteLength - bufPos;
          this.frameBuffer.set(new Uint8Array(buf, bufPos), this.framePos);
          this.framePos += len;
          break;
        }
        this.frameSize = bufView.getInt32(bufPos + 3) + 8;
        if (buf.byteLength - bufPos >= this.frameSize) {
          const view = new AMQPView(buf, bufPos, this.frameSize);
          this.parseFrames(view);
          bufPos += this.frameSize;
          this.frameSize = 0;
          continue;
        }
      }
      const leftOfFrame = this.frameSize - this.framePos;
      const copyBytes = Math.min(leftOfFrame, buf.byteLength - bufPos);
      this.frameBuffer.set(new Uint8Array(buf, bufPos, copyBytes), this.framePos);
      this.framePos += copyBytes;
      bufPos += copyBytes;
      if (this.framePos === this.frameSize) {
        const view = new AMQPView(this.frameBuffer.buffer, 0, this.frameSize);
        this.parseFrames(view);
        this.frameSize = this.framePos = 0;
      }
    }
  }
  static platform() {
    if (typeof window !== "undefined")
      return window.navigator.userAgent;
    else
      return `${process.release.name} ${process.version} ${process.platform} ${process.arch}`;
  }
};
export {
  AMQPChannel3 as AMQPChannel,
  AMQPClient,
  AMQPConsumer2 as AMQPConsumer,
  AMQPError,
  AMQPMessage4 as AMQPMessage,
  AMQPQueue,
  AMQPWebSocketClient
};
