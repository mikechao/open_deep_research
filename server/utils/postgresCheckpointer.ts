import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres'
import consola from 'consola'
import pg from 'pg'

export async function postgresCheckpointer() {
  try {
    const pool = getPool()
    const checkpointer = new PostgresSaver(pool)
    await checkpointer.setup()
    return checkpointer
  }
  catch (error: any) {
    consola.error('Error setting up PostgresSaver:', error)
    if (error.message && error.message.includes('ECONNREFUSED')) {
      consola.error(
        'Please make sure your Postgres server is running and that the URL is correct.',
      )
      throw createError({
        statusCode: 503,
        message: 'Unable to connect to Postgres. Please try again later.',
      })
    }
    throw createError({
      statusCode: 500,
      message: 'Error setting up PostgresSaver.',
    })
  }
}

function getPool() {
  const { Pool } = pg
  const runtimeConfig = useRuntimeConfig()
  const pool = new Pool({
    host: runtimeConfig.dbHost,
    user: runtimeConfig.dbUser,
    password: runtimeConfig.dbPassword,
    database: runtimeConfig.dbName,
    port: Number(runtimeConfig.dbPort),
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  })
  return pool
}
