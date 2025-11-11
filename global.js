import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';
import * as topojson from 'https://cdn.jsdelivr.net/npm/topojson-client@3/+esm';

const width = 960;
const height = 600;

const svg = d3.select("#map").attr("width", width).attr("height", height);
const g = svg.append('g');

const projection = d3.geoMercator().scale(140).translate([width/2, height/1.5]);
const path = d3.geoPath(projection);

const tooltip = d3.select("#tooltip")
    .style("position", "absolute")
    .style("background", "rgba(0, 0, 0, 0.8)")
    .style("color", "white")
    .style("padding", "10px")
    .style("border-radius", "5px")
    .style("pointer-events", "none")
    .style("opacity", 0)
    .style("font-size", "12px");

// Vars to store data
let worldData = null;
let csvData = {};
let currentYear = 1850;
let colorScale = null;

// Load CSV temp data
Promise.all([
    d3.json('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json'),
    d3.csv('data/cmip6_tas_country_annual.csv')]).then(([world, csv]) => {
        worldData = world;

        csv.forEach(d => {
            const year = +d.year;
            const isoCode = String(d.iso_num);
            const value = d.avg_temp_absolute ? +d.avg_temp_absolute : null;
            
            if (!csvData[year]) {
                csvData[year] = {};
            }
            
            if (value !== null && !isNaN(value)) {
                csvData[year][isoCode] = {
                    country: d.country,
                    value: value,
                    change: d.avg_temp_change ? +d.avg_temp_change : null
                };
            }
        });
    
        const allValues = csv.filter(d => d.avg_temp_absolute).map(d => +d.avg_temp_absolute);
        const minValue = d3.min(allValues);
        const maxValue = d3.max(allValues);
        
        // Color scale (reversed so red = hot, blue = cold)
        colorScale = d3.scaleSequential(d3.interpolateRdYlBu).domain([maxValue, minValue]);
        
        drawMap(currentYear);
        drawLegend();
        
        const yearSlider = d3.select("#yearSlider");
        const yearValue = d3.select("#yearValue");
        
        yearSlider.on("input", function() {
            currentYear = +this.value;
            yearValue.text(currentYear);
            drawMap(currentYear);
        });
    }
);

function drawLegend() {
    if (!colorScale) return;
    
    const legendWidth = 300;
    const legendHeight = 20;
    const legendX = width - legendWidth - 20;
    const legendY = height - 40;
    
    const legend = svg.append("g")
        .attr("class", "legend")
        .attr("transform", `translate(${legendX}, ${legendY})`);
    
    const legendScale = d3.scaleLinear()
        .domain(colorScale.domain())
        .range([0, legendWidth]);
    
    const legendAxis = d3.axisBottom(legendScale)
        .ticks(5)
        .tickFormat(d => d.toFixed(1) + "°C");
    
    // Gradient for legend
    const gradient = legend.append("defs")
        .append("linearGradient")
        .attr("id", "legend-gradient")
        .attr("x1", "0%")
        .attr("x2", "100%");
    
    const numStops = 10;
    const domain = colorScale.domain();
    for (let i = 0; i <= numStops; i++) {
        const value = d3.interpolateNumber(domain[0], domain[1])(i / numStops);
        gradient.append("stop")
            .attr("offset", `${(i / numStops) * 100}%`)
            .attr("stop-color", colorScale(value));
    }
    
    legend.append("rect")
        .attr("width", legendWidth)
        .attr("height", legendHeight)
        .style("fill", "url(#legend-gradient)")
        .style("stroke", "#000")
        .style("stroke-width", 1);
    
    legend.append("g")
        .attr("transform", `translate(0, ${legendHeight})`)
        .call(legendAxis);
    
    legend.append("text")
        .attr("x", legendWidth / 2)
        .attr("y", -5)
        .style("text-anchor", "middle")
        .style("font-size", "12px")
        .style("font-weight", "bold")
        .text("Average Temperature (°C)");
}

function drawMap(year) {
    if (!worldData) return;
    
    const countries = topojson.feature(worldData, worldData.objects.countries);
    const yearData = csvData[year] || {};

    const countriesPath = g.selectAll('path.country').data(countries.features);
    
    countriesPath.exit().remove();
    
    const countriesEnter = countriesPath.enter()
        .append('path')
        .attr('class', 'country')
        .attr('d', path)
        .style("cursor", "pointer");
    
    const countriesUpdate = countriesEnter.merge(countriesPath).attr('d', path).attr('fill', d => {
            const isoCode = String(d.id);
            const data = yearData[isoCode];
            
            if (data && data.value !== null && colorScale) {
                const color = colorScale(data.value);
                return color;
            }
            return '#ccc';
        }).attr('stroke', '#fff').attr('stroke-width', 0.5)
        .on('mouseover', function(event, d) {
            const isoCode = String(d.id);
            const data = yearData[isoCode];
            
            d3.select(this).attr('stroke', '#000').attr('stroke-width', 2);

            if (data) {
                tooltip
                    .style('opacity', 1)
                    .html(`
                        <strong>${data.country}</strong><br/>
                        Year: ${year}<br/>
                        Temperature: ${data.value.toFixed(2)}°C
                        ${data.change !== null ? `<br/>Change: ${data.change > 0 ? '+' : ''}${data.change.toFixed(2)}°C` : ''}
                    `)
                    .style('left', (event.pageX + 10) + 'px')
                    .style('top', (event.pageY - 10) + 'px');
            } else {
                tooltip
                    .style('opacity', 1)
                    .html(`
                        <strong>${d.properties.name || 'Unknown'}</strong><br/>
                        Year: ${year}<br/>
                        No data available
                    `)
                    .style('left', (event.pageX + 10) + 'px')
                    .style('top', (event.pageY - 10) + 'px');
            }
        })
        .on('mousemove', function(event) {
            tooltip
                .style('left', (event.pageX + 10) + 'px')
                .style('top', (event.pageY - 10) + 'px');
        })
        .on('mouseout', function() {
            d3.select(this)
                .attr('stroke', '#fff')
                .attr('stroke-width', 0.5);
            tooltip.style('opacity', 0);
        })
        .on('click', function(event, d) {
            const isoCode = String(d.id);
            const data = yearData[isoCode];
            
            // TODO 
        });
}


