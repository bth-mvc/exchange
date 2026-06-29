export interface Token {
  id: string
  name: string
  type: 'stable' | 'volatile' | 'yield'
  price: number
}

export const tokens: Token[] = [
  { id: 'FIKA', name: 'Fika Token', type: 'stable', price: 10.0 },
  { id: 'SUDO', name: 'Sudo Token', type: 'stable', price: 25.0 },
  { id: 'YOLO', name: 'Yolo Token', type: 'volatile', price: 4.2 },
  { id: 'DEPLOY', name: 'Deploy Token', type: 'volatile', price: 42.0 },
  { id: 'MEME', name: 'Meme Token', type: 'volatile', price: 0.69 },
  { id: 'HODL', name: 'Hodl Token', type: 'yield', price: 100.0 },
]

export function getToken(id: string): Token | undefined {
  return tokens.find((t) => t.id === id.toUpperCase())
}

export function currentPrice(tokenId: string): number {
  return getToken(tokenId)?.price ?? 0
}
