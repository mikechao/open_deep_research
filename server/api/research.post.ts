import { Command } from '@langchain/langgraph'
import { consola } from 'consola'
import { z } from 'zod'
import { graphBuilder } from '../graph/graph'
import { postgresCheckpointer } from '../utils/postgresCheckpointer'

export default defineLazyEventHandler(async () => {
  const inputSchema = z.object({
    topic: z.string(),
    sessionId: z.string(),
    feedBack: z.string().optional().default(''),
  })
  return defineEventHandler(async (event) => {
    const body = await readBody(event)
    const parsedBody = inputSchema.safeParse(body)
    if (!parsedBody.success) {
      const formattedError = parsedBody.error.flatten()
      consola.error({ tag: 'eventHandler', message: `Invalid input: ${JSON.stringify(formattedError)}` })
      throw createError({
        statusCode: 400,
        statusMessage: 'Bad Request',
        message: JSON.stringify(formattedError) || 'Invalid input',
      })
    }
    const { topic, sessionId, feedBack } = parsedBody.data
    const checkpointer = await postgresCheckpointer()
    const graph = graphBuilder.compile({ checkpointer })
    const threadConfig = { configurable: { thread_id: sessionId } }
    const input = feedBack.length > 0 ? new Command({ resume: feedBack }) : { topic }
    const result = await graph.invoke(input, threadConfig)
    return result
  })
})
