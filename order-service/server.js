const express = require('express')
const mongoose = require('mongoose')
const { Kafka } = require('kafkajs')
const { v4: uuidv4 } = require('uuid')
const Order = require('./models/order')

const app = express()
app.use(express.json())

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log('✅ Connected to MongoDB Atlas - order-db'))
  .catch(err => console.error('❌ MongoDB connection error:', err))

const kafka = new Kafka({
  clientId: 'order-service',
  brokers: process.env.KAFKA_BROKERS.split(',')
})
const producer = kafka.producer()
const consumer = kafka.consumer({ groupId: 'order-group' })

const runKafka = async () => {
  await producer.connect()
  await consumer.connect()
  await consumer.subscribe({ topic: 'inventory-topic', fromBeginning: false })
  await consumer.subscribe({ topic: 'payment-topic', fromBeginning: false })

  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      const event = JSON.parse(message.value.toString())
      console.log(`📥 Received event from ${topic}: ${JSON.stringify(event)}`)

      const session = await mongoose.startSession()
      session.startTransaction()
      try {
        const order = await Order.findOne({ orderId: event.orderId }).session(
          session
        )
        if (!order) throw new Error('Order not found')

        // 📌 Xử lý khi inventory thất bại
        if (event.status === 'InventoryFailed') {
          order.status = 'Failed'
          console.log(
            `❌ Order ${order.orderId} failed due to insufficient stock`
          )
        }

        // 📌 Xử lý khi payment hoàn tất
        if (event.status === 'PaymentProcessed') {
          order.status = 'Completed'
          console.log(`✅ Order ${order.orderId} is completed`)
        }

        order.updatedAt = new Date()
        await order.save({ session })
        await session.commitTransaction()
      } catch (error) {
        await session.abortTransaction()
        console.error(`❌ Error updating order: ${error.message}`)
      } finally {
        session.endSession()
      }
    }
  })
}

app.post('/orders', async (req, res) => {
  const { userId, productId, quantity, totalPrice } = req.body
  const orderId = uuidv4()

  if (!userId || !productId || quantity <= 0 || totalPrice <= 0) {
    return res.status(400).json({ error: 'Invalid order data' })
  }

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
    await order.save()

    await producer.send({
      topic: 'order-topic',
      messages: [
        { value: JSON.stringify({ orderId, productId, quantity, totalPrice }) }
      ]
    })
    res.status(201).json({ message: '✅ Order placed', orderId })
  } catch (error) {
    console.error(`❌ Error creating order: ${error.message}`)
    res.status(500).json({ error: 'Failed to place order' })
  }
})

app.get('/health', (req, res) => res.status(200).json({ status: 'OK' }))

runKafka().catch(console.error)

app.listen(3000, () => console.log('🚀 Order Service running on port 3000'))
