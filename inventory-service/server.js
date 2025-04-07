const express = require('express')
const mongoose = require('mongoose')
const { Kafka } = require('kafkajs')
const Inventory = require('./models/inventory')

const app = express()
app.use(express.json())

// MongoDB Atlas Connection
mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
  })
  .then(() => console.log('✅ Connected to MongoDB Atlas - inventory-db'))
  .catch(err => console.error('❌ MongoDB connection error:', err))

// Kafka Setup
const kafka = new Kafka({
  clientId: 'inventory-service',
  brokers: process.env.KAFKA_BROKERS.split(',')
})
const consumer = kafka.consumer({ groupId: 'inventory-group' })
const producer = kafka.producer()

const runKafka = async () => {
  await producer.connect()
  await consumer.connect()
  await consumer.subscribe({ topic: 'order-topic', fromBeginning: false })

  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      const order = JSON.parse(message.value.toString())
      console.log(`📥 Received OrderCreated event: ${JSON.stringify(order)}`)

      const session = await mongoose.startSession()
      session.startTransaction()
      try {
        const inventory = await Inventory.findOne({
          productId: order.productId
        }).session(session)

        if (!inventory || inventory.stock < order.quantity) {
          console.log(`❌ Insufficient stock for product ${order.productId}`)
          await producer.send({
            topic: 'inventory-topic',
            messages: [
              {
                value: JSON.stringify({
                  orderId: order.orderId,
                  status: 'InventoryFailed'
                })
              }
            ]
          })
          throw new Error('Insufficient stock')
        }

        inventory.stock -= order.quantity
        inventory.updatedAt = new Date()
        await inventory.save({ session })

        await session.commitTransaction()
        console.log(`✅ Inventory updated for product ${order.productId}`)

        await producer.send({
          topic: 'inventory-topic',
          messages: [
            {
              value: JSON.stringify({
                orderId: order.orderId,
                status: 'InventoryUpdated',
                totalPrice: order.totalPrice
              })
            }
          ]
        })
      } catch (error) {
        await session.abortTransaction()
        console.error(`❌ Error updating inventory: ${error.message}`)
      } finally {
        session.endSession()
      }
    }
  })
}

// API: Add product to inventory
app.post('/products', async (req, res) => {
  const { productId, stock } = req.body
  if (!productId || stock < 0) {
    return res.status(400).json({ error: 'Invalid productId or stock' })
  }

  try {
    const inventory = new Inventory({ productId, stock, updatedAt: new Date() })
    await inventory.save()
    res.status(201).json({ message: '✅ Product added', productId })
  } catch (error) {
    console.error(`❌ Error adding product: ${error.message}`)
    res.status(500).json({ error: 'Failed to add product' })
  }
})

app.get('/health', (req, res) => res.status(200).json({ status: 'OK' }))

runKafka().catch(console.error)
app.listen(3001, () => console.log('🚀 Inventory Service running on port 3001'))

process.on('SIGINT', async () => {
  console.log('👋 SIGINT received, shutting down gracefully...')
  await consumer.disconnect()
  await producer.disconnect()
  process.exit(0)
})

process.on('SIGTERM', async () => {
  console.log('👋 SIGTERM received, shutting down gracefully...')
  await consumer.disconnect()
  await producer.disconnect()
  process.exit(0)
})
