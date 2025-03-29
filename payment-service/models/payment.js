const mongoose = require('mongoose')

const paymentSchema = new mongoose.Schema({
  orderId: { type: String, required: true, unique: true },
  amount: { type: Number, required: true },
  status: { type: String, enum: ['Completed', 'Failed'], required: true },
  createdAt: { type: Date, default: Date.now }
})

module.exports = mongoose.model('Payment', paymentSchema)
