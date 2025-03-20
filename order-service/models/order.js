const mongoose = require('mongoose')

const orderSchema = new mongoose.Schema({
  orderId: {
    type: String,
    required: true,
    unique: true // Đảm bảo orderId là duy nhất
  },
  userId: {
    type: String,
    required: true
  },
  productId: {
    type: String,
    required: true
  },
  quantity: {
    type: Number,
    required: true,
    min: 1 // Số lượng phải lớn hơn 0
  },
  totalPrice: {
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

module.exports = mongoose.model('Order', orderSchema)
