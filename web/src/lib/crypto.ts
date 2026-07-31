/** AES-256-GCM helpers matching the Go server key derivation. */

function deriveKeyBytes(password: string): Uint8Array {
  const out = new Uint8Array(32)
  const encoded = new TextEncoder().encode(password)
  out.set(encoded.slice(0, 32))
  if (encoded.length < 32) {
    for (let i = encoded.length; i < 32; i++) out[i] = 0x20 // space, matches Go
  }
  return out
}

async function importKey(password: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    deriveKeyBytes(password).buffer as ArrayBuffer,
    'AES-GCM',
    false,
    ['encrypt', 'decrypt'],
  )
}

function toBase64(bytes: Uint8Array): string {
  let s = ''
  bytes.forEach((b) => {
    s += String.fromCharCode(b)
  })
  return btoa(s)
}

function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

export async function encryptBytes(plain: Uint8Array, password: string): Promise<string> {
  const key = await importKey(password)
  const nonce = crypto.getRandomValues(new Uint8Array(12))
  const plainBuf = new Uint8Array(plain)
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce },
    key,
    plainBuf,
  )
  const packed = new Uint8Array(nonce.length + cipher.byteLength)
  packed.set(nonce, 0)
  packed.set(new Uint8Array(cipher), nonce.length)
  return toBase64(packed)
}

export async function encryptText(text: string, password: string): Promise<string> {
  return encryptBytes(new TextEncoder().encode(text), password)
}

export async function decryptBytes(ciphertextB64: string, password: string): Promise<Uint8Array> {
  const key = await importKey(password)
  const raw = fromBase64(ciphertextB64)
  const nonce = raw.slice(0, 12)
  const data = raw.slice(12)
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, key, data)
  return new Uint8Array(plain)
}

export async function decryptText(ciphertextB64: string, password: string): Promise<string> {
  const bytes = await decryptBytes(ciphertextB64, password)
  return new TextDecoder().decode(bytes)
}
