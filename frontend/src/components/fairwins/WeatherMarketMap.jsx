import { useState, useMemo, useCallback } from 'react'
import { MapContainer, TileLayer, Polygon, Popup, useMap } from 'react-leaflet'
import * as h3 from 'h3-js'
import 'leaflet/dist/leaflet.css'
import './WeatherMarketMap.css'

/**
 * WeatherMarketMap Component
 *
 * Displays weather prediction markets on an interactive map using H3 hexagons.
 * Users can click on hexagons to view market details.
 *
 * @param {Object} props
 * @param {Array} props.markets - Array of weather market objects with h3Index
 * @param {function} props.onMarketClick - Callback when a market is clicked
 * @param {Object} props.selectedMarket - Currently selected market
 * @param {boolean} props.loading - Whether markets are loading
 */

// Helper to convert H3 cell to Leaflet polygon coordinates
function h3ToPolygon(h3Index) {
  try {
    const boundary = h3.cellToBoundary(h3Index)
    return boundary.map(([lat, lng]) => [lat, lng])
  } catch (error) {
    console.error('Error converting H3 to polygon:', error)
    return []
  }
}

// Get center of H3 cell
function h3ToCenter(h3Index) {
  try {
    return h3.cellToLatLng(h3Index)
  } catch (error) {
    console.error('Error getting H3 center:', error)
    return [0, 0]
  }
}

// Get color based on market probability
function getMarketColor(passTokenPrice) {
  const probability = parseFloat(passTokenPrice) || 0.5
  if (probability >= 0.66) return '#10b981' // Green - high probability
  if (probability >= 0.33) return '#3b82f6' // Blue - medium probability
  return '#ef4444' // Red - low probability
}

// Map bounds fitting component
function FitBoundsToMarkets({ markets }) {
  const map = useMap()

  useMemo(() => {
    if (markets.length === 0) return

    const validMarkets = markets.filter(m => m.h3Index)
    if (validMarkets.length === 0) return

    const bounds = validMarkets.map(m => h3ToCenter(m.h3Index))
    if (bounds.length > 0) {
      try {
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 6 })
      } catch (error) {
        console.error('Error fitting bounds:', error)
      }
    }
  }, [markets, map])

  return null
}

function WeatherMarketMap({
  markets = [],
  onMarketClick,
  selectedMarket = null,
  loading = false,
  height = '500px',
  className = ''
}) {
  const [hoveredMarket, setHoveredMarket] = useState(null)

  // Filter markets that have H3 coordinates
  const weatherMarketsWithH3 = useMemo(() => {
    return markets.filter(m => m.h3Index || m.properties?.h3_index)
  }, [markets])

  // Build polygon data for each market
  const marketPolygons = useMemo(() => {
    return weatherMarketsWithH3.map(market => {
      const h3Index = market.h3Index || market.properties?.h3_index
      return {
        market,
        h3Index,
        polygon: h3ToPolygon(h3Index),
        center: h3ToCenter(h3Index),
        color: getMarketColor(market.passTokenPrice)
      }
    })
  }, [weatherMarketsWithH3])

  // Handle market click
  const handlePolygonClick = useCallback((market) => {
    if (onMarketClick) {
      onMarketClick(market)
    }
  }, [onMarketClick])

  // Format time remaining
  const formatTimeRemaining = (endTime) => {
    if (!endTime) return 'Unknown'
    const now = new Date()
    const end = new Date(endTime)
    const diff = end - now
    if (diff <= 0) return 'Ended'
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))
    if (days > 0) return `${days}d remaining`
    const hours = Math.floor(diff / (1000 * 60 * 60))
    return `${hours}h remaining`
  }

  if (loading) {
    return (
      <div className={`weather-market-map ${className}`} style={{ height }}>
        <div className="weather-map-loading">
          <div className="weather-map-spinner" />
          <span>Loading weather markets...</span>
        </div>
      </div>
    )
  }

  if (weatherMarketsWithH3.length === 0) {
    return (
      <div className={`weather-market-map ${className}`} style={{ height }}>
        <div className="weather-map-empty">
          <span className="weather-map-empty-icon">🌍</span>
          <h3>No Weather Markets</h3>
          <p>There are no weather markets with location data to display.</p>
        </div>
      </div>
    )
  }

  return (
    <div className={`weather-market-map ${className}`}>
      {/* Map Legend */}
      <div className="weather-map-legend">
        <span className="legend-title">Probability:</span>
        <div className="legend-items">
          <div className="legend-item">
            <span className="legend-color" style={{ background: '#10b981' }} />
            <span>High (66%+)</span>
          </div>
          <div className="legend-item">
            <span className="legend-color" style={{ background: '#3b82f6' }} />
            <span>Medium (33-66%)</span>
          </div>
          <div className="legend-item">
            <span className="legend-color" style={{ background: '#ef4444' }} />
            <span>Low (&lt;33%)</span>
          </div>
        </div>
      </div>

      {/* Map Stats */}
      <div className="weather-map-stats">
        <span>{weatherMarketsWithH3.length} weather markets</span>
      </div>

      {/* Map Container */}
      <div className="weather-map-container" style={{ height }}>
        <MapContainer
          center={[39.8283, -98.5795]}
          zoom={4}
          style={{ height: '100%', width: '100%' }}
          scrollWheelZoom={true}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          <FitBoundsToMarkets markets={weatherMarketsWithH3} />

          {/* Render market polygons */}
          {marketPolygons.map(({ market, h3Index, polygon, color }) => {
            const isSelected = selectedMarket?.id === market.id
            const isHovered = hoveredMarket?.id === market.id

            return (
              <Polygon
                key={market.id}
                positions={polygon}
                pathOptions={{
                  color: isSelected ? '#fbbf24' : color,
                  weight: isSelected ? 4 : isHovered ? 3 : 2,
                  fillColor: color,
                  fillOpacity: isSelected ? 0.6 : isHovered ? 0.5 : 0.35
                }}
                eventHandlers={{
                  click: () => handlePolygonClick(market),
                  mouseover: () => setHoveredMarket(market),
                  mouseout: () => setHoveredMarket(null)
                }}
              >
                <Popup>
                  <div className="weather-market-popup">
                    <h4 className="popup-title">{market.proposalTitle}</h4>
                    <div className="popup-stats">
                      <div className="popup-stat">
                        <span className="popup-label">YES:</span>
                        <span className="popup-value" style={{ color: '#10b981' }}>
                          {(parseFloat(market.passTokenPrice) * 100).toFixed(0)}%
                        </span>
                      </div>
                      <div className="popup-stat">
                        <span className="popup-label">NO:</span>
                        <span className="popup-value" style={{ color: '#ef4444' }}>
                          {(parseFloat(market.failTokenPrice) * 100).toFixed(0)}%
                        </span>
                      </div>
                    </div>
                    <div className="popup-meta">
                      <span>{formatTimeRemaining(market.tradingEndTime)}</span>
                      <span>Liquidity: ${parseFloat(market.totalLiquidity).toLocaleString()}</span>
                    </div>
                    <button
                      className="popup-view-btn"
                      onClick={() => handlePolygonClick(market)}
                    >
                      View Market
                    </button>
                  </div>
                </Popup>
              </Polygon>
            )
          })}
        </MapContainer>
      </div>
    </div>
  )
}

export default WeatherMarketMap
