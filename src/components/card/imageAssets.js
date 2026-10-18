import manifest from '../../../data/image-manifest.json'

// Source URLs remain in card data as provenance. Only local derivatives are
// requested by the browser; Vite supplies the correct root for GitHub Pages.
export function getImageUrl(source) {
  if (!source) return undefined
  const image = manifest.images[source]
  if (image) return `${import.meta.env.BASE_URL}${image.path}`
  // Permit explicit local artwork while preventing accidental CDN requests.
  return /^https?:\/\//.test(source) ? undefined : source
}
