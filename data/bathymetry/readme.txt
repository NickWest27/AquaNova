Workflow:
download geoTIFF from GEBCO in 10x10 increments
import into QGIS-LTR and extract 10, 100, 500, and 1000 contours, 
export as geojson
import each file into mapshaper
simplify the 100 and 10m to 30% and 20% or more depending on size, "prevent shape removal"
in console filter for elevations less than 0 and remove any null points

filter 'ELEV <= 0' remove-empty

export as geojson with command line options.

extension='.geojson' precision=0.00001

save to /bathymetry file.
ensure tile is included in code.