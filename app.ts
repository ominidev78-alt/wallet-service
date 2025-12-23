import express, { Request, Response, NextFunction } from 'express'
import morgan from 'morgan'
import helmet from 'helmet'
import hpp from 'hpp'
import cors from 'cors'
import compression from 'compression'
import got from 'got'
import { v4 as uuid } from 'uuid'
import routes from './routes/index.js'
import { notFoundHandler, globalErrorHandler } from './core/errorHandler.js'
import { env } from './config/env.js'
import { swaggerSpec, getSwaggerHtml } from './swagger/swagger.js'

const app = express()

export const httpClient = got.extend({
  timeout: { request: 10000 },
  retry: { limit: 2 },
  responseType: 'json'
})

export const authService = got.extend({
  prefixUrl: (env as any).AUTH_SERVICE_URL || 'https://auth.pagandu.com',
  timeout: { request: 10000 },
  retry: { limit: 2 },
  responseType: 'json'
})

export const userService = got.extend({
  prefixUrl: env.USER_SERVICE_URL,
  timeout: { request: 10000 },
  retry: { limit: 2 },
  responseType: 'json'
})

export const webhookService = got.extend({
  prefixUrl: env.WEBHOOK_SERVICE_URL,
  timeout: { request: 10000 },
  retry: { limit: 2 },
  responseType: 'json'
})

const allowedOrigins = [
  'https://pagandu.com',
  'https://www.pagandu.com',
  'https://api.pagandu.com',
  'https://admin.pagandu.com',
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:5173'
]

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true)
      } else {
        callback(new Error('Not allowed by CORS'))
      }
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'app_id',
      'app_secret',
      'client_id',
      'client_secret',
      'x-api-key',
      'x-user-id',
      'x-app-id',
      'Accept',
      'Origin',
      'X-Requested-With'
    ],
    exposedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
    optionsSuccessStatus: 204
  })
)

if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'))
} else {
  app.use(morgan('combined'))
}

app.use(helmet())
app.use(hpp())
app.use(express.json({ limit: '5mb' }))
app.use(express.urlencoded({ extended: true, limit: '5mb' }))
app.use(compression())

app.use((req: Request, res: Response, next: NextFunction) => {
  req.id = (req.headers['x-request-id'] as string) || uuid()
  res.setHeader('X-Request-Id', req.id)
  next()
})

app.get('/docs', (req: Request, res: Response) => {
  res.send(getSwaggerHtml(swaggerSpec))
})

app.get('/docs-json', (req: Request, res: Response) => {
  res.json(swaggerSpec)
})

app.use(routes)
app.use(notFoundHandler)
app.use(globalErrorHandler)

export { app }
export default app