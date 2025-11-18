
export type JwtUserPayload = {
  sub: string
  email: string
  plan?: string
}

export type AppEnv = {
  Variables: {
    user: JwtUserPayload
  }
}
