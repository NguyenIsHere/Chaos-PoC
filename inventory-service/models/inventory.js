const mongoose = require('mongoose')

const inventorySchema = new mongoose.Schema({
  productId: {
    type: String,
    required: true,
    unique: true // Đảm bảo productId là duy nhất
  },
  stock: {
    type: Number,
    required: true,
    min: 0 // Số lượng hàng không được âm
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
})

module.exports = mongoose.model('Inventory', inventorySchema)
