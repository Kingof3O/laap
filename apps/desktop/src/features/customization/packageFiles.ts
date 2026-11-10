export function readFileBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error)
    reader.onload = () => {
      if (typeof reader.result !== 'string') return reject(new Error('Could not read file.'))
      resolve(reader.result.split(',')[1] ?? '')
    }
    reader.readAsDataURL(file)
  })
}
