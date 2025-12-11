import express from 'express'
import morgan from 'morgan'
import helmet from 'helmet'
import hpp from 'hpp'
import cors from 'cors'
import { v4 as uuid } from 'uuid'
import routes from './routes/index.js'
import { notFoundHandler, globalErrorHandler } from './core/errorHandler.js'
import { env } from './config/env.js'

const app = express()

const allowedOrigins = [
    'http://localhost:3000',
    'http://localhost:5173',
    'http://api.ominigateway.com.br',
    'https://api.ominigateway.com.br',
    'https://ominigateway.com.br',
    'https://admin.ominigateway.com.br',
    'https://payg2a.online',
    'https://mutual-fintech-front-end-paas.vercel.app',
    'https://omnigateway.site'
]

app.use((req, res, next) => {
    const origin = req.headers.origin
    let isAllowed = false

    if (!origin) {
        isAllowed = true
    } else {
        const normalizedOrigin = origin.replace(/\/$/, '')
        isAllowed = allowedOrigins.some(allowed => {
            const normalizedAllowed = allowed.replace(/\/$/, '')
            return normalizedOrigin === normalizedAllowed || origin === allowed
        })
    }

    if (isAllowed) {
        if (origin) {
            // res.setHeader('Access-Control-Allow-Origin', origin)
            res.setHeader('Access-Control-Allow-Origin', '*') // Permissive for now to avoid issues
            res.setHeader('Access-Control-Allow-Credentials', 'true')
        } else {
            res.setHeader('Access-Control-Allow-Origin', '*')
        }

        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD')
        res.setHeader(
            'Access-Control-Allow-Headers',
            'Content-Type, Authorization, app_id, app_secret, client_id, client_secret, x-api-key, x-user-id, x-app-id, Accept, Origin, X-Requested-With'
        )
        res.setHeader('Access-Control-Expose-Headers', 'Content-Type, Authorization')
        res.setHeader('Access-Control-Max-Age', '86400')

        if (req.method === 'OPTIONS') {
            return res.status(204).end()
        }
    }

    next()
})

app.use(cors({
    origin: true, // Allow all origins for simplicity in microservices for now
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
}))

if (env.NODE_ENV !== 'production') {
    app.use(morgan('dev'))
} else {
    app.use(morgan('combined'))
}

app.use(helmet())
app.use(hpp())
app.use(express.json({ limit: '2mb', type: ['application/json', 'application/*+json'] }))
app.use(express.urlencoded({ extended: true, limit: '2mb' }))

app.use((req, res, next) => {
    req.id = req.headers['x-request-id'] || uuid()
    res.setHeader('X-Request-Id', req.id)
    next()
})

app.use(routes)

app.use(notFoundHandler)
app.use(globalErrorHandler)

export { app }
export default app
