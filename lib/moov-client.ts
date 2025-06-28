import { loadMoov } from '@moovio/moov-js'

export const getMoov = async (token: string) => {
  const moov = await loadMoov(token)
  return moov
} 