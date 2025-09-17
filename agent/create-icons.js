const fs = require('fs')
const { createCanvas } = require('canvas')

// Create icons of different sizes
const sizes = [16, 48, 128]

// Create directory if it doesn't exist
if (!fs.existsSync('./assets')) {
  fs.mkdirSync('./assets')
}

// Generate icons
sizes.forEach(size => {
  const canvas = createCanvas(size, size)
  const ctx = canvas.getContext('2d')
  
  // Fill background
  ctx.fillStyle = '#0066cc'
  ctx.fillRect(0, 0, size, size)
  
  // Add text
  ctx.fillStyle = 'white'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  
  // Adjust font size based on icon size
  const fontSize = Math.max(size / 2, 8)
  ctx.font = `bold ${fontSize}px Arial`
  
  // Draw the text
  ctx.fillText('PM', size / 2, size / 2)
  
  // Save the icon
  const buffer = canvas.toBuffer('image/png')
  fs.writeFileSync(`./assets/icon${size}.png`, buffer)
  
  console.log(`Created icon${size}.png`)
})

console.log('Icon generation complete')
