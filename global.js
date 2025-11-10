import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';

// Set up dimensions
const width = 960;
const height = 600;

const svg = d3.select("#map").attr("width", width).attr("height", height);
const g = svg.append('g');

const projection = d3.geoMercator().scale(140).translate([width/2, height/1.5]);
const path = d3.geoPath(projection);

d3.json('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json')
  .then(data => {
    const countries = topojson.feature(data, data.objects.countries);
    console.log(countries);
    g.selectAll('path')
      .data(countries.features)
      .enter()
      .append('path')
      .attr('class', 'country')
      .attr('d', path);
  });


