import { useState, useCallback, useEffect, useMemo } from 'react'
import { MapContainer, TileLayer, Polygon, useMapEvents, useMap } from 'react-leaflet'
import * as h3 from 'h3-js'
import 'leaflet/dist/leaflet.css'
import './H3MapSelector.css'

/**
 * H3MapSelector Component
 *
 * An interactive map component that allows users to select geographic areas
 * using H3 hexagonal cells. Used for weather-based prediction markets.
 *
 * @param {Object} props
 * @param {string} props.selectedH3 - Currently selected H3 cell index
 * @param {function} props.onH3Select - Callback when an H3 cell is selected
 * @param {number} props.resolution - H3 resolution level (0-15, default 5)
 * @param {boolean} props.disabled - Whether the selector is disabled
 * @param {Object} props.initialCenter - Initial map center {lat, lng}
 */

// H3 Resolution descriptions for user guidance
const H3_RESOLUTIONS = [
  { value: 3, label: 'Continental', area: '~12,400 km2' },
  { value: 4, label: 'Regional', area: '~1,770 km2' },
  { value: 5, label: 'State/Province', area: '~253 km2' },
  { value: 6, label: 'Metro Area', area: '~36 km2' },
  { value: 7, label: 'City', area: '~5 km2' },
  { value: 8, label: 'District', area: '~0.74 km2' }
]

// Component to handle map click events
function MapClickHandler({ onMapClick, disabled }) {
  useMapEvents({
    click: (e) => {
      if (!disabled) {
        onMapClick(e.latlng)
      }
    }
  })
  return null
}

// Component to recenter map when center prop changes
function MapCenterUpdater({ center }) {
  const map = useMap()

  useEffect(() => {
    if (center) {
      map.setView([center.lat, center.lng], map.getZoom())
    }
  }, [center, map])

  return null
}

// Convert H3 cell to Leaflet polygon coordinates
function h3ToPolygon(h3Index) {
  try {
    const boundary = h3.cellToBoundary(h3Index)
    // h3-js returns [lat, lng] pairs, Leaflet expects [lat, lng]
    return boundary.map(([lat, lng]) => [lat, lng])
  } catch (error) {
    console.error('Error converting H3 to polygon:', error)
    return []
  }
}

// Get neighboring cells for visual context
function getNeighborCells(h3Index, rings = 1) {
  try {
    return h3.gridDisk(h3Index, rings)
  } catch (error) {
    console.error('Error getting neighbor cells:', error)
    return []
  }
}

function H3MapSelector({
  selectedH3 = null,
  onH3Select,
  resolution = 5,
  disabled = false,
  initialCenter = { lat: 39.8283, lng: -98.5795 }, // Default: center of USA
  showNeighbors = true,
  height = '400px',
  className = ''
}) {
  const [currentResolution, setCurrentResolution] = useState(resolution)
  const [hoveredH3, setHoveredH3] = useState(null)
  const [mapCenter, setMapCenter] = useState(initialCenter)

  // Handle map click to select H3 cell
  const handleMapClick = useCallback((latlng) => {
    if (disabled) return

    try {
      const h3Index = h3.latLngToCell(latlng.lat, latlng.lng, currentResolution)
      if (onH3Select) {
        onH3Select(h3Index)
      }
    } catch (error) {
      console.error('Error converting lat/lng to H3:', error)
    }
  }, [currentResolution, disabled, onH3Select])

  // Handle resolution change
  const handleResolutionChange = useCallback((e) => {
    const newResolution = parseInt(e.target.value, 10)
    setCurrentResolution(newResolution)

    // If there's a selected cell, recalculate at new resolution
    if (selectedH3 && onH3Select) {
      try {
        const [lat, lng] = h3.cellToLatLng(selectedH3)
        const newH3Index = h3.latLngToCell(lat, lng, newResolution)
        onH3Select(newH3Index)
      } catch (error) {
        console.error('Error recalculating H3 at new resolution:', error)
      }
    }
  }, [selectedH3, onH3Select])

  // Get polygon coordinates for selected cell
  const selectedPolygon = useMemo(() => {
    if (!selectedH3) return null
    return h3ToPolygon(selectedH3)
  }, [selectedH3])

  // Get neighbor cell polygons for visual context
  const neighborPolygons = useMemo(() => {
    if (!selectedH3 || !showNeighbors) return []
    const neighbors = getNeighborCells(selectedH3, 1)
    return neighbors
      .filter(h => h !== selectedH3)
      .map(h => ({
        h3Index: h,
        polygon: h3ToPolygon(h)
      }))
  }, [selectedH3, showNeighbors])

  // Get hovered cell polygon
  const hoveredPolygon = useMemo(() => {
    if (!hoveredH3 || hoveredH3 === selectedH3) return null
    return h3ToPolygon(hoveredH3)
  }, [hoveredH3, selectedH3])

  // Get location name from H3 (simplified - would need geocoding API for real names)
  const getLocationInfo = useCallback((h3Index) => {
    if (!h3Index) return null
    try {
      const [lat, lng] = h3.cellToLatLng(h3Index)
      const res = h3.getResolution(h3Index)
      const resInfo = H3_RESOLUTIONS.find(r => r.value === res)
      return {
        lat: lat.toFixed(4),
        lng: lng.toFixed(4),
        resolution: res,
        resolutionLabel: resInfo?.label || `Res ${res}`,
        area: resInfo?.area || 'Unknown'
      }
    } catch (error) {
      return null
    }
  }, [])

  const selectedInfo = useMemo(() => getLocationInfo(selectedH3), [selectedH3, getLocationInfo])

  // Center map on selected location
  const handleCenterOnSelection = useCallback(() => {
    if (selectedH3) {
      try {
        const [lat, lng] = h3.cellToLatLng(selectedH3)
        setMapCenter({ lat, lng })
      } catch (error) {
        console.error('Error centering on selection:', error)
      }
    }
  }, [selectedH3])

  // Clear selection
  const handleClearSelection = useCallback(() => {
    if (onH3Select) {
      onH3Select(null)
    }
  }, [onH3Select])

  return (
    <div className={`h3-map-selector ${className} ${disabled ? 'disabled' : ''}`}>
      {/* Controls */}
      <div className="h3-map-controls">
        <div className="h3-resolution-control">
          <label htmlFor="h3-resolution">Area Size:</label>
          <select
            id="h3-resolution"
            value={currentResolution}
            onChange={handleResolutionChange}
            disabled={disabled}
          >
            {H3_RESOLUTIONS.map(res => (
              <option key={res.value} value={res.value}>
                {res.label} ({res.area})
              </option>
            ))}
          </select>
        </div>

        {selectedH3 && (
          <div className="h3-selection-actions">
            <button
              type="button"
              onClick={handleCenterOnSelection}
              className="h3-btn-secondary"
              title="Center map on selection"
            >
              Center
            </button>
            <button
              type="button"
              onClick={handleClearSelection}
              className="h3-btn-clear"
              disabled={disabled}
            >
              Clear
            </button>
          </div>
        )}
      </div>

      {/* Selected Location Info */}
      {selectedH3 && selectedInfo && (
        <div className="h3-selection-info">
          <div className="h3-info-row">
            <span className="h3-info-label">H3 Cell:</span>
            <code className="h3-cell-id">{selectedH3}</code>
          </div>
          <div className="h3-info-row">
            <span className="h3-info-label">Coordinates:</span>
            <span>{selectedInfo.lat}, {selectedInfo.lng}</span>
          </div>
          <div className="h3-info-row">
            <span className="h3-info-label">Coverage:</span>
            <span>{selectedInfo.resolutionLabel} ({selectedInfo.area})</span>
          </div>
        </div>
      )}

      {/* Map Container */}
      <div className="h3-map-container" style={{ height }}>
        <MapContainer
          center={[initialCenter.lat, initialCenter.lng]}
          zoom={4}
          style={{ height: '100%', width: '100%' }}
          scrollWheelZoom={true}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          <MapClickHandler onMapClick={handleMapClick} disabled={disabled} />
          <MapCenterUpdater center={mapCenter} />

          {/* Neighbor cells (light fill) */}
          {neighborPolygons.map(({ h3Index, polygon }) => (
            <Polygon
              key={h3Index}
              positions={polygon}
              pathOptions={{
                color: '#6366f1',
                weight: 1,
                fillColor: '#6366f1',
                fillOpacity: 0.1
              }}
            />
          ))}

          {/* Hovered cell preview */}
          {hoveredPolygon && (
            <Polygon
              positions={hoveredPolygon}
              pathOptions={{
                color: '#8b5cf6',
                weight: 2,
                fillColor: '#8b5cf6',
                fillOpacity: 0.3,
                dashArray: '5, 5'
              }}
            />
          )}

          {/* Selected cell (solid fill) */}
          {selectedPolygon && (
            <Polygon
              positions={selectedPolygon}
              pathOptions={{
                color: '#10b981',
                weight: 3,
                fillColor: '#10b981',
                fillOpacity: 0.4
              }}
            />
          )}
        </MapContainer>
      </div>

      {/* Help text */}
      <div className="h3-map-help">
        <span>Click on the map to select an H3 hexagonal area for your weather market.</span>
      </div>
    </div>
  )
}

export default H3MapSelector
