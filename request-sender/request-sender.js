const axios = require('axios')

// Địa chỉ của order-service (dùng ClusterIP trong cùng namespace)
const SERVICE_URL = 'http://order-service:3000/orders'

const requestBody = {
  userId: 'user123',
  productId: 'prod1',
  quantity: 2,
  totalPrice: 200
}

async function sendRequest () {
  try {
    const response = await axios.post(SERVICE_URL, requestBody, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 5000
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

async function main () {
  console.log(`Starting to send requests to ${SERVICE_URL}...`)

  while (true) {
    await sendRequest()
    const delay = 5000 // 5000ms
    await new Promise(resolve => setTimeout(resolve, delay))
  }
}

main()
