import express from 'express'
import morgan from 'morgan'
import helmet from 'helmet'
import hpp from 'hpp'
import cors from 'cors'
import compression from 'compression'
import http from 'http'
import https from 'https'
import axios from 'axios'
import { v4 as uuid } from 'uuid'
import routes from './routes/index.js'
import { notFoundHandler, globalErrorHandler } from './core/errorHandler.js'
import { env } from './config/env.js'
import { swaggerSpec, getSwaggerHtml } from './swagger/swagger.js'

const app = express()

// Keep-alive agents for microservices communication
const httpAgent = new http.Agent({ keepAlive: true })
const httpsAgent = new https.Agent({ keepAlive: true })

// Centralized Axios instances
export const httpClient = axios.create({
  httpAgent,
  httpsAgent,
  timeout: 30000
})

export const authService = axios.create({
  baseURL: env.AUTH_SERVICE_URL,
  httpAgent,
  httpsAgent,
  timeout: 10000
})

export const userService = axios.create({
  baseURL: env.USER_SERVICE_URL,
  httpAgent,
  httpsAgent,
  timeout: 10000
})

export const webhookService = axios.create({
  baseURL: env.WEBHOOK_SERVICE_URL,
  httpAgent,
  httpsAgent,
  timeout: 10000
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

// Standard CORS
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

// Request Tracking
app.use((req, res, next) => {
  req.id = req.headers['x-request-id'] || uuid()
  res.setHeader('X-Request-Id', req.id)
  next()
})

// Swagger UI
app.get('/docs', (req, res) => {
  res.send(getSwaggerHtml(swaggerSpec))
})

app.get('/docs-json', (req, res) => {
  res.json(swaggerSpec)
})

// Routes
app.use(routes)

// Errors
app.use(notFoundHandler)
app.use(globalErrorHandler)

export { app }
export default app
