import ArtworkVisual from './ArtworkVisual.jsx'

export default function HeroArtworkAssembly({ artworks }) {
  if (!artworks.length) return null
  return (
    <div className="hero-assembly-gallery" role="list" aria-label="기증된 핑계 작품 전시">
      {artworks.map((artwork) => (
        <div className="hero-donation" role="listitem" key={artwork.id} data-artwork-id={artwork.id}>
          <a href={`/artworks/${artwork.id}`} aria-label={`${artwork.title} 감상하기`}>
            <ArtworkVisual artwork={artwork} presentation="gallery" />
          </a>
        </div>
      ))}
    </div>
  )
}
