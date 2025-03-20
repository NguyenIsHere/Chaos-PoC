const express = require('express')
const mongoose = require('mongoose')
const { Kafka } = require('kafkajs')
const Inventory = require('./models/inventory')

const app = express()
app.use(express.json())

// MongoDB Atlas Connection
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log('Connected to MongoDB Atlas - inventory-db'))
  .catch(err => console.error('MongoDB connection error:', err))

// Kafka Setup
const kafka = new Kafka({
  clientId: 'inventory-service',
  brokers: [process.env.KAFKA_BROKERS]
})
const consumer = kafka.consumer({ groupId: 'inventory-group' })
const producer = kafka.producer({ allowAutoTopicCreation: true })

const run = async () => {
  await producer.connect()
  await consumer.connect()
  await consumer.subscribe({ topic: 'order-topic', fromBeginning: true })

  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      const order = JSON.parse(message.value.toString())
      console.log(`Received OrderCreated event: ${JSON.stringify(order)}`)

      const session = await mongoose.startSession()
      session.startTransaction()
      try {
        const inventory = await Inventory.findOne({
          productId: order.productId
        }).session(session)
        if (!inventory || inventory.stock < order.quantity) {
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
        console.log(`Inventory updated for product ${order.productId}`)

        await producer.send({
          topic: 'inventory-topic',
          messages: [
            {
              value: JSON.stringify({
                orderId: order.orderId,
                productId: order.productId,
                quantity: order.quantity,
                totalPrice: order.totalPrice, // Thêm totalPrice vào message
                status: 'InventoryUpdated'
              })
            }
          ]
        })
      } catch (error) {
        await session.abortTransaction()
        console.error(`Error updating inventory: ${error.message}`)
      } finally {
        session.endSession()
      }
    }
  })
}

// Endpoint để thêm sản phẩm vào kho
app.post('/products', async (req, res) => {
  const { productId, stock } = req.body

  if (!productId || !stock || stock < 0) {
    return res.status(400).json({ error: 'Invalid productId or stock' })
  }

  const session = await mongoose.startSession()
  session.startTransaction()
  try {
    const existingProduct = await Inventory.findOne({ productId }).session(
      session
    )
    if (existingProduct) {
      return res.status(400).json({ error: 'Product already exists' })
    }

    const inventory = new Inventory({
      productId,
      stock,
      updatedAt: new Date()
    })
    await inventory.save({ session })

    await session.commitTransaction()
    res.status(201).json({ message: 'Product added', productId })
  } catch (error) {
    await session.abortTransaction()
    console.error(`Error adding product: ${error.message}`)
    res.status(500).json({ error: 'Failed to add product' })
  } finally {
    session.endSession()
  }
})

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK' })
})

run().catch(console.error)

app.listen(3001, () => console.log('Inventory Service running on port 3001'))
