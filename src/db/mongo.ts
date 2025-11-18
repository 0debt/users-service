import { MongoClient, Db, Collection } from 'mongodb'

const uri = Bun.env.MONGODB_URI
if (!uri) {
  throw new Error('MONGODB_URI no está definida en .env')
}

const dbName = Bun.env.MONGODB_DB_NAME || 'users_service'

const client = new MongoClient(uri)
let db: Db

export async function connectToDatabase() {
  if (!db) {
    await client.connect()
    db = client.db(dbName)
    console.log('[MongoDB] Conectado a', dbName)
  }
  return db
}

export function getUsersCollection(): Collection {
  if (!db) {
    throw new Error('La BD aún no está inicializada. Llama a connectToDatabase() primero.')
  }
  return db.collection('users')
}
