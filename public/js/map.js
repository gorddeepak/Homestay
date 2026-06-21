const map = new maplibregl.Map({
    container: 'map',
    style: `https://api.maptiler.com/maps/streets/style.json?key=${mapToken}`,
    center: coordinates,
    zoom: 9
});

new maplibregl.Marker()
    .setLngLat(coordinates)
    .addTo(map);