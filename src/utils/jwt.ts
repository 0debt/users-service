import { SignJWT, jwtVerify, type JWTPayload } from 'jose'

const secretKey = Bun.env.JWT_SECRET
if (!secretKey) {
  throw new Error('JWT_SECRET no está definida en .env')
}

const secret = new TextEncoder().encode(secretKey)

export async function signJwt(
  payload: JWTPayload,
  expiresIn: string = '1h'
): Promise<string> {
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(secret)
}

export async function verifyJwt<T = JWTPayload>(token: string): Promise<T> {
  const { payload } = await jwtVerify(token, secret)
  return payload as T
}
