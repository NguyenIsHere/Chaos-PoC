const axios = require('axios')

// Địa chỉ của order-service (dùng ClusterIP trong cùng namespace)
const SERVICE_URL = 'http://order-service:3000/orders'

// Body của request
const requestBody = {
  userId: 'user123',
  productId: 'prod1',
  quantity: 2,
  totalPrice: 200
}

// Hàm gửi POST request
async function sendRequest () {
  try {
    const response = await axios.post(SERVICE_URL, requestBody, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 5000 // Timeout 5 giây
    })
    console.log(
      `[${new Date().toISOString()}] POST ${SERVICE_URL} - Status: ${
        response.status
      }`
    )
  } catch (error) {
    console.error(
      `[${new Date().toISOString()}] Error: ${
        error.message
      } - Service might be down, retrying...`
    )
  }
}

// Hàm chính: gửi request liên tục
async function main () {
  console.log(`Starting to send requests to ${SERVICE_URL}...`)

  while (true) {
    await sendRequest()
    // Ngẫu nhiên thời gian chờ giữa các request (1-5 giây)
    const delay = Math.random() * 4000 + 1000 // 1000ms đến 5000ms
    await new Promise(resolve => setTimeout(resolve, delay))
  }
}

// Chạy chương trình
main()
