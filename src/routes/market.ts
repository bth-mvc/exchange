import { Router } from 'express'
import { addSseClient, removeSseClient } from '../market/simulator.js'

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
