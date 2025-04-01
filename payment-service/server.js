const express = require('express')
const mongoose = require('mongoose')
const { Kafka } = require('kafkajs')
const Payment = require('./models/payment') // Import model

const app = express()
app.use(express.json())

// Kết nối MongoDB
mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
  })
  .then(() => console.log('✅ Connected to MongoDB - payment-db'))
  .catch(err => console.error('❌ MongoDB connection error:', err))

const kafka = new Kafka({
  clientId: 'payment-service',
  brokers: process.env.KAFKA_BROKERS.split(',')
})
const consumer = kafka.consumer({ groupId: 'payment-group' })
const producer = kafka.producer()

const runKafka = async () => {
  await producer.connect()
  await consumer.connect()
  await consumer.subscribe({ topic: 'inventory-topic', fromBeginning: true })

  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      const inventoryEvent = JSON.parse(message.value.toString())
      console.log(
        `📥 Received Inventory event: ${JSON.stringify(inventoryEvent)}`
      )

      if (inventoryEvent.status !== 'InventoryUpdated') return

      const session = await mongoose.startSession()
      session.startTransaction()
      try {
        console.log(`💳 Processing payment for order ${inventoryEvent.orderId}`)

        // 👉 Lưu vào MongoDB
        const payment = new Payment({
          orderId: inventoryEvent.orderId,
          amount: inventoryEvent.totalPrice, // Dùng totalPrice từ event
          status: 'Completed' // Thanh toán thành công
        })
        await payment.save({ session })

        await session.commitTransaction()
        console.log(`✅ Payment saved for order ${inventoryEvent.orderId}`)

        // Gửi event "PaymentProcessed"
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
        console.error(`❌ Error processing payment: ${error.message}`)
      } finally {
        session.endSession()
      }
    }
  })
}

app.get('/health', (req, res) => res.status(200).json({ status: 'OK' }))

runKafka().catch(console.error)

app.listen(3002, () => console.log('🚀 Payment Service running on port 3002'))
