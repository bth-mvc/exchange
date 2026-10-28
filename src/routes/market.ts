import { Router } from 'express'
import { addSseClient, removeSseClient } from '../market/simulator.js'
import { recentNews } from '../market/news.js'
import { getToken } from '../market/tokens.js'

export const marketRouter = Router()

marketRouter.get('/feed', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  })
  res.write(
    `event: connected\ndata: ${JSON.stringify({ message: 'Connected to market feed' })}\n\n`,
  )
  addSseClient(res)
  req.on('close', () => removeSseClient(res))
})

const impacts = ['low', 'medium', 'high', 'rumor', 'big']

/** Stored news, newest first. `token` limits it to one token, `impact` to a comma-separated
 *  list of impacts (e.g. `big` for the 30-day chart). */
marketRouter.get('/news', (req, res) => {
  const limit = Math.min(Math.max(parseInt((req.query.limit as string) ?? '50') || 50, 1), 500)
  const tokenId = req.query.token as string | undefined
  const token = tokenId ? getToken(tokenId) : undefined
  if (tokenId && !token) {
    res.status(404).json({ error: 'Token not found' })
    return
  }
  const wanted = ((req.query.impact as string | undefined) ?? '').split(',').filter(Boolean)
  const unknown = wanted.find((i) => !impacts.includes(i))
  if (unknown) {
    res.status(400).json({ error: `Unknown impact ${unknown}, use ${impacts.join(', ')}` })
    return
  }
  res.json(recentNews({ limit, token: token?.id, impacts: wanted }))
})
