import Tesseract from 'tesseract.js'

export interface OcrProgressUpdate {
  progress: number // 0 - 100
  status: string
}

/**
 * Perform Optical Character Recognition (OCR) directly in the browser
 * to extract raw text from an uploaded veterinary prescription, discharge summary,
 * or medication label photo.
 */
export async function extractTextFromPrescriptionImage(
  imageSource: File | string,
  onProgress?: (update: OcrProgressUpdate) => void
): Promise<string> {
  try {
    const result = await Tesseract.recognize(imageSource, 'eng', {
      logger: (m) => {
        if (onProgress) {
          const pct = Math.round((m.progress || 0) * 100)
          let friendlyStatus = 'Processing image...'
          if (m.status === 'loading tesseract core') friendlyStatus = 'Loading OCR engine...'
          else if (m.status === 'initializing tesseract') friendlyStatus = 'Initializing scanner...'
          else if (m.status === 'recognizing text') friendlyStatus = `Recognizing prescription text (${pct}%)...`
          else if (m.status) friendlyStatus = `${m.status}...`

          onProgress({ progress: pct, status: friendlyStatus })
        }
      },
    })

    return (result.data.text || '').trim()
  } catch (error) {
    console.error('OCR Error during prescription extraction:', error)
    throw new Error('Could not read text from this image. Please check image quality or type instructions manually.')
  }
}

/**
 * Intelligent post-processing to clean up common OCR artifact errors
 * in medical & veterinary prescription printouts.
 */
export function cleanPrescriptionOcrText(rawText: string): string {
  if (!rawText) return ''

  return rawText
    // Normalize line breaks
    .replace(/\r\n/g, '\n')
    // Remove stray OCR noise characters
    .replace(/[|~_`^]/g, ' ')
    // Fix common medication shorthand spacing: "1tab" -> "1 tab", "500mg" -> "500 mg"
    .replace(/(\d+)(tab|cap|pill|mg|ml|cc|drop|tablets|capsules|drops)\b/gi, '$1 $2')
    // Fix common OCR misreads in frequency: "b.i.d" -> "bid", "t.i.d" -> "tid"
    .replace(/\bb\.i\.d\.?\b/gi, 'twice daily')
    .replace(/\bt\.i\.d\.?\b/gi, 'three times daily')
    .replace(/\bq\.d\.?\b/gi, 'once daily')
    .replace(/\bprn\b/gi, 'as needed')
    // Clean multiple spaces
    .replace(/[ \t]+/g, ' ')
    .trim()
}
