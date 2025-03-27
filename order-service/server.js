const express = require('express')
const mongoose = require('mongoose')
const { Kafka } = require('kafkajs')
const { v4: uuidv4 } = require('uuid')
const Order = require('./models/order')

const app = express()
app.use(express.json())

// MongoDB Atlas Connection
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log('Connected to MongoDB Atlas - order-db'))
  .catch(err => console.error('MongoDB connection error:', err))

// Kafka Setup
const kafka = new Kafka({
  clientId: 'order-service',
  brokers: [process.env.KAFKA_BROKERS]
})
const producer = kafka.producer({ allowAutoTopicCreation: true })
const consumer = kafka.consumer({ groupId: 'order-group' })

const runKafka = async () => {
  await producer.connect()
  await consumer.connect()
  await consumer.subscribe({ topic: 'payment-topic', fromBeginning: true })

  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      const paymentEvent = JSON.parse(message.value.toString())
      console.log(`Received Payment event: ${JSON.stringify(paymentEvent)}`)

      const session = await mongoose.startSession()
      session.startTransaction()
      try {
        const order = await Order.findOne({
          orderId: paymentEvent.orderId
        }).session(session)
        if (!order) throw new Error('Order not found')

        order.status =
          paymentEvent.status === 'PaymentProcessed' ? 'Completed' : 'Failed'
        order.updatedAt = new Date()
        await order.save({ session })

        await session.commitTransaction()
        console.log(`Order ${order.orderId} updated to status: ${order.status}`)
      } catch (error) {
        await session.abortTransaction()
        console.error(`Error updating order: ${error.message}`)
      } finally {
        session.endSession()
      }
    }
  })
}

// REST API to Place an Order
app.post('/orders', async (req, res) => {
  const { userId, productId, quantity, totalPrice } = req.body
  const orderId = uuidv4()

  if (
    !userId ||
    !productId ||
    !quantity ||
    !totalPrice ||
    quantity <= 0 ||
    totalPrice <= 0
  ) {
    return res.status(400).json({ error: 'Invalid order data' })
  }

  const session = await mongoose.startSession()
  session.startTransaction()
  try {
    const order = new Order({
      orderId,
      userId,
      productId,
      quantity,
      totalPrice,
      status: 'Pending',
      createdAt: new Date(),
      updatedAt: new Date()
    })
    await order.save({ session })

    await session.commitTransaction()
    console.log(`Order ${orderId} created`)

    await producer.send({
      topic: 'order-topic',
      messages: [
        {
          value: JSON.stringify({
            orderId,
            productId,
            quantity,
            totalPrice // Gửi totalPrice để payment-service sử dụng
          })
        }
      ]
    })

    res.status(201).json({ message: 'Order placed', orderId })
  } catch (error) {
    await session.abortTransaction()
    console.error(`Error creating order: ${error.message}`)
    res.status(500).json({ error: 'Failed to place order' })
  } finally {
    session.endSession()
  }
})

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK' })
})

runKafka().catch(console.error)

const promClient = require('prom-client')
const collectDefaultMetrics = promClient.collectDefaultMetrics
collectDefaultMetrics()

const metricsMiddleware = require('express-prometheus-middleware')
app.use(
  metricsMiddleware({
    metricsPath: '/metrics',
    collectDefaultMetrics: true
  })
)

app.listen(3000, () => console.log('Order Service running on port 3000'))
