// A minimal, dependency-free WebSocket server side (RFC 6455) for the presence service: the upgrade handshake,
// masked client text frames (no fragmentation), ping/pong, close. Anything else closes the connection. Frames larger
// than `maxPayload` close it with 1009 before the payload is buffered.
import { createHash } from 'node:crypto';

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
export const acceptKey = (key) => createHash('sha1').update(key + GUID).digest('base64');

/** Encodes one unmasked server frame. */
export function frame(opcode, payload = Buffer.alloc(0)) {
  const len = payload.length;
  const head = len < 126 ? Buffer.from([0x80 | opcode, len]) : len < 65536 ? Buffer.from([0x80 | opcode, 126, len >> 8, len & 255]) : null;
  if (!head) throw new Error('frame too large');
  return Buffer.concat([head, payload]);
}

/**
 * Wraps an upgraded socket. Calls onText(string), onClose(code). Returns {send(text), close(code), ping(), buffered()}.
 * @param {import('node:net').Socket} socket
 */
export function wrapSocket(socket, { maxPayload = 1024, onText = () => {}, onClose = () => {}, onPong = () => {} } = {}) {
  let buf = Buffer.alloc(0), closed = false;
  const write = (b) => { if (!closed && socket.writable) socket.write(b); };
  function close(code = 1000) {
    if (closed) return;
    const p = Buffer.alloc(2); p.writeUInt16BE(code);
    write(frame(0x8, p)); closed = true; socket.end(); setTimeout(() => socket.destroy(), 1000).unref();
    onClose(code);
  }
  socket.on('data', (chunk) => {
    if (closed) return;
    buf = buf.length ? Buffer.concat([buf, chunk]) : chunk;
    while (buf.length >= 2) {
      const b0 = buf[0], b1 = buf[1];
      const fin = b0 & 0x80, opcode = b0 & 0x0f, masked = b1 & 0x80;
      let len = b1 & 0x7f, off = 2;
      if (!masked || (b0 & 0x70)) return close(1002); // clients must mask; no extensions
      if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; } else if (len === 127) return close(1009);
      if (len > maxPayload) return close(1009);
      if (buf.length < off + 4 + len) { if (buf.length > maxPayload + 16) return close(1009); return; }
      const mask = buf.subarray(off, off + 4), data = Buffer.from(buf.subarray(off + 4, off + 4 + len));
      for (let i = 0; i < data.length; i++) data[i] ^= mask[i & 3];
      buf = buf.subarray(off + 4 + len);
      if (!fin || opcode === 0x0) return close(1003); // no fragmentation
      if (opcode === 0x1) onText(data.toString('utf8'));
      else if (opcode === 0x8) return close(1000);
      else if (opcode === 0x9) write(frame(0xA, data));
      else if (opcode === 0xA) onPong();
      else return close(1003); // binary or unknown
    }
  });
  socket.on('close', () => { if (!closed) { closed = true; onClose(1006); } });
  socket.on('error', () => { if (!closed) { closed = true; socket.destroy(); onClose(1006); } });
  return {
    send(text) { write(frame(0x1, Buffer.from(text))); },
    close,
    ping() { write(frame(0x9)); },
    buffered() { return socket.writableLength; },
    get closed() { return closed; },
  };
}

/** Completes the HTTP upgrade or answers 400. Returns true when upgraded. */
export function handshake(req, socket) {
  const key = req.headers['sec-websocket-key'];
  if (!key || String(req.headers.upgrade).toLowerCase() !== 'websocket' || req.headers['sec-websocket-version'] !== '13') {
    socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n'); return false;
  }
  socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${acceptKey(key)}\r\n\r\n`);
  socket.setNoDelay(true);
  return true;
}
