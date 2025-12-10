import express from 'express'
import morgan from 'morgan'
import helmet from 'helmet'
import hpp from 'hpp'
import cors from 'cors'
import routes from './routes/index.js'
import { notFoundHandler, globalErrorHandler } from './core/errorHandler.js'


const app = express()

app.use(morgan('dev'))
app.use(helmet())
app.use(hpp())
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

app.use(cors({ origin: '*', credentials: true }))

app.use('/api', routes)

app.use(notFoundHandler)
app.use(globalErrorHandler)

export { app }
