const mongoose = require('mongoose')

const paymentSchema = new mongoose.Schema({
  orderId: {
    type: String,
    required: true,
    unique: true // Đảm bảo mỗi đơn hàng chỉ có một bản ghi thanh toán
  },
  amount: {
    type: Number,
    required: true,
    min: 0 // Giá trị không được âm
  },
  status: {
    type: String,
    required: true,
    enum: ['Pending', 'Completed', 'Failed'], // Các trạng thái hợp lệ
    default: 'Pending'
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
})

module.exports = mongoose.model('Payment', paymentSchema)
