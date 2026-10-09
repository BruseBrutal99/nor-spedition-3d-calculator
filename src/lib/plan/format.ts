/** Danish number/date formatting for load plans */

export function fmt(n: number, digits = 0): string {
  return n.toLocaleString('da-DK', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

/** `09.10.2026 kl. 19.43` */
export function fmtDateTime(iso: string): string {
  const d = new Date(iso)
  const date = d.toLocaleDateString('da-DK', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
  const time = d.toLocaleTimeString('da-DK', {
    hour: '2-digit',
    minute: '2-digit',
  })
  return `${date} kl. ${time}`
}

export function fmtDateOnly(iso: string): string {
  return new Date(iso).toLocaleDateString('da-DK', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

/** 1,2,3,5 → "1–3, 5" */
export function formatRanges(nums: number[]): string {
  if (!nums.length) return ''
  const a = [...nums].sort((x, y) => x - y)
  const parts: string[] = []
  let start = a[0]
  let prev = a[0]
  for (let i = 1; i < a.length; i++) {
    const v = a[i]
    if (v === prev + 1) {
      prev = v
      continue
    }
    parts.push(start === prev ? `${start}` : `${start}–${prev}`)
    start = prev = v
  }
  parts.push(start === prev ? `${start}` : `${start}–${prev}`)
  return parts.join(', ')
}
