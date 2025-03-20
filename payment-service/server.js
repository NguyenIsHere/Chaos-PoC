const express = require('express')
const mongoose = require('mongoose')
const { Kafka } = require('kafkajs')
const Payment = require('./models/payment')

const app = express()
app.use(express.json())

// MongoDB Atlas Connection
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log('Connected to MongoDB Atlas - payment-db'))
  .catch(err => console.error('MongoDB connection error:', err))

// Kafka Setup
const kafka = new Kafka({
  clientId: 'payment-service',
  brokers: [process.env.KAFKA_BROKERS]
})
const consumer = kafka.consumer({ groupId: 'payment-group' })
const producer = kafka.producer({ allowAutoTopicCreation: true })

const run = async () => {
  await producer.connect()
  await consumer.connect()
  await consumer.subscribe({ topic: 'inventory-topic', fromBeginning: true })

  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      const inventoryEvent = JSON.parse(message.value.toString())
      console.log(`Received Inventory event: ${JSON.stringify(inventoryEvent)}`)

      if (inventoryEvent.status !== 'InventoryUpdated') return

      const session = await mongoose.startSession()
      session.startTransaction()
      try {
        const payment = new Payment({
          orderId: inventoryEvent.orderId,
          amount: inventoryEvent.totalPrice, // Lấy totalPrice từ order-service
          status: 'Pending',
          createdAt: new Date(),
          updatedAt: new Date()
        })
        await payment.save({ session })

        // Giả lập thanh toán thành công
        payment.status = 'Completed'
        payment.updatedAt = new Date()
        await payment.save({ session })

        await session.commitTransaction()
        console.log(`Payment processed for order ${inventoryEvent.orderId}`)

        await producer.send({
          topic: 'payment-topic',
          messages: [
            {
              value: JSON.stringify({
                orderId: inventoryEvent.orderId,
                status: 'PaymentProcessed'
              })
            }
          ]
        })
      } catch (error) {
        await session.abortTransaction()
        console.error(`Error processing payment: ${error.message}`)
        await producer.send({
          topic: 'payment-topic',
          messages: [
            {
              value: JSON.stringify({
                orderId: inventoryEvent.orderId,
                status: 'PaymentFailed'
              })
            }
          ]
        })
      } finally {
        session.endSession()
      }
    }
  })
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK' })
})

run().catch(console.error)

app.listen(3002, () => console.log('Payment Service running on port 3002'))
