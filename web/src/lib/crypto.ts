/** ECDH P-256 + AES-256-GCM helpers (matches Go internal/crypto). */

export type Identity = {
  publicKeyB64: string
  privateKey: CryptoKey
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

async function importPeerPublicKey(publicKeyB64: string): Promise<CryptoKey> {
  const raw = fromBase64(publicKeyB64)
  return crypto.subtle.importKey(
    'raw',
    raw.buffer as ArrayBuffer,
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    [],
  )
}

async function deriveAesKey(privateKey: CryptoKey, peerPublicKeyB64: string): Promise<CryptoKey> {
  const peer = await importPeerPublicKey(peerPublicKeyB64)
  const bits = await crypto.subtle.deriveBits({ name: 'ECDH', public: peer }, privateKey, 256)
  const digest = await crypto.subtle.digest('SHA-256', bits)
  return crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['encrypt', 'decrypt'])
}

/** Create a fresh ECDH P-256 identity for this session. */
export async function createIdentity(): Promise<Identity> {
  const pair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits'],
  )
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey))
  return {
    publicKeyB64: toBase64(raw),
    privateKey: pair.privateKey,
  }
}

export async function encryptFor(
  privateKey: CryptoKey,
  peerPublicKeyB64: string,
  plain: Uint8Array,
): Promise<string> {
  const key = await deriveAesKey(privateKey, peerPublicKeyB64)
  const nonce = crypto.getRandomValues(new Uint8Array(12))
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce },
    key,
    new Uint8Array(plain),
  )
  const packed = new Uint8Array(nonce.length + cipher.byteLength)
  packed.set(nonce, 0)
  packed.set(new Uint8Array(cipher), nonce.length)
  return toBase64(packed)
}

export async function decryptFrom(
  privateKey: CryptoKey,
  senderPublicKeyB64: string,
  ciphertextB64: string,
): Promise<Uint8Array> {
  const key = await deriveAesKey(privateKey, senderPublicKeyB64)
  const raw = fromBase64(ciphertextB64)
  const nonce = raw.slice(0, 12)
  const data = raw.slice(12)
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: nonce },
    key,
    data,
  )
  return new Uint8Array(plain)
}

export async function encryptTextFor(
  privateKey: CryptoKey,
  peerPublicKeyB64: string,
  text: string,
): Promise<string> {
  return encryptFor(privateKey, peerPublicKeyB64, new TextEncoder().encode(text))
}

export async function decryptTextFrom(
  privateKey: CryptoKey,
  senderPublicKeyB64: string,
  ciphertextB64: string,
): Promise<string> {
  const bytes = await decryptFrom(privateKey, senderPublicKeyB64, ciphertextB64)
  return new TextDecoder().decode(bytes)
}

/** Short fingerprint for display (not for security decisions). */
export function fingerprint(publicKeyB64: string): string {
  const raw = fromBase64(publicKeyB64)
  let hex = ''
  for (let i = 0; i < Math.min(4, raw.length); i++) {
    hex += raw[i].toString(16).padStart(2, '0')
  }
  return hex
}
