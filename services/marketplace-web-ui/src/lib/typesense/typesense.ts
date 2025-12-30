import Typesense from 'typesense'
import { MARKETPLACE_CONFIG } from '../utils'

export const typesenseClient = new Typesense.Client({
  nodes: [
    {
      host: MARKETPLACE_CONFIG.typesense.host,
      port: Number(MARKETPLACE_CONFIG.typesense.port),
      protocol: MARKETPLACE_CONFIG.typesense.protocol,
    },
  ],
  apiKey: MARKETPLACE_CONFIG.typesense.public_key,
  connectionTimeoutSeconds: MARKETPLACE_CONFIG.typesense.connectionTimeout,
})