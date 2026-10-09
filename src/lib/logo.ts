const LOGO_URL = '/nor-spedition-logo.png'

let cachedDataUrl: string | null = null

/** Load brand logo as a data URL (for PDF / canvas). */
export async function loadLogoDataUrl(): Promise<string> {
  if (cachedDataUrl) return cachedDataUrl
  const res = await fetch(LOGO_URL)
  if (!res.ok) throw new Error('Kunne ikke hente logo')
  const blob = await res.blob()
  cachedDataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Logo-læsning fejlede'))
    reader.readAsDataURL(blob)
  })
  return cachedDataUrl
}

export { LOGO_URL }
